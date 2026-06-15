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

1. A user creates a SIP-010 payment intent offchain.
2. The intent includes the asset, amount, recipient or fresh address, relayer fee, nonce, and expiry.
3. The user signs the intent.
4. A relayer receives the authorized settlement request.
5. The relayer submits the settlement transaction on Stacks testnet.
6. The Clarity router verifies authorization, nonce, expiry, and replay protection.
7. The router executes the SIP-010 transfer and pays the relayer fee where applicable.

This separates user authorization from settlement submission. The chain still sees the settlement, but the transfer no longer appears as a direct sender-submitted wallet-to-wallet payment.

## Architecture

### Clarity Contracts

`privara-router`

The main SIP-010 intent settlement contract.

Responsibilities:

- verify signed payment intents
- enforce nonces and expiries
- prevent replayed settlements
- execute SIP-010 transfers
- support relayer fee payment

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

The SDK will provide:

- intent creation
- intent hashing
- nonce and expiry helpers
- signature generation and verification helpers
- encrypted note payload support
- relayer request formatting
- wallet and protocol integration utilities

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

Target: 6-8 weeks

Deliverables:

- Clarity router contract deployed on Stacks testnet
- intent hash, nonce, and expiry system
- relayer-executed authorized SIP-010 transfers
- tests for replay protection and invalid authorization
- public demo video of the working flow

### Milestone 2: SDK + Relayer + Developer Integration Layer

Target: 6-8 weeks after Milestone 1

Deliverables:

- TypeScript SDK for intent creation and signing
- reference relayer service
- demo application with end-to-end testnet flow
- simulated DAO payout flow or one external integration
- developer documentation

## Success Metrics

Privara's first phase is successful if it produces:

- 100 or more successful testnet intent executions, or
- one external wallet, DAO tool, or protocol integration demonstrating usage

Additional signs of success:

- stable relayer execution during testnet
- reusable SDK APIs
- clear privacy documentation
- positive feedback from Stacks wallet, DAO, or DeFi builders

## Current Status

Privara is in early grant and protocol design stage. The current focus is the SIP-010 intent router, relayer execution flow, SDK interface, and testnet demo.

## Repository Layout

Planned structure:

```text
contracts/      Clarity contracts
sdk/            TypeScript SDK
relayer/        Reference relayer service
app/            Demo application
docs/           Protocol specs and integration docs
tests/          Contract and integration tests
```

## License

MIT license planned.

