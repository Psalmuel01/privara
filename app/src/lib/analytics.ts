import { track } from "@vercel/analytics";

/**
 * Product analytics deliberately excludes wallet addresses, BNS names, transaction
 * IDs, payment amounts, destinations, public keys, and all recovery material.
 * Keep properties low-cardinality so aggregate analytics cannot become a user ledger.
 */
export type ProductEvent =
  | "wallet_connected"
  | "identity_registered"
  | "payment_reviewed"
  | "router_funded"
  | "intent_signed"
  | "settlement_confirmed"
  | "scan_completed"
  | "payment_detected"
  | "private_spend_broadcast"
  | "dao_batch_completed"
  | "flow_failed";

type SafeProperties = {
  asset?: "sbtc" | "stx" | "usdcx";
  stage?: "connect" | "identity" | "send" | "fund" | "settle" | "scan" | "spend" | "payout";
};

export function trackProductEvent(event: ProductEvent, properties: SafeProperties = {}): void {
  // Never let analytics affect a payment when collection is disabled or blocked.
  try {
    track(event, properties);
  } catch {
    // Analytics is intentionally best-effort.
  }
}
