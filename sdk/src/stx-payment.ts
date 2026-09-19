import {
  preparePrivateIntent,
  type PreparePrivateIntentOptions,
  type PreparedPrivateIntentResult,
} from "./private-intent";

/**
 * Native STX uses the same signed stealth intent as SIP-010 settlements. Both
 * `router` and the canonical announcement `asset` identify the STX router.
 */
export type PrepareStxPrivateIntentOptions = Omit<PreparePrivateIntentOptions, "asset">;

export function prepareStxPrivateIntent(
  options: PrepareStxPrivateIntentOptions
): Promise<PreparedPrivateIntentResult> {
  return preparePrivateIntent({ ...options, asset: options.router });
}
