import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@stacks/common";
import {
  Cl,
  getAddressFromPrivateKey,
  serializeCVBytes,
  signMessageHashRsv,
} from "@stacks/transactions";
import { CHAIN_ID, type Network } from "./crypto";
import {
  hashStealthAnnouncement,
  validateStealthAnnouncement,
  type StealthAnnouncementPayload,
} from "./stealth/announcement";
import type { Intent, SignedStealthIntent, StealthIntent } from "./types";

export const STEALTH_INTENT_VERSION = 2 as const;
const STRUCTURED_DATA_PREFIX = new Uint8Array([0x53, 0x49, 0x50, 0x30, 0x31, 0x38]);

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(arrays.reduce((sum, item) => sum + item.length, 0));
  let offset = 0;
  for (const item of arrays) {
    output.set(item, offset);
    offset += item.length;
  }
  return output;
}

function validateAnnouncementHash(hash: Uint8Array): void {
  if (hash.length !== 32) throw new Error("announcement hash must be 32 bytes");
}

function stealthIntentTupleCV(intent: StealthIntent) {
  validateAnnouncementHash(intent.announcementHash);
  return Cl.tuple({
    asset: Cl.principal(intent.asset),
    amount: Cl.uint(intent.amount),
    recipient: Cl.principal(intent.recipient),
    relayer: Cl.principal(intent.relayer),
    "relayer-fee": Cl.uint(intent.relayerFee),
    nonce: Cl.uint(intent.nonce),
    expiry: Cl.uint(intent.expiry),
    "announcement-hash": Cl.buffer(intent.announcementHash),
  });
}

export function createStealthIntent(
  intent: Intent,
  announcement: StealthAnnouncementPayload
): StealthIntent {
  validateStealthAnnouncement(announcement);
  if (intent.asset !== announcement.asset) {
    throw new Error("intent asset must match announcement asset");
  }
  if (intent.recipient !== announcement.stealthPrincipal) {
    throw new Error("intent recipient must match announcement stealth principal");
  }
  return { ...intent, announcementHash: hashStealthAnnouncement(announcement) };
}

export function hashStealthIntent(intent: StealthIntent): Uint8Array {
  return sha256(serializeCVBytes(stealthIntentTupleCV(intent)));
}

export function stealthDomainHash(network: Network, router: string): Uint8Array {
  const domain = Cl.tuple({
    name: Cl.stringAscii("privara"),
    version: Cl.stringAscii(String(STEALTH_INTENT_VERSION)),
    "chain-id": Cl.uint(CHAIN_ID[network]),
    router: Cl.principal(router),
  });
  return sha256(serializeCVBytes(domain));
}

export function stealthMessageDigest(
  intent: StealthIntent,
  network: Network,
  router: string
): Uint8Array {
  return sha256(
    concatBytes(
      STRUCTURED_DATA_PREFIX,
      stealthDomainHash(network, router),
      hashStealthIntent(intent)
    )
  );
}

export function signStealthIntent(
  intent: StealthIntent,
  privateKey: string,
  network: Network,
  router: string
): SignedStealthIntent {
  const intentHash = hashStealthIntent(intent);
  const digest = stealthMessageDigest(intent, network, router);
  const signature = signMessageHashRsv({
    messageHash: bytesToHex(digest),
    privateKey,
  });
  return {
    ...intent,
    user: getAddressFromPrivateKey(privateKey, network),
    intentHash,
    digest,
    userSig: hexToBytes(signature),
  };
}

function assertBoundAnnouncement(
  intent: StealthIntent,
  announcement: StealthAnnouncementPayload
): void {
  validateAnnouncementHash(intent.announcementHash);
  validateStealthAnnouncement(announcement);
  const actual = hashStealthAnnouncement(announcement);
  if (!actual.every((byte, index) => byte === intent.announcementHash[index])) {
    throw new Error("announcement payload does not match the signed announcement hash");
  }
}

export function buildStealthSettlementArgs(
  intent: SignedStealthIntent,
  announcement: StealthAnnouncementPayload
) {
  assertBoundAnnouncement(intent, announcement);
  return {
    asset: intent.asset,
    amount: intent.amount,
    recipient: intent.recipient,
    relayer: intent.relayer,
    relayerFee: intent.relayerFee,
    nonce: intent.nonce,
    expiry: intent.expiry,
    announcementHash: intent.announcementHash,
    version: announcement.version,
    ephemeralPublicKey: announcement.ephemeralPublicKey,
    announcementNonce: announcement.nonce,
    ciphertext: announcement.ciphertext,
    registryEpoch: announcement.registryEpoch,
    userSig: intent.userSig,
  };
}

export function buildStealthCancellationArgs(intent: SignedStealthIntent) {
  return {
    asset: intent.asset,
    amount: intent.amount,
    recipient: intent.recipient,
    relayer: intent.relayer,
    relayerFee: intent.relayerFee,
    nonce: intent.nonce,
    expiry: intent.expiry,
    announcementHash: intent.announcementHash,
    userSig: intent.userSig,
  };
}
