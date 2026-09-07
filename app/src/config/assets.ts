export type AssetTone = "bitcoin" | "mint" | "violet";

export interface Sip010Asset {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  tone: AssetTone;
  contract: { testnet: string; mainnet?: string };
  sponsorFeeAtomic: bigint;
  demoBalanceAtomic: bigint;
  usdPrice: number;
}

// UI and fee math consume this registry instead of branching on token symbols. Add a
// future SIP-010 asset here, configure its relayer policy, and the same flows can render it.
export const SUPPORTED_ASSETS: Sip010Asset[] = [
  {
    id: "sbtc",
    symbol: "sBTC",
    name: "Stacks Bitcoin",
    decimals: 8,
    icon: "₿",
    tone: "bitcoin",
    contract: {
      testnet: "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token",
      mainnet: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
    },
    sponsorFeeAtomic: 1_200n,
    demoBalanceAtomic: 250_000_000n,
    usdPrice: 62_496,
  },
  {
    id: "mock",
    symbol: "MOCK",
    name: "Privara Mock Token",
    decimals: 6,
    icon: "M",
    tone: "mint",
    contract: {
      testnet: "STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.mock-token",
    },
    sponsorFeeAtomic: 100n,
    demoBalanceAtomic: 2_500_000n,
    usdPrice: 1,
  },
];

export function formatUnits(value: bigint, decimals: number, maximum = decimals): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base)
    .toString()
    .padStart(decimals, "0")
    .slice(0, maximum)
    .replace(/0+$/, "");
  return `${negative ? "−" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function parseUnits(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!/^\d*(\.\d*)?$/.test(normalized) || normalized === "" || normalized === ".") {
    throw new Error("Enter a valid amount");
  }
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) throw new Error(`Maximum ${decimals} decimal places`);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
}
