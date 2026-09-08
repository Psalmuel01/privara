/** Return only the amount still required to fund this payment. */
export function paymentFundingShortfall(required: bigint, available: bigint): bigint {
  if (required < 0n || available < 0n) throw new Error("payment balances cannot be negative");
  return required > available ? required - available : 0n;
}
