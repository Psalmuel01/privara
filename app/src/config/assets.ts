export type AssetTone = "bitcoin" | "dollar" | "violet";

export interface Sip010Asset {
  kind: "sip010" | "stx";
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  tone: AssetTone;
  contract: { testnet: string; mainnet?: string };
  sponsorFeeAtomic: bigint;
  demoBalanceAtomic: bigint;
}

// UI and fee math consume this registry instead of branching on token symbols. Add a
// future SIP-010 asset here, configure its relayer policy, and the same flows can render it.
export const SUPPORTED_ASSETS: Sip010Asset[] = [
  {
    kind: "sip010",
    id: "sbtc",
    symbol: "sBTC",
    name: "Stacks Bitcoin",
    decimals: 8,
    icon: "₿",
    tone: "bitcoin",
    contract: {
      testnet: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token",
      mainnet: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
    },
    sponsorFeeAtomic: 200n,
    // Canonical public testnet sBTC contract used by the deployed sBTC router.
    demoBalanceAtomic: 250_000_000n,
  },
  {
    kind: "sip010",
    id: "usdcx",
    symbol: "USDCx",
    name: "USD Coin on Stacks",
    decimals: 6,
    icon: "$",
    tone: "dollar",
    contract: {
      testnet: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx",
      mainnet: "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx",
    },
    // The relayer's signed sponsor-policy response remains authoritative.
    sponsorFeeAtomic: 200_000n,
    demoBalanceAtomic: 2_500_000n,
  },
  {
    kind: "stx",
    id: "stx",
    symbol: "STX",
    name: "Stacks",
    decimals: 6,
    icon: "S",
    tone: "violet",
    contract: {
      testnet: "STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-stx-router-v1",
      mainnet: "SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-stx-router-v1",
    },
    sponsorFeeAtomic: 0n,
    demoBalanceAtomic: 0n,
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
