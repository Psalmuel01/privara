# Tests

Clarinet/Vitest contract and SDK test suite. Run with `npm test` from the repo root.

**35 tests across 3 files, all green.**

## Test files

`privara-router.test.ts` — 18 tests covering the full router surface:
- Happy path: deposit → sign intent (real secp256k1 sig) → relayer settles →
  recipient credited `amount - fee`, relayer credited `fee`, deposit debited, nonce bumped.
- Replay: settling the same intent twice → `ERR_INTENT_USED (u100)`.
- Expiry: mine past `expiry` → `ERR_INTENT_EXPIRED (u101)`.
- Invalid signature: signed by wrong key → `ERR_INVALID_SIG (u102)`.
- Tampered field: valid sig but relayer submits different amount → `ERR_INVALID_SIG (u102)`.
- Wrong nonce → `ERR_NONCE_MISMATCH (u103)`.
- Insufficient deposit → `ERR_INSUFFICIENT_FUNDS (u104)`.
- Fee edges: `fee = 0` succeeds with no relayer transfer; `fee >= amount` → `ERR_AMOUNT_TOO_LOW (u105)`.
- Sequential intents: nonce 0 then nonce 1 both settle.
- Withdraw: success path, over-withdraw fails.
- Deposit: zero amount rejected; balance accumulates across deposits.
- Whitelist rejection: deposit / withdraw / settle of a non-whitelisted asset → `ERR_ASSET_NOT_WHITELISTED (u108)`.

`privara-registry.test.ts` — 12 tests:
- Register, duplicate (`u201`), bad pubkey (`u202`), fee-too-high (`u203`),
  empty endpoint (`u204`), lookups, `update-endpoint`, `deactivate` incl. `u200`.

`sdk-parity.test.ts` — 5 tests:
- SDK `hashIntent` equals the contract's `hash-intent` read-only.
- SDK `domainHash` equals the contract's `MESSAGE_DOMAIN_HASH` constant.
- SDK `messageDigest` equals the contract's `message-digest` read-only.
- An SDK-signed intent settles end-to-end on simnet.
- The digest signed offline matches what the contract records as settled.

## Signing in tests

Tests sign with Clarinet's documented `wallet_1` key and derive the expected signer
principal from it. The `secp256k1-recover?` + `principal-of?` path is exercised on
every settlement call.
