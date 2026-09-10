const COINGECKO_BTC_USD_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
const PRICE_CACHE_MS = 60_000;

export interface BitcoinUsdQuote {
  asset: "BTC";
  currency: "USD";
  price: number;
  source: "CoinGecko";
  fetchedAt: string;
}

let cachedQuote: { quote: BitcoinUsdQuote; expiresAt: number } | null = null;

/**
 * Fetch an indicative BTC/USD market price for display only. This value never enters
 * an intent, signature, fee calculation, or contract call.
 */
export async function bitcoinUsdQuote(): Promise<BitcoinUsdQuote> {
  const now = Date.now();
  if (cachedQuote && cachedQuote.expiresAt > now) return cachedQuote.quote;

  const response = await fetch(COINGECKO_BTC_USD_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`BTC/USD price provider returned HTTP ${response.status}`);

  const body = await response.json() as { bitcoin?: { usd?: unknown } };
  const price = body.bitcoin?.usd;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error("BTC/USD price provider returned an invalid price");
  }

  const quote: BitcoinUsdQuote = {
    asset: "BTC",
    currency: "USD",
    price,
    source: "CoinGecko",
    fetchedAt: new Date(now).toISOString(),
  };
  cachedQuote = { quote, expiresAt: now + PRICE_CACHE_MS };
  return quote;
}
