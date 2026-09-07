import { bytesToHex } from "@stacks/common";
import { getAddressFromPrivateKey } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  createPrivateIntent,
  hashStealthAnnouncement,
  identityFromSeed,
  quoteSettlementFee,
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
});
