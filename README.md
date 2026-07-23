# Privara

Privacy-preserving SIP-010 payment infrastructure for Stacks.

Privara is a SIP-010 privacy execution layer that enables intent-based transfers with reduced wallet traceability. It introduces a router-based settlement flow where users create signed payment intents that can be executed by relayers, separating payment authorization from onchain transaction submission.

The goal is practical privacy for Stacks today: less direct wallet-to-wallet traceability, better payment hygiene for SIP-010 and sBTC flows, and reusable developer infrastructure for wallets, DAO tools, and DeFi protocols.

## Why Privara

SIP-010 transfers on Stacks are transparent by default. That means wallet relationships, treasury movements, payroll flows, and payment patterns can be read directly from public transaction history.

Privara addresses this gap by providing:

- signed SIP-010 payment intents
- relayer-submitted settlement transactions
- encrypted offchain payment instructions
- fresh-address routing for recipients
- replay protection through intent hashes, nonces, and expiries
- a reusable TypeScript SDK for wallet and protocol integration
- a reference relayer service for testnet execution

Privara is intentionally scoped as a practical privacy layer, not a fully trustless mixer. It improves wallet-graph privacy within current Clarity constraints while leaving a clear path toward stronger cryptographic privacy as the Stacks runtime evolves.

## What Privara Is Not

Privara v1 does not claim fully hidden-amount or hidden-recipient SIP-010 transfers.

In Clarity today, normal SIP-010 settlement requires the contract to know the recipient and amount at execution time, and those values are generally visible through transaction arguments, state changes, or token events.

Privara v1 also does not claim a fully trustless Tornado-style shielded pool. A trustless pool requires a private membership proof so a withdrawal can prove it belongs to a prior deposit without revealing which deposit it spends. That requires ZK proofs, ring signatures, blind-signature infrastructure, or another private membership mechanism that is not currently practical as a pure Clarity v1 deliverable.

Instead, Privara focuses on reduced traceability, relayer execution, encrypted note delivery, fresh-address workflows, and an explicitly scoped research path for stronger shielded-note designs.

## Core Flow

1. A user deposits SIP-010 tokens into the router contract.
2. The user creates a payment intent offchain: asset, amount, recipient or fresh address, relayer fee, nonce, and expiry.
3. The user signs the intent as SIP-018 structured data (compatible with Leather and Xverse structured-message signing).
4. A relayer receives the authorized settlement request.
5. The relayer submits the settlement transaction on Stacks.
6. The Clarity router recovers the signer from the signature, then verifies authorization, nonce, expiry, and replay protection.
7. The router executes the SIP-010 transfer from the user's deposit and pays the relayer fee where applicable.

If no relayer will act, the user can always call `withdraw` to reclaim their deposit directly — settlement never depends on a single relayer's cooperation.

This separates user authorization from settlement submission. The chain still sees the settlement, but the transfer no longer appears as a direct sender-submitted wallet-to-wallet payment.

### Signing and authorization

Intents are signed following [SIP-018 structured data signing](https://github.com/stacksgov/sips/blob/main/sips/sip-018/sip-018-signed-structured-data.md). The signed digest is:

```
sha256(0x534950303138 || domain-hash || structured-data-hash)
```

where `domain-hash = sha256(to-consensus-buff? { name: "privara", version: "1", chain-id })` and `structured-data-hash = sha256(to-consensus-buff? <intent tuple>)`. Binding `chain-id` into the domain means a signature made for testnet can never be replayed on mainnet, and vice versa.

The router recovers the signer's principal from the signature using `secp256k1-recover?` + `principal-of?`, rather than requiring the caller to supply a public key. A Stacks address is a hash of the public key, so a relayer cannot derive it from the user's address; recovery removes that out-of-band burden and shrinks the settlement calldata.

## Architecture

### Clarity Contracts

`privara-router`

The main SIP-010 intent settlement contract.

Responsibilities:

- hold user deposits per asset
- recover the signer from a SIP-018 signature and verify signed payment intents
- enforce nonces and expiries
- prevent replayed settlements (keyed on the full signed digest)
- execute SIP-010 transfers under a scoped `with-ft` allowance
- support relayer fee payment
- allow users to withdraw unspent deposits at any time

The router whitelists a single settlement asset (sBTC). Every router-initiated transfer runs inside an `as-contract?` block bounded by a `(with-ft ...)` allowance for that asset and the exact amount, so the contract can never move more than the settlement authorizes. The whitelisted principal is the only line that changes per network (`.mock-token` in tests, testnet sBTC, mainnet sBTC).

`privara-registry`

A relayer registry for testnet operators and future integrations.

Responsibilities:

- register relayer metadata
- expose relayer availability and fee information
- support future staking or reputation mechanisms

`privara-attested-pool`

An optional research prototype for fixed-denomination shielded-note redemption with explicit trust assumptions.

Responsibilities:

- store commitments
- verify coordinator or federation signatures
- enforce nullifier uniqueness
- document the privacy and trust boundaries clearly

### TypeScript SDK

The M1 SDK core (`sdk/`) provides:

- `createIntent` / `signIntent(intent, privateKey, network)` — SIP-018 structured-data signing; produces the 65-byte RSV signature `settle-intent` accepts
- `hashIntent` / `domainHash` / `messageDigest` — offline digest helpers, no RPC needed to sign
- `buildSettlementArgs` — formats a `SignedIntent` into the positional args for `settle-intent`

M2 will add encrypted note payload support (`encryptNote` / `decryptNote` via ECIES), nonce/expiry helpers that fetch live chain state, and wallet integration utilities (Leather, Xverse structured-message signing).

### Reference Relayer

The relayer service will:

- receive authorized settlement requests
- validate intent structure and signatures
- submit settlement transactions
- track execution status
- expose simple APIs for wallets and demo apps

### Demo App

The demo app will show:

- wallet-to-wallet SIP-010 intent creation
- relayer-submitted settlement
- fresh-address recipient flow
- transaction status tracking
- a simulated DAO payout flow

## Use Cases

### Wallet-To-Wallet Payments

Users can create signed SIP-010 payment intents and have a relayer execute settlement instead of submitting direct transfers from their long-term wallet.

### DAO Payroll

DAO treasuries can prepare payment instructions for contributors while reducing the visibility of direct treasury-to-contributor wallet relationships.

### DeFi Preparation Flows

Users can route funds to fresh addresses before entering public DeFi positions, reducing the direct link between their long-term funding wallet and later protocol activity.

### Wallet And Protocol Integrations

Wallets, DAO tools, and DeFi apps can integrate Privara's SDK to support privacy-aware SIP-010 transfer flows without building the underlying intent and relayer infrastructure themselves.

## Grant Milestones

### Milestone 1: Privara Core Protocol + Testnet Router

Target: 4 weeks

Deliverables:

- Clarity router contract deployed on Stacks testnet
- intent hash, nonce, and expiry system
- relayer-executed authorized SIP-010 transfers
- tests for replay protection and invalid authorization
- public demo video of the working flow

### Milestone 2: SDK + Relayer + Developer Integration Layer

Target: 4 weeks after Milestone 1

Deliverables:

- TypeScript SDK for intent creation and signing
- reference relayer service
- demo application with end-to-end testnet flow
- simulated DAO payout flow or one external integration
- developer documentation

## Success Metrics

Privara's first phase is successful if it produces:

- 25 or more successful testnet intent executions, or
- one external wallet, DAO tool, or protocol integration demonstrating usage

Additional signs of success:

- stable relayer execution during testnet
- reusable SDK APIs
- clear privacy documentation
- positive feedback from Stacks wallet, DAO, or DeFi builders

## Current Status

Milestone 1 core protocol and minimal SDK helpers are implemented. All 40 tests pass on Clarinet simnet, 6 contracts clean.

**Contracts (simnet, Clarity 4):**
- `privara-router` — deposit, SIP-018 signed-intent settlement (recover-based auth via `secp256k1-recover?` + `principal-of?`), withdraw, scoped `with-ft` allowances, replay/nonce/expiry protection, and event emission.
- `privara-registry` — relayer registration (pubkey, fee rate, endpoint), lookup, endpoint update, and deactivation.
- `mock-token` — minimal SIP-010 token used as the whitelisted asset in simnet tests.

**TypeScript SDK (`sdk/`):**
- Real SIP-018 `hashIntent`, `domainHash`, `messageDigest` — computed offline, no RPC needed to sign.
- `signIntent(intent, privateKey, network)` — produces the 65-byte RSV signature `settle-intent` accepts.
- `buildSettlementArgs` — formats a `SignedIntent` into the positional args for `settle-intent`.
- SDK↔contract digest parity proven by test (byte-for-byte match on `hash-intent`, `get-domain-hash`, `message-digest`).

**Demo scripts (`scripts/`):**
- `deposit.ts`, `create-intent.ts` (signs offline, prints JSON), `settle.ts` (relayer broadcasts), `status.ts`.
- Network-configurable via env vars; see [scripts/README.md](scripts/README.md).

**Next:** testnet deployment and live end-to-end demonstration.

## Build and Test

Requires [Clarinet](https://github.com/hirosystems/clarinet) and Node.js.

```bash
npm install        # install test dependencies
clarinet check     # type-check all contracts
npm test           # run the Clarinet/Vitest contract test suite
```

## Repository Layout

```text
contracts/      Clarity contracts (router, registry, mock-token, sip010 trait)
sdk/            TypeScript SDK
relayer/        Reference relayer service
app/            Demo application
docs/           Protocol specs and integration docs
tests/          Contract and integration tests
```

## License

MIT license planned.
