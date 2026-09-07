import { bytesToHex } from "@stacks/common";
import { getAddressFromPrivateKey, signMessageHashRsv } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  createPrivateIntent,
  attachStealthIntentSignature,
  hashStealthAnnouncement,
  identityFromSeed,
  preparePrivateIntent,
  quoteSettlementFee,
  stealthMessageDigest,
} from "../sdk/src";

const PAYER_KEY = "11".repeat(32) + "01";
const RECIPIENT = getAddressFromPrivateKey("22".repeat(32) + "01", "testnet");
const RELAYER = getAddressFromPrivateKey("33".repeat(32) + "01", "testnet");
const CORE = getAddressFromPrivateKey("44".repeat(32) + "01", "testnet");

describe("private intent client", () => {
  it("quotes fee-included and fee-added amounts explicitly", () => {
    expect(quoteSettlementFee({ amount: 100_000_000n, feeBps: 100n, mode: "included" }))
      .toMatchObject({
        totalAmount: 100_000_000n,
        recipientAmount: 99_000_000n,
        settlementFee: 1_000_000n,
      });
    expect(quoteSettlementFee({ amount: 100_000_000n, feeBps: 100n, mode: "added" }))
      .toMatchObject({
        totalAmount: 101_000_000n,
        recipientAmount: 100_000_000n,
        settlementFee: 1_000_000n,
      });
  });

  it("resolves the payment to a fresh stealth principal and binds its announcement", async () => {
    const identity = identityFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
    const result = await createPrivateIntent({
      registry: `${CORE}.privara-stealth-registry`,
      recipient: RECIPIENT,
      recipientKeys: {
        spendingPublicKey: identity.spendingPublicKey,
        viewingPublicKey: identity.viewingPublicKey,
        epoch: 3n,
      },
      network: "testnet",
      router: `${CORE}.privara-router-m2`,
      asset: `${CORE}.mock-token`,
      relayer: RELAYER,
      enteredAmount: 100_000n,
      settlementFeeBps: 100n,
      feeMode: "added",
      expiry: 500,
      nonce: 9n,
      payerPrivateKey: PAYER_KEY,
      ephemeralPrivateKey: new Uint8Array(32).fill(7),
    });

    expect(result.intent.recipient).toBe(result.announcement.stealthPrincipal);
    expect(result.intent.recipient).not.toBe(RECIPIENT);
    expect(result.intent.amount).toBe(101_000n);
    expect(result.intent.relayerFee).toBe(1_000n);
    expect(result.quote.recipientAmount).toBe(100_000n);
    expect(bytesToHex(result.intent.announcementHash)).toBe(
      bytesToHex(hashStealthAnnouncement(result.announcement))
    );
  });

  it("attaches a browser-wallet structured-data signature without a payer private key", async () => {
    const identity = identityFromSeed(new Uint8Array(32).fill(5));
    const router = `${CORE}.privara-router-m2`;
    const prepared = await preparePrivateIntent({
      registry: `${CORE}.privara-stealth-registry`,
      recipient: RECIPIENT,
      recipientKeys: {
        spendingPublicKey: identity.spendingPublicKey,
        viewingPublicKey: identity.viewingPublicKey,
        epoch: 1n,
      },
      network: "testnet",
      router,
      asset: `${CORE}.mock-token`,
      relayer: RELAYER,
      enteredAmount: 50_000n,
      settlementFeeBps: 100n,
      feeMode: "added",
      expiry: 700,
      nonce: 91n,
      ephemeralPrivateKey: new Uint8Array(32).fill(8),
    });
    const signature = signMessageHashRsv({
      messageHash: bytesToHex(stealthMessageDigest(prepared.intent, "testnet", router)),
      privateKey: PAYER_KEY,
    });
    const attached = attachStealthIntentSignature(
      prepared.intent,
      signature,
      "testnet",
      router
    );
    expect(attached.user).toBe(getAddressFromPrivateKey(PAYER_KEY, "testnet"));
    expect(bytesToHex(attached.userSig)).toBe(signature);
  });
});
