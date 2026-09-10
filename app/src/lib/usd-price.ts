import type { Sip010Asset } from "../config/assets";

export interface BitcoinUsdQuote {
  asset: "BTC";
  currency: "USD";
  price: number;
  source: string;
  fetchedAt: string;
}

/** Keep real-value sBTC inputs affordable regardless of the frontend network setting. */
export function defaultTransferAmount(asset: Sip010Asset): string {
  return asset.id === "sbtc" ? "0.0001" : "1";
}

export async function fetchBitcoinUsdQuote(relayerUrl: string): Promise<BitcoinUsdQuote> {
  const response = await fetch(`${relayerUrl.replace(/\/$/, "")}/v1/market/btc-usd`);
  if (!response.ok) throw new Error(`BTC/USD estimate unavailable: HTTP ${response.status}`);
  const quote = await response.json() as BitcoinUsdQuote;
  if (
    quote.asset !== "BTC" ||
    quote.currency !== "USD" ||
    !Number.isFinite(quote.price) ||
    quote.price <= 0
  ) {
    throw new Error("BTC/USD estimate response is invalid");
  }
  return quote;
}

/** Convert exact token atoms to an approximate USD display value. */
export function atomicToUsd(
  amount: bigint,
  asset: Sip010Asset,
  bitcoinUsdPrice: number | null
): number | null {
  if (asset.id !== "sbtc" || bitcoinUsdPrice === null || bitcoinUsdPrice <= 0) return null;
  return Number(amount) / 10 ** asset.decimals * bitcoinUsdPrice;
}

/** Convert a USD shortcut to sats. This is UI input only; signed values remain integers. */
export function usdToAtomic(
  usd: number,
  asset: Sip010Asset,
  bitcoinUsdPrice: number | null
): bigint | null {
  if (
    asset.id !== "sbtc" ||
    bitcoinUsdPrice === null ||
    bitcoinUsdPrice <= 0 ||
    !Number.isFinite(usd) ||
    usd <= 0
  ) return null;
  return BigInt(Math.round(usd / bitcoinUsdPrice * 10 ** asset.decimals));
}

export function formatUsd(value: number): string {
  const digits = value < 1 ? 2 : value < 100 ? 2 : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
