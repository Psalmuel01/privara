import { bytesToHex } from "@stacks/common";
import {
  getAddressFromPrivateKey,
  serializeTransaction,
  sponsorTransaction,
} from "@stacks/transactions";
import { describe, expect, it, vi } from "vitest";
import {
  buildSponsoredSweep,
  createIntent,
  signIntent,
} from "../sdk/src";
import {
  PrivaraRelayerService,
  validateSettlementEnvelope,
  type RelayerConfig,
  type RelayerDependencies,
  type SettlementEnvelope,
} from "../relayer/src/service";

const CORE = "ST000000000000000000002AMW42H";
const ASSET = `${CORE}.mock-token`;
const RELAYER_KEY = "530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101";
const USER_KEY = "4f3f2f1f0f9f8f7f6f5f4f3f2f1f0f9f8f7f6f5f4f3f2f1f0f9f8f7f6f5f4f3f01";
const ORIGIN_KEY = "0101010101010101010101010101010101010101010101010101010101010101";
const DESTINATION = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";

const config: RelayerConfig = {
  network: "testnet",
  coreAddress: CORE,
  relayerPrivateKey: RELAYER_KEY,
  sponsorPrivateKey: RELAYER_KEY,
  assetContract: ASSET,
  tokenName: "mock",
  maxIntentAmount: 1_000_000n,
  maxRelayerFeeBps: 100,
  maxSweepAmount: 1_000_000n,
  maxSponsorFee: 10_000n,
  maxTransactionBytes: 4_096,
  sponsorshipsPerWindow: 10,
  sponsorshipWindowMs: 60_000,
};

function settlementEnvelope(expiry = 999_999): SettlementEnvelope {
  const intent = createIntent({
    asset: ASSET,
    amount: 100_000n,
    recipient: DESTINATION,
    relayer: getAddressFromPrivateKey(RELAYER_KEY, "testnet"),
    relayerFee: 1_000n,
    nonce: 44n,
    expiry,
  });
  const signed = signIntent(intent, USER_KEY, "testnet", `${CORE}.privara-router`);
  return {
    network: "testnet",
    asset: signed.asset,
    amount: signed.amount.toString(),
    recipient: signed.recipient,
    relayer: signed.relayer,
    relayerFee: signed.relayerFee.toString(),
    nonce: signed.nonce.toString(),
    expiry: signed.expiry,
    user: signed.user,
    intentHash: bytesToHex(signed.intentHash),
    digest: bytesToHex(signed.digest),
    userSig: bytesToHex(signed.userSig),
  };
}

function fakeDependencies() {
  const broadcast = vi.fn(async () => ({ txid: "ab".repeat(32) }));
  const sponsor = vi.fn(async (options: Parameters<typeof sponsorTransaction>[0]) =>
    sponsorTransaction({ ...options, sponsorNonce: 7n, fee: 374n })
  );
  const blockHeight = vi.fn(async () => 100);
  return { broadcast, sponsor, blockHeight } as unknown as RelayerDependencies & {
    broadcast: typeof broadcast;
    sponsor: typeof sponsor;
    blockHeight: typeof blockHeight;
  };
}

describe("reference relayer service", () => {
  it("recovers and verifies a signed settlement envelope", () => {
    const envelope = settlementEnvelope();
    const validated = validateSettlementEnvelope(envelope, config);
    expect(validated.user).toBe(envelope.user);
    expect(validated.intent.nonce).toBe(44n);
  });

  it("rejects settlement field tampering before building a transaction", () => {
    const envelope = { ...settlementEnvelope(), amount: "100001" };
    expect(() => validateSettlementEnvelope(envelope, config)).toThrow("intentHash does not match");
  });

  it("rejects settlement fees above policy", () => {
    const envelope = settlementEnvelope();
    expect(() =>
      validateSettlementEnvelope(envelope, { ...config, maxRelayerFeeBps: 99 })
    ).toThrow("exceeds 99 bps");
  });

  it("reports malformed settlement principals as a client policy error", () => {
    const envelope = { ...settlementEnvelope(), recipient: "not-an-address" };
    try {
      validateSettlementEnvelope(envelope, config);
      throw new Error("expected validation failure");
    } catch (error) {
      expect(error).toMatchObject({ status: 400, code: "invalid_request" });
    }
  });

  it("rejects an expired intent before building or broadcasting it", async () => {
    const dependencies = fakeDependencies();
    const service = new PrivaraRelayerService(config, dependencies);
    await expect(service.settleIntent(settlementEnvelope(100))).rejects.toMatchObject({
      status: 409,
      code: "intent_expired",
    });
    expect(dependencies.broadcast).not.toHaveBeenCalled();
  });

  it("validates, sponsors, and broadcasts an origin-signed sweep", async () => {
    const originSigned = await buildSponsoredSweep({
      assetContract: ASSET,
      tokenName: "mock",
      destination: DESTINATION,
      amount: 99_000n,
      stealthPrivateKey: ORIGIN_KEY,
      network: "testnet",
      nonce: 0n,
    });
    const dependencies = fakeDependencies();
    const service = new PrivaraRelayerService(config, dependencies);
    const result = await service.sponsorSweep({
      originSignedTransaction: serializeTransaction(originSigned),
    });
    expect(result.amount).toBe("99000");
    expect(result.sponsorFee).toBe("374");
    expect(dependencies.sponsor).toHaveBeenCalledOnce();
    expect(dependencies.broadcast).toHaveBeenCalledOnce();
  });

  it("rejects an already accepted sponsorship request", async () => {
    const originSigned = await buildSponsoredSweep({
      assetContract: ASSET,
      tokenName: "mock",
      destination: DESTINATION,
      amount: 1n,
      stealthPrivateKey: ORIGIN_KEY,
      network: "testnet",
      nonce: 0n,
    });
    const service = new PrivaraRelayerService(config, fakeDependencies());
    const request = { originSignedTransaction: serializeTransaction(originSigned) };
    await service.sponsorSweep(request);
    await expect(service.sponsorSweep(request)).rejects.toMatchObject({ status: 409 });
  });
});
