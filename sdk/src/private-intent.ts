import { utils } from "@noble/secp256k1";
import type { StacksNetwork } from "@stacks/network";
import { createStealthIntent, signStealthIntent } from "./stealth-intent";
import {
  fetchStealthKeys,
  type StealthRegistryRecord,
} from "./registry/stealth";
import { deriveStealthForSender } from "./stealth/derivation";
import { stealthPublicKeyToAddress } from "./stealth/address";
import { encryptStealthNote } from "./stealth/encryption";
import type { StealthAnnouncementPayload } from "./stealth/announcement";
import { randomNonce } from "./intent";
import type { Network } from "./crypto";
import type { SignedStealthIntent } from "./types";
import { bytesToHex } from "@stacks/common";

export type SettlementFeeMode = "included" | "added";

export interface SettlementFeeQuote {
  /** Amount typed by Alice before choosing how the fee is applied. */
  enteredAmount: bigint;
  /** Total removed from Alice's router deposit. */
  totalAmount: bigint;
  /** Exact amount delivered to the one-time stealth address. */
  recipientAmount: bigint;
  settlementFee: bigint;
  feeBps: bigint;
  feeMode: SettlementFeeMode;
}

export interface CreatePrivateIntentOptions {
  registry: string;
  recipient: string;
  network: Network;
  /** Optional configured network object, useful when using a custom Stacks API URL. */
  registryNetwork?: StacksNetwork;
  /** Optional previously resolved record; omitted by normal callers so the SDK fetches it. */
  recipientKeys?: StealthRegistryRecord;
  router: string;
  asset: string;
  relayer: string;
  enteredAmount: bigint;
  settlementFeeBps: bigint;
  feeMode: SettlementFeeMode;
  expiry: number;
  payerPrivateKey: string;
  nonce?: bigint;
  note?: Uint8Array | string;
  /** Test/vector override. Production callers should let the SDK generate fresh entropy. */
  ephemeralPrivateKey?: Uint8Array;
}

export interface PrivateIntentResult {
  intent: SignedStealthIntent;
  announcement: StealthAnnouncementPayload;
  quote: SettlementFeeQuote;
}

/** JSON-safe public envelope accepted by the reference relayer's settlement endpoint. */
export interface PrivateIntentEnvelope {
  kind: "stealth";
  network: Network;
  asset: string;
  amount: string;
  recipient: string;
  relayer: string;
  relayerFee: string;
  nonce: string;
  expiry: number;
  user: string;
  intentHash: string;
  digest: string;
  userSig: string;
  announcement: {
    version: number;
    stealthPrincipal: string;
    ephemeralPublicKey: string;
    nonce: string;
    ciphertext: string;
    asset: string;
    registryEpoch: string;
    hash: string;
  };
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Calculate the two user-facing settlement modes without floating-point arithmetic.
 * The fee is rounded up to the smallest token unit so a displayed positive fee never
 * becomes zero during integer conversion.
 */
export function quoteSettlementFee(options: {
  amount: bigint;
  feeBps: bigint;
  mode: SettlementFeeMode;
}): SettlementFeeQuote {
  if (options.amount <= 0n) throw new Error("settlement amount must be positive");
  if (options.feeBps < 0n || options.feeBps > 10_000n) {
    throw new Error("settlement fee must be between 0 and 10000 bps");
  }
  const settlementFee =
    options.feeBps === 0n ? 0n : ceilDiv(options.amount * options.feeBps, 10_000n);
  if (options.mode === "included") {
    if (settlementFee >= options.amount) {
      throw new Error("fee-inclusive amount must leave a positive recipient payment");
    }
    return {
      enteredAmount: options.amount,
      totalAmount: options.amount,
      recipientAmount: options.amount - settlementFee,
      settlementFee,
      feeBps: options.feeBps,
      feeMode: options.mode,
    };
  }
  if (options.mode !== "added") throw new Error("unsupported settlement fee mode");
  return {
    enteredAmount: options.amount,
    totalAmount: options.amount + settlementFee,
    recipientAmount: options.amount,
    settlementFee,
    feeBps: options.feeBps,
    feeMode: options.mode,
  };
}

/**
 * Resolve Bob's registered P/V from his normal address and return a fully signed M2
 * intent. Alice's ephemeral scalar is used only while deriving/encrypting and is wiped
 * before return; the result contains only the public R announcement value.
 */
export async function createPrivateIntent(
  options: CreatePrivateIntentOptions
): Promise<PrivateIntentResult> {
  if (!Number.isSafeInteger(options.expiry) || options.expiry <= 0) {
    throw new Error("intent expiry must be a positive safe integer");
  }
  const registered =
    options.recipientKeys ??
    (await fetchStealthKeys({
      registry: options.registry,
      user: options.recipient,
      network: options.registryNetwork ?? options.network,
    }));
  if (!registered) throw new Error("recipient has no registered Privara stealth keys");

  const quote = quoteSettlementFee({
    amount: options.enteredAmount,
    feeBps: options.settlementFeeBps,
    mode: options.feeMode,
  });
  const ephemeralPrivateKey = new Uint8Array(
    options.ephemeralPrivateKey ?? utils.randomPrivateKey()
  );
  try {
    const derived = deriveStealthForSender(
      registered.spendingPublicKey,
      registered.viewingPublicKey,
      ephemeralPrivateKey
    );
    const stealthPrincipal = stealthPublicKeyToAddress(derived.stealthPublicKey, options.network);
    const context = {
      network: options.network,
      router: options.router,
      stealthPrincipal,
      asset: options.asset,
      registryEpoch: registered.epoch,
    };
    const note =
      options.note instanceof Uint8Array
        ? options.note
        : new TextEncoder().encode(
            options.note ?? JSON.stringify({ protocol: "privara", version: 1, type: "stealth-payment" })
          );
    const encrypted = await encryptStealthNote(
      note,
      registered.viewingPublicKey,
      ephemeralPrivateKey,
      context
    );
    const announcement: StealthAnnouncementPayload = {
      version: 1,
      stealthPrincipal,
      ephemeralPublicKey: derived.ephemeralPublicKey,
      nonce: encrypted.nonce,
      ciphertext: encrypted.ciphertext,
      asset: options.asset,
      registryEpoch: registered.epoch,
    };
    const intent = signStealthIntent(
      createStealthIntent(
        {
          asset: options.asset,
          amount: quote.totalAmount,
          recipient: stealthPrincipal,
          relayer: options.relayer,
          relayerFee: quote.settlementFee,
          nonce: options.nonce ?? randomNonce(),
          expiry: options.expiry,
        },
        announcement
      ),
      options.payerPrivateKey,
      options.network,
      options.router
    );
    return { intent, announcement, quote };
  } finally {
    ephemeralPrivateKey.fill(0);
  }
}

/** Remove bigint/byte-array values so the signed public request can be sent as JSON. */
export function privateIntentEnvelope(
  result: PrivateIntentResult,
  network: Network
): PrivateIntentEnvelope {
  const { intent, announcement } = result;
  return {
    kind: "stealth",
    network,
    asset: intent.asset,
    amount: intent.amount.toString(),
    recipient: intent.recipient,
    relayer: intent.relayer,
    relayerFee: intent.relayerFee.toString(),
    nonce: intent.nonce.toString(),
    expiry: intent.expiry,
    user: intent.user,
    intentHash: bytesToHex(intent.intentHash),
    digest: bytesToHex(intent.digest),
    userSig: bytesToHex(intent.userSig),
    announcement: {
      version: announcement.version,
      stealthPrincipal: announcement.stealthPrincipal,
      ephemeralPublicKey: bytesToHex(announcement.ephemeralPublicKey),
      nonce: bytesToHex(announcement.nonce),
      ciphertext: bytesToHex(announcement.ciphertext),
      asset: announcement.asset,
      registryEpoch: announcement.registryEpoch.toString(),
      hash: bytesToHex(intent.announcementHash),
    },
  };
}
