import { describe, expect, it } from "vitest";
import { parseDaoPayoutCsv, quoteDaoPayoutBatch } from "../app/src/lib/dao-payouts";

describe("DAO payout batches", () => {
  it("quotes every added-fee payout and aggregates exact totals", () => {
    const quote = quoteDaoPayoutBatch({
      payouts: [
        { id: "1", name: "Ada", recipient: "STA", amount: "1" },
        { id: "2", name: "Bob", recipient: "STB", amount: "0.5" },
      ],
      decimals: 8,
      feeBps: 100n,
      feeMode: "added",
      maxIntentAmount: 200_000_000n,
    });
    expect(quote.recipientTotal).toBe(150_000_000n);
    expect(quote.feeTotal).toBe(1_500_000n);
    expect(quote.totalAmount).toBe(151_500_000n);
  });

  it("rejects duplicate recipients and per-intent limit violations", () => {
    const duplicate = [
      { id: "1", name: "Ada", recipient: "STA", amount: "1" },
      { id: "2", name: "Ada again", recipient: "STA", amount: "1" },
    ];
    expect(() => quoteDaoPayoutBatch({ payouts: duplicate, decimals: 8, feeBps: 100n, feeMode: "included" }))
      .toThrow("repeats a recipient");
    expect(() => quoteDaoPayoutBatch({ payouts: duplicate.slice(0, 1), decimals: 8, feeBps: 100n, feeMode: "added", maxIntentAmount: 100_000_000n }))
      .toThrow("exceeds the relayer maximum");
  });

  it("parses reordered headers, quoted names, and Windows newlines", () => {
    expect(parseDaoPayoutCsv('\uFEFFamount,recipient,name\r\n0.25,ST123,"Dahunsi, Samuel"\r\n')).toEqual([
      { id: "csv-1", name: "Dahunsi, Samuel", recipient: "ST123", amount: "0.25" },
    ]);
  });

  it("requires the documented CSV headers", () => {
    expect(() => parseDaoPayoutCsv("wallet,value\nST123,1"))
      .toThrow("name, address, and amount");
  });
});
