import { describe, expect, it } from "vitest";
import { SUPPORTED_ASSETS } from "../app/src/config/assets";
import {
  atomicToUsd,
  defaultTransferAmount,
  formatUsd,
  usdToAtomic,
} from "../app/src/lib/usd-price";

const sbtc = SUPPORTED_ASSETS.find((asset) => asset.id === "sbtc")!;
const usdcx = SUPPORTED_ASSETS.find((asset) => asset.id === "usdcx")!;

describe("sBTC USD display helpers", () => {
  it("uses an affordable sBTC default without depending on frontend network config", () => {
    expect(defaultTransferAmount(sbtc)).toBe("0.0001");
    expect(defaultTransferAmount(usdcx)).toBe("5");
  });

  it("uses USDCx's nominal one-dollar unit without a market-data request", () => {
    expect(atomicToUsd(12_500_000n, usdcx, null)).toBe(12.5);
    expect(usdToAtomic(25, usdcx, null)).toBe(25_000_000n);
  });

  it("converts between exact sats and indicative USD values", () => {
    expect(atomicToUsd(10_000n, sbtc, 100_000)).toBe(10);
    expect(usdToAtomic(5, sbtc, 100_000)).toBe(5_000n);
    expect(usdToAtomic(10, sbtc, 100_000)).toBe(10_000n);
    expect(usdToAtomic(25, sbtc, 100_000)).toBe(25_000n);
    expect(formatUsd(10)).toBe("$10.00");
  });

  it("does not invent USD values when the Bitcoin price is absent", () => {
    expect(atomicToUsd(10_000n, sbtc, null)).toBeNull();
    expect(usdToAtomic(10, sbtc, null)).toBeNull();
  });
});
