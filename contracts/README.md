# Contracts

Clarity 4 contracts for Privara. All contracts target `clarity_version = 4` strictly.

## Deployed contracts

`privara-router`

The main SIP-010 intent settlement contract. Holds user deposits, verifies SIP-018
signed payment intents via `secp256k1-recover?` + `principal-of?`, enforces nonces
and expiries, prevents replay (keyed on the full signed digest), and executes
SIP-010 transfers under a scoped `(with-ft ...)` allowance. Users can always
`withdraw` unspent deposits — settlement never depends on a single relayer.

`privara-registry`

Relayer registry. Relayers publish their secp256k1 pubkey (needed for M2 encrypted
note delivery), fee rate, and API endpoint. Read-only lookups expose availability
and fee info. No staking or reputation logic yet (post-M1).

`mock-token`

Minimal SIP-010 token with a public `mint`. Used as the whitelisted settlement asset
in simnet tests and devnet demos. The router's `SBTC` constant is the only line that
changes per network (`.mock-token` here; testnet/mainnet sBTC addresses in comments).

`other-token`

Second SIP-010 fixture used exclusively to exercise the whitelist-rejection path in
tests (`ERR_ASSET_NOT_WHITELISTED u108`).

`sip018-spike`

Throwaway spike contract that proved the SIP-018 digest construction and
`secp256k1-recover?` byte-compatibility before the router rework. Kept as a digest
regression guard until the router test fully subsumes it.

`sip010-ft-trait`

Standard SIP-010 fungible token trait. Imported by the router and token contracts.

## Running checks

```bash
clarinet check   # type-check all 6 contracts (0 warnings expected)
npm test         # run the full Clarinet/Vitest suite (40 tests)
```
