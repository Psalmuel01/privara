import { bytesToHex } from "@stacks/common";
import {
  getAddressFromPrivateKey,
  serializeTransaction,
  sponsorTransaction,
} from "@stacks/transactions";
import { describe, expect, it, vi } from "vitest";
import {
  buildSponsoredSpend,
  createPrivateIntent,
  createIntent,
  identityFromSeed,
  privateIntentEnvelope,
  signIntent,
} from "../sdk/src";
import {
  PrivaraRelayerService,
  validateSettlementEnvelope,
  validateStealthSettlementEnvelope,
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
const TREASURY = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";

const config: RelayerConfig = {
  network: "testnet",
  coreAddress: CORE,
  relayerPrivateKey: RELAYER_KEY,
  sponsorPrivateKey: RELAYER_KEY,
  assetContract: ASSET,
  tokenName: "mock",
  spendContract: `${CORE}.privara-sponsored-spend-v2`,
  feeRecipient: TREASURY,
  exactTokenSponsorFee: 100n,
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
  const knownStealthOrigin = vi.fn(async () => true);
  return { broadcast, sponsor, blockHeight, knownStealthOrigin } as unknown as RelayerDependencies & {
    broadcast: typeof broadcast;
    sponsor: typeof sponsor;
    blockHeight: typeof blockHeight;
    knownStealthOrigin: typeof knownStealthOrigin;
  };
}

describe("reference relayer service", () => {
  it("publishes an exact, separate token sponsorship policy", () => {
    const policy = new PrivaraRelayerService(config, fakeDependencies()).sponsorPolicy();
    expect(policy).toMatchObject({
      spendContract: `${CORE}.privara-sponsored-spend-v2`,
      asset: ASSET,
      feeRecipient: TREASURY,
      sponsorFee: "100",
      maxStacksNetworkFee: "10000",
    });
  });

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

  it("validates and broadcasts an M2 private intent through the same endpoint", async () => {
    const identity = identityFromSeed(new Uint8Array(32).fill(9));
    const created = await createPrivateIntent({
      registry: `${CORE}.privara-stealth-registry`,
      recipient: DESTINATION,
      recipientKeys: {
        spendingPublicKey: identity.spendingPublicKey,
        viewingPublicKey: identity.viewingPublicKey,
        epoch: 2n,
      },
      network: "testnet",
      router: `${CORE}.privara-router-m2`,
      asset: ASSET,
      relayer: getAddressFromPrivateKey(RELAYER_KEY, "testnet"),
      enteredAmount: 99_000n,
      settlementFeeBps: 100n,
      feeMode: "added",
      expiry: 999_999,
      nonce: 77n,
      payerPrivateKey: USER_KEY,
      ephemeralPrivateKey: new Uint8Array(32).fill(8),
    });
    const envelope = privateIntentEnvelope(created, "testnet");
    expect(validateStealthSettlementEnvelope(envelope, config).intent.nonce).toBe(77n);

    const dependencies = fakeDependencies();
    await expect(new PrivaraRelayerService(config, dependencies).settleIntent(envelope))
      .resolves.toMatchObject({ status: "broadcast", txid: "ab".repeat(32) });
    expect(dependencies.broadcast).toHaveBeenCalledOnce();
  }, 10_000);

  it("validates, sponsors, and broadcasts an origin-signed sweep", async () => {
    const originSigned = await buildSponsoredSpend({
      spendContract: `${CORE}.privara-sponsored-spend-v2`,
      assetContract: ASSET,
      tokenName: "mock",
      destination: DESTINATION,
      paymentAmount: 99_000n,
      feeRecipient: TREASURY,
      sponsorFee: 100n,
      expectedSponsor: getAddressFromPrivateKey(RELAYER_KEY, "testnet"),
      stealthPrivateKey: ORIGIN_KEY,
      network: "testnet",
      nonce: 0n,
    });
    const dependencies = fakeDependencies();
    const service = new PrivaraRelayerService(config, dependencies);
    const result = await service.sponsorSweep({
      originSignedTransaction: serializeTransaction(originSigned),
    });
    expect(result.paymentAmount).toBe("99000");
    expect(result.tokenSponsorFee).toBe("100");
    expect(result.networkFeePaid).toBe("374");
    expect(dependencies.knownStealthOrigin).toHaveBeenCalledOnce();
    expect(dependencies.sponsor).toHaveBeenCalledOnce();
    expect(dependencies.broadcast).toHaveBeenCalledOnce();
  });

  it("rejects an already accepted sponsorship request", async () => {
    const originSigned = await buildSponsoredSpend({
      spendContract: `${CORE}.privara-sponsored-spend-v2`,
      assetContract: ASSET,
      tokenName: "mock",
      destination: DESTINATION,
      paymentAmount: 1n,
      feeRecipient: TREASURY,
      sponsorFee: 100n,
      expectedSponsor: getAddressFromPrivateKey(RELAYER_KEY, "testnet"),
      stealthPrivateKey: ORIGIN_KEY,
      network: "testnet",
      nonce: 0n,
    });
    const service = new PrivaraRelayerService(config, fakeDependencies());
    const request = { originSignedTransaction: serializeTransaction(originSigned) };
    await service.sponsorSweep(request);
    await expect(service.sponsorSweep(request)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a signed origin that is not in a confirmed Privara announcement", async () => {
    const originSigned = await buildSponsoredSpend({
      spendContract: `${CORE}.privara-sponsored-spend-v2`,
      assetContract: ASSET,
      tokenName: "mock",
      destination: DESTINATION,
      paymentAmount: 1n,
      feeRecipient: TREASURY,
      sponsorFee: 100n,
      expectedSponsor: getAddressFromPrivateKey(RELAYER_KEY, "testnet"),
      stealthPrivateKey: ORIGIN_KEY,
      network: "testnet",
      nonce: 0n,
    });
    const dependencies = fakeDependencies();
    dependencies.knownStealthOrigin.mockResolvedValue(false);
    const service = new PrivaraRelayerService(config, dependencies);
    await expect(
      service.sponsorSweep({ originSignedTransaction: serializeTransaction(originSigned) })
    ).rejects.toMatchObject({ status: 403, code: "unknown_stealth_origin" });
    expect(dependencies.sponsor).not.toHaveBeenCalled();
  });
});
