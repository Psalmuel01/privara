import { bytesToHex } from "@stacks/common";
import {
  deserializeTransaction,
  getAddressFromPrivateKey,
  serializeTransaction,
} from "@stacks/transactions";
import { describe, expect, it, vi } from "vitest";
import {
  prepareSponsoredSpend,
  submitPreparedSponsoredSpend,
  validateSponsoredSpend,
  type SponsorPolicyQuote,
} from "../sdk/src";

const CORE = "ST000000000000000000002AMW42H";
const SPEND = `${CORE}.privara-sponsored-spend-v2`;
const ASSET = `${CORE}.mock-token`;
const DESTINATION = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const TREASURY = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
const ORIGIN_KEY = bytesToHex(new Uint8Array(32).fill(1));
const SPONSOR_KEY = bytesToHex(new Uint8Array(32).fill(3));
const SPONSOR = getAddressFromPrivateKey(SPONSOR_KEY, "testnet");

function policy(fee = "100"): SponsorPolicyQuote {
  return {
    version: 1,
    network: "testnet",
    spendContract: SPEND,
    asset: ASSET,
    tokenName: "mock",
    feeRecipient: TREASURY,
    sponsorAddress: SPONSOR,
    sponsorFee: fee,
    maxPaymentAmount: "1000000",
    maxStacksNetworkFee: "10000",
  };
}

describe("explicit sponsored-spend approval", () => {
  it("fetches one quote before confirmation and signs exactly that pinned quote", async () => {
    let policyFetches = 0;
    let posted = "";
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v1/stealth/sponsor-policy")) {
        policyFetches++;
        return Response.json(policy(policyFetches === 1 ? "100" : "999"));
      }
      posted = JSON.parse(String(init?.body)).originSignedTransaction;
      return Response.json({
        txid: "ab".repeat(32), status: "broadcast", explorerUrl: "https://example.test",
        origin: getAddressFromPrivateKey(ORIGIN_KEY, "testnet"), destination: DESTINATION,
        paymentAmount: "40000", tokenSponsorFee: "100", networkFeePaid: "374",
      });
    });
    const base = {
      endpoint: "https://relayer.test",
      network: "testnet" as const,
      spendContract: SPEND,
      assetContract: ASSET,
      tokenName: "mock",
      destination: DESTINATION,
      stealthPrivateKey: ORIGIN_KEY,
      nonce: 0n,
      fetchFn: fetchFn as typeof fetch,
      balanceFn: vi.fn(async () => 100_000n),
    };

    const approved = await prepareSponsoredSpend({ ...base, fullBalance: false, amount: 40_000n });
    expect(approved.sponsorFee).toBe(100n);
    expect(approved.totalAmount).toBe(40_100n);
    await submitPreparedSponsoredSpend(base, approved);
    expect(policyFetches).toBe(1);

    const signed = deserializeTransaction(posted);
    expect(serializeTransaction(signed)).toBe(posted);
    expect(validateSponsoredSpend(signed, {
      network: "testnet", spendContract: SPEND, assetContract: ASSET, tokenName: "mock",
      feeRecipient: TREASURY, exactSponsorFee: 100n, sponsorAddress: SPONSOR,
      maxPaymentAmount: 1_000_000n, maxTransactionBytes: 4_096,
    })).toMatchObject({ destination: DESTINATION, paymentAmount: 40_000n, sponsorFee: 100n });
  });

  it("refuses destination changes and inconsistent approved fee data without posting", async () => {
    const fetchFn = vi.fn(async () => Response.json(policy()));
    const base = {
      endpoint: "https://relayer.test", network: "testnet" as const, spendContract: SPEND,
      assetContract: ASSET, tokenName: "mock", destination: DESTINATION,
      stealthPrivateKey: ORIGIN_KEY, nonce: 0n, fetchFn: fetchFn as typeof fetch,
      balanceFn: vi.fn(async () => 100_000n),
    };
    const approved = await prepareSponsoredSpend({ ...base, fullBalance: false, amount: 40_000n });
    await expect(submitPreparedSponsoredSpend({ ...base, destination: TREASURY }, approved))
      .rejects.toThrow("destination changed");
    await expect(submitPreparedSponsoredSpend(base, { ...approved, sponsorFee: 101n }))
      .rejects.toThrow("internally inconsistent");
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
