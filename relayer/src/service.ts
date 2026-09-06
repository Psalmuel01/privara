import { createHash } from "node:crypto";
import { bytesToHex, hexToBytes } from "@stacks/common";
import {
  AuthType,
  broadcastTransaction,
  bufferCV,
  deserializeTransaction,
  getAddressFromPrivateKey,
  getAddressFromPublicKey,
  makeContractCall,
  principalCV,
  publicKeyFromSignatureRsv,
  sponsorTransaction,
  uintCV,
} from "@stacks/transactions";
import {
  hashIntent,
  messageDigest,
  validateSponsoredSweep,
  type Intent,
  type Network,
} from "../../sdk/src";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";

export interface RelayerConfig {
  network: Network;
  coreAddress: string;
  relayerPrivateKey: string;
  sponsorPrivateKey: string;
  assetContract: string;
  tokenName: string;
  maxIntentAmount: bigint;
  maxRelayerFeeBps: number;
  maxSweepAmount: bigint;
  maxSponsorFee: bigint;
  maxTransactionBytes: number;
  sponsorshipsPerWindow: number;
  sponsorshipWindowMs: number;
  stacksApiUrl?: string;
}

export interface SettlementEnvelope {
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
}

export interface SweepRequest {
  originSignedTransaction: string;
}

export interface RelayerResult {
  txid: string;
  explorerUrl: string;
}

export class RelayerError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "invalid_request"
  ) {
    super(message);
  }
}

export interface RelayerDependencies {
  broadcast: typeof broadcastTransaction;
  sponsor: typeof sponsorTransaction;
  blockHeight: (apiUrl: string) => Promise<number>;
}

const defaultDependencies: RelayerDependencies = {
  broadcast: broadcastTransaction,
  sponsor: sponsorTransaction,
  blockHeight: async (apiUrl) => {
    const response = await fetch(`${apiUrl}/v2/info`);
    if (!response.ok) throw new Error(`Stacks info request failed with HTTP ${response.status}`);
    const info = (await response.json()) as { stacks_tip_height?: number };
    if (!Number.isSafeInteger(info.stacks_tip_height)) throw new Error("invalid Stacks info response");
    return info.stacks_tip_height!;
  },
};

function networkFor(config: RelayerConfig) {
  const base = config.network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
  return config.stacksApiUrl
    ? ({ ...base, client: { baseUrl: config.stacksApiUrl } } as typeof base)
    : base;
}

function cleanHex(value: string, bytes: number, label: string): string {
  if (typeof value !== "string") throw new RelayerError(`${label} must be hex`);
  const clean = value.replace(/^0x/, "").toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(clean)) {
    throw new RelayerError(`${label} must be ${bytes} bytes`);
  }
  return clean;
}

function integer(value: string, label: string): bigint {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new RelayerError(`${label} must be an unsigned integer string`);
  }
  return BigInt(value);
}

function sameHex(left: string, right: Uint8Array): boolean {
  return left.replace(/^0x/, "").toLowerCase() === bytesToHex(right);
}

export interface ValidatedSettlement {
  intent: Intent;
  user: string;
  userSig: Uint8Array;
}

export function validateSettlementEnvelope(
  envelope: SettlementEnvelope,
  config: RelayerConfig
): ValidatedSettlement {
  if (!envelope || typeof envelope !== "object") throw new RelayerError("JSON body is required");
  if (envelope.network !== config.network) throw new RelayerError("intent network is not supported");
  if (envelope.asset !== config.assetContract) throw new RelayerError("intent asset is not allowed");
  const expectedRelayer = getAddressFromPrivateKey(config.relayerPrivateKey, config.network);
  if (envelope.relayer !== expectedRelayer) {
    throw new RelayerError("intent is assigned to a different relayer");
  }
  if (!Number.isSafeInteger(envelope.expiry) || envelope.expiry <= 0) {
    throw new RelayerError("expiry must be a positive safe integer");
  }

  const amount = integer(envelope.amount, "amount");
  const relayerFee = integer(envelope.relayerFee, "relayerFee");
  const nonce = integer(envelope.nonce, "nonce");
  if (amount <= 0n || amount > config.maxIntentAmount) {
    throw new RelayerError(`amount exceeds relayer maximum ${config.maxIntentAmount}`);
  }
  if (relayerFee >= amount) throw new RelayerError("relayerFee must be less than amount");
  if (relayerFee * 10_000n > amount * BigInt(config.maxRelayerFeeBps)) {
    throw new RelayerError(`relayerFee exceeds ${config.maxRelayerFeeBps} bps`);
  }
  const intent: Intent = {
    asset: envelope.asset,
    amount,
    recipient: envelope.recipient,
    relayer: envelope.relayer,
    relayerFee,
    nonce,
    expiry: envelope.expiry,
  };
  let intentHash: Uint8Array;
  let digest: Uint8Array;
  try {
    intentHash = hashIntent(intent);
    digest = messageDigest(intent, config.network, `${config.coreAddress}.privara-router`);
  } catch {
    throw new RelayerError("intent contains an invalid principal or field");
  }
  if (!sameHex(cleanHex(envelope.intentHash, 32, "intentHash"), intentHash)) {
    throw new RelayerError("intentHash does not match the signed fields");
  }
  if (!sameHex(cleanHex(envelope.digest, 32, "digest"), digest)) {
    throw new RelayerError("digest does not match the signed fields and router domain");
  }
  const signature = cleanHex(envelope.userSig, 65, "userSig");
  let recovered: string;
  try {
    const publicKey = publicKeyFromSignatureRsv(bytesToHex(digest), signature);
    recovered = getAddressFromPublicKey(publicKey, config.network);
  } catch {
    throw new RelayerError("userSig is not a recoverable signature");
  }
  if (recovered !== envelope.user) throw new RelayerError("user does not match the recovered signer");
  return { intent, user: recovered, userSig: hexToBytes(signature) };
}

class FixedWindowLimiter {
  private readonly entries = new Map<string, { start: number; count: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  consume(key: string, now = Date.now()): void {
    const current = this.entries.get(key);
    if (!current || now - current.start >= this.windowMs) {
      this.entries.set(key, { start: now, count: 1 });
      return;
    }
    if (current.count >= this.limit) {
      throw new RelayerError("sponsorship rate limit exceeded", 429, "rate_limited");
    }
    current.count += 1;
  }
}

function txid(result: Awaited<ReturnType<typeof broadcastTransaction>>): string {
  if ("error" in result) {
    throw new RelayerError(
      `broadcast failed: ${result.error} ${result.reason ?? ""}`.trim(),
      502,
      "broadcast_failed"
    );
  }
  return result.txid;
}

export class PrivaraRelayerService {
  private readonly limiter: FixedWindowLimiter;
  private readonly accepted = new Set<string>();

  constructor(
    readonly config: RelayerConfig,
    private readonly dependencies: RelayerDependencies = defaultDependencies
  ) {
    this.limiter = new FixedWindowLimiter(
      config.sponsorshipsPerWindow,
      config.sponsorshipWindowMs
    );
  }

  private result(id: string): RelayerResult {
    return {
      txid: id,
      explorerUrl: `https://explorer.hiro.so/txid/0x${id.replace(/^0x/, "")}?chain=${this.config.network}`,
    };
  }

  async settleIntent(envelope: SettlementEnvelope): Promise<RelayerResult> {
    const validated = validateSettlementEnvelope(envelope, this.config);
    let tip: number;
    try {
      tip = await this.dependencies.blockHeight(networkFor(this.config).client.baseUrl);
    } catch {
      throw new RelayerError("unable to verify intent expiry", 502, "stacks_api_unavailable");
    }
    if (tip >= validated.intent.expiry) {
      throw new RelayerError("intent has expired", 409, "intent_expired");
    }
    const transaction = await makeContractCall({
      contractAddress: this.config.coreAddress,
      contractName: "privara-router",
      functionName: "settle-intent",
      functionArgs: [
        principalCV(validated.intent.asset),
        uintCV(validated.intent.amount),
        principalCV(validated.intent.recipient),
        principalCV(validated.intent.relayer),
        uintCV(validated.intent.relayerFee),
        uintCV(validated.intent.nonce),
        uintCV(validated.intent.expiry),
        bufferCV(validated.userSig),
      ],
      senderKey: this.config.relayerPrivateKey,
      network: networkFor(this.config),
      postConditionMode: "allow",
    });
    const response = await this.dependencies.broadcast({
      transaction,
      network: networkFor(this.config),
    });
    return this.result(txid(response));
  }

  async sponsorSweep(request: SweepRequest): Promise<RelayerResult & {
    origin: string;
    destination: string;
    amount: string;
    sponsorFee: string;
  }> {
    if (!request || typeof request.originSignedTransaction !== "string") {
      throw new RelayerError("originSignedTransaction is required");
    }
    const requestId = createHash("sha256").update(request.originSignedTransaction).digest("hex");
    if (this.accepted.has(requestId)) {
      throw new RelayerError("sponsored request was already accepted", 409, "duplicate_request");
    }
    let transaction;
    try {
      transaction = deserializeTransaction(request.originSignedTransaction);
    } catch {
      throw new RelayerError("originSignedTransaction could not be decoded");
    }
    let validated: ReturnType<typeof validateSponsoredSweep>;
    try {
      validated = validateSponsoredSweep(transaction, {
        network: this.config.network,
        assetContract: this.config.assetContract,
        tokenName: this.config.tokenName,
        maxAmount: this.config.maxSweepAmount,
        maxTransactionBytes: this.config.maxTransactionBytes,
      });
    } catch (error) {
      throw new RelayerError(error instanceof Error ? error.message : "sweep policy rejected");
    }
    this.limiter.consume(validated.origin);
    const sponsored = await this.dependencies.sponsor({
      transaction,
      sponsorPrivateKey: this.config.sponsorPrivateKey,
      network: networkFor(this.config),
    });
    if (sponsored.auth.authType !== AuthType.Sponsored) {
      throw new RelayerError("failed to construct sponsored authorization", 500, "signing_failed");
    }
    const fee = sponsored.auth.sponsorSpendingCondition.fee;
    if (fee > this.config.maxSponsorFee) {
      throw new RelayerError(
        `estimated sponsor fee ${fee} exceeds maximum ${this.config.maxSponsorFee}`,
        503,
        "fee_too_high"
      );
    }
    const response = await this.dependencies.broadcast({
      transaction: sponsored,
      network: networkFor(this.config),
    });
    const id = txid(response);
    this.accepted.add(requestId);
    return {
      ...this.result(id),
      origin: validated.origin,
      destination: validated.destination,
      amount: validated.amount.toString(),
      sponsorFee: fee.toString(),
    };
  }
}
