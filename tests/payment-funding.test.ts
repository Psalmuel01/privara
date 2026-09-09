import { describe, expect, it } from "vitest";
import {
  maximumTransferAmount,
  paymentFundingShortfall,
} from "../app/src/lib/payment-funding";

describe("guided payment funding", () => {
  it("requests exactly the shortfall", () => {
    expect(paymentFundingShortfall(101_000n, 40_000n)).toBe(61_000n);
  });

  it("does not request funding when the payment is already covered", () => {
    expect(paymentFundingShortfall(101_000n, 101_000n)).toBe(0n);
    expect(paymentFundingShortfall(101_000n, 150_000n)).toBe(0n);
  });

  it("rejects impossible negative accounting inputs", () => {
    expect(() => paymentFundingShortfall(-1n, 0n)).toThrow("cannot be negative");
    expect(() => paymentFundingShortfall(1n, -1n)).toThrow("cannot be negative");
  });

  it("shows a fee-aware maximum recipient amount", () => {
    expect(maximumTransferAmount(101_000n, 100n, "added")).toBe(100_000n);
    expect(maximumTransferAmount(100_000n, 100n, "included")).toBe(100_000n);
    expect(maximumTransferAmount(1n, 100n, "included")).toBe(0n);
  });

  it("handles rounded fees without exceeding the available balance", () => {
    const entered = maximumTransferAmount(100_000n, 100n, "added");
    const fee = (entered * 100n + 9_999n) / 10_000n;
    expect(entered + fee).toBeLessThanOrEqual(100_000n);
    expect(entered + 1n + ((entered + 1n) * 100n + 9_999n) / 10_000n)
      .toBeGreaterThan(100_000n);
  });
});
