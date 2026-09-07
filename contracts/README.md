# Contracts

Clarity 4 contracts for Privara. All contracts target `clarity_version = 4` strictly.

## Deployed contracts

`privara-router`

The main SIP-010 intent settlement contract. Holds user deposits, verifies SIP-018
signed payment intents via `secp256k1-recover?` + `principal-of?`, enforces nonces
and expiries, prevents replay (keyed on the full signed digest), and executes
SIP-010 transfers under a scoped `(with-ft ...)` allowance. Users can always
`withdraw` unspent deposits — settlement never depends on a single relayer.

`privara-router-m2`

Versioned stealth settlement router. It preserves unordered intent nonces, adds a
signed `announcement-hash`, verifies the supplied canonical encrypted announcement,
and emits that payload atomically with the SIP-010 transfer. The M1 router remains
unchanged and has a separate signing domain.

`privara-registry`

Relayer registry. Relayers publish their secp256k1 pubkey (needed for M2 encrypted
note delivery), fee rate, and API endpoint. Read-only lookups expose availability
and fee info. No staking or reputation logic yet (post-M1).

`privara-stealth-registry`

M2 recipient-key discovery contract. A user registers compressed spending and viewing
public keys under `tx-sender`; rotations increment an epoch. The privacy seed and private
keys never enter the contract. Senders perform full curve-point validation in the SDK;
the contract enforces exact length, compressed-key prefix, and key separation.

`privara-sponsored-spend-v2`

Additive, non-custodial M2 helper for token-paid sponsorship. A stealth-origin transaction
atomically transfers the signed payment amount to its destination and the exact signed
service fee to a separate treasury. Its sixth argument binds the expected Stacks sponsor;
a sponsored execution fails if the actual sponsor differs. It never switches `tx-sender`,
never holds balances, and leaves the deployed M1/M2 routers unchanged.

`privara-sponsored-spend` is the immutable first testnet prototype. It did not bind the
actual Stacks sponsor, is not accepted by the SDK or relayer, and received no user payment.

`mock-token`

Minimal SIP-010 token with a public `mint`. Used as the whitelisted settlement asset
in simnet tests and devnet demos. The router's `SBTC` constant is the only line that
changes per network (`.mock-token` here; testnet/mainnet sBTC addresses in comments).

`other-token`

Second SIP-010 fixture used exclusively to exercise the whitelist-rejection path in
tests (`ERR_ASSET_NOT_WHITELISTED u108`).

`sip010-ft-trait`

Standard SIP-010 fungible token trait. Imported by the router and token contracts.

## Running checks

```bash
clarinet check   # type-check every configured contract
npm test         # run the full Clarinet/Vitest suite
```
