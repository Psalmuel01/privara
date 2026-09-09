/** Return only the amount still required to fund this payment. */
export function paymentFundingShortfall(required: bigint, available: bigint): bigint {
  if (required < 0n || available < 0n) throw new Error("payment balances cannot be negative");
  return required > available ? required - available : 0n;
}

/**
 * Largest amount the user can enter without the settlement total exceeding their
 * available balance. Fee-added mode reserves the rounded-up fee; fee-inclusive mode
 * can use the full balance while still requiring a positive recipient payment.
 */
export function maximumTransferAmount(
  available: bigint,
  feeBps: bigint,
  mode: "added" | "included"
): bigint {
  if (available < 0n || feeBps < 0n || feeBps > 10_000n) {
    throw new Error("maximum transfer inputs are invalid");
  }
  if (available === 0n) return 0n;
  const fee = (amount: bigint) => feeBps === 0n
    ? 0n
    : (amount * feeBps + 9_999n) / 10_000n;
  if (mode === "included") return fee(available) < available ? available : 0n;

  let low = 0n;
  let high = available;
  while (low < high) {
    const candidate = (low + high + 1n) / 2n;
    if (candidate + fee(candidate) <= available) low = candidate;
    else high = candidate - 1n;
  }
  return low;
}
