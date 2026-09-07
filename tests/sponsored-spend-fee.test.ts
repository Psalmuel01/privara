import { bytesToHex } from "@stacks/common";
import {
  AuthType,
  PostConditionMode,
  deserializeTransaction,
  getAddressFromPrivateKey,
  serializeTransaction,
  sponsorTransaction,
} from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  buildSponsoredSpend,
  fullWithdrawalPaymentAmount,
  validateSponsoredSpend,
} from "../sdk/src";

const CORE = "ST000000000000000000002AMW42H";
const SPEND_CONTRACT = `${CORE}.privara-sponsored-spend-v2`;
const ASSET = `${CORE}.mock-token`;
const DESTINATION = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const TREASURY = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
const ORIGIN_KEY = bytesToHex(new Uint8Array(32).fill(1));
const SPONSOR_KEY =
  "530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101";
const WRONG_TREASURY = getAddressFromPrivateKey(bytesToHex(new Uint8Array(32).fill(2)), "testnet");
const SPONSOR = getAddressFromPrivateKey(SPONSOR_KEY, "testnet");
const FEE = 100n;
const policy = {
  network: "testnet" as const,
  spendContract: SPEND_CONTRACT,
  assetContract: ASSET,
  tokenName: "mock",
  feeRecipient: TREASURY,
  exactSponsorFee: FEE,
  sponsorAddress: SPONSOR,
  maxPaymentAmount: 1_000_000n,
  maxTransactionBytes: 4_096,
};

async function transaction(overrides: Partial<Parameters<typeof buildSponsoredSpend>[0]> = {}) {
  return buildSponsoredSpend({
    spendContract: SPEND_CONTRACT,
    assetContract: ASSET,
    tokenName: "mock",
    destination: DESTINATION,
    paymentAmount: 40_000n,
    feeRecipient: TREASURY,
    sponsorFee: FEE,
    expectedSponsor: SPONSOR,
    stealthPrivateKey: ORIGIN_KEY,
    network: "testnet",
    nonce: 0n,
    ...overrides,
  });
}

describe("token-paid sponsored stealth spending", () => {
  it("binds payment, exact service fee, treasury, asset, and total post-condition", async () => {
    const signed = await transaction();
    const validated = validateSponsoredSpend(signed, policy);
    expect(validated.origin).toBe(getAddressFromPrivateKey(ORIGIN_KEY, "testnet"));
    expect(validated.paymentAmount).toBe(40_000n);
    expect(validated.sponsorFee).toBe(100n);
    expect(validated.totalAmount).toBe(40_100n);
    expect(validated.destination).toBe(DESTINATION);
    expect(validated.feeRecipient).toBe(TREASURY);
    expect(validated.expectedSponsor).toBe(SPONSOR);
  });

  it("survives transport and accepts an independent sponsor signature", async () => {
    const transported = deserializeTransaction(serializeTransaction(await transaction()));
    validateSponsoredSpend(transported, policy);
    const sponsored = await sponsorTransaction({
      transaction: transported,
      sponsorPrivateKey: SPONSOR_KEY,
      sponsorNonce: 7n,
      fee: 500n,
      network: "testnet",
    });
    expect(sponsored.auth.authType).toBe(AuthType.Sponsored);
    expect(sponsored.verifyOrigin()).toBeTruthy();
  });

  it("rejects underpayment, overpayment, and a different fee treasury", async () => {
    await expect(
      Promise.resolve(transaction({ sponsorFee: 99n })).then((tx) => validateSponsoredSpend(tx, policy))
    ).rejects.toThrow("must equal 100");
    await expect(
      Promise.resolve(transaction({ sponsorFee: 101n })).then((tx) => validateSponsoredSpend(tx, policy))
    ).rejects.toThrow("must equal 100");
    await expect(
      Promise.resolve(transaction({ feeRecipient: WRONG_TREASURY })).then((tx) =>
        validateSponsoredSpend(tx, policy)
      )
    ).rejects.toThrow("fee recipient");
  });

  it("rejects wrong helper contracts and permissive post-condition mode", async () => {
    await expect(
      Promise.resolve(transaction({ spendContract: `${CORE}.other-helper` })).then((tx) =>
        validateSponsoredSpend(tx, policy)
      )
    ).rejects.toThrow("disallowed");
    const signed = await transaction();
    signed.postConditionMode = PostConditionMode.Allow;
    expect(() => validateSponsoredSpend(signed, policy)).toThrow("deny post-condition");
  });

  it("rejects a different expected sponsor even when the fee treasury is correct", async () => {
    await expect(
      Promise.resolve(transaction({ expectedSponsor: WRONG_TREASURY })).then((tx) =>
        validateSponsoredSpend(tx, policy)
      )
    ).rejects.toThrow("expected sponsor");
  });

  it("computes a full withdrawal net of the fee", () => {
    expect(fullWithdrawalPaymentAmount(99_000n, 100n)).toBe(98_900n);
    expect(() => fullWithdrawalPaymentAmount(100n, 100n)).toThrow("must exceed");
  });
});
