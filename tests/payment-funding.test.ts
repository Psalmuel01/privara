import { describe, expect, it } from "vitest";
import { paymentFundingShortfall } from "../app/src/lib/payment-funding";

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
});
