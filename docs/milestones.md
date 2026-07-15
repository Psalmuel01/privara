# Milestones

## Milestone 1: Core Protocol + Testnet Readiness

Target: 4 weeks.

**Deliverables:**

1. Implement the privara-router Clarity contract for SIP-010 payment intents.
2. Support signature verification, nonce tracking, expiry enforcement, relayer authorization, and replay protection.
3. Deploy the router contract to Stacks testnet.
4. Demonstrate an end-to-end testnet flow where a user creates a signed payment intent and a relayer settles the intent on-chain.
5. Maintain a public GitHub repository with contract code, tests, deployment details, and setup instructions.
6. Publish a protocol specification covering the intent model, authorization flow, relayer role, privacy assumptions, threat model, and non-goals.

## Milestone 2: Mainnet Launch + SDK, Relayer, and Early Usage

Target: 4 weeks after Milestone 1.

**Deliverables:**

1. Deploy the privara-router contract to Stacks mainnet.
2. Implement a TypeScript SDK for creating intent hashes, encrypted notes, settlement messages, and fresh-address routing workflows.
3. Implement a reference relayer service with documented APIs and deployment instructions.
4. Build a React demo app showing wallet-to-wallet and DAO-style SIP-010 payment flows.
5. Demonstrate privacy-aware mainnet transfers using sBTC or another SIP-010 asset.
6. Publish developer documentation for the contracts, SDK, relayer, and demo app.
7. Publish a demo video showing the full flow from intent creation to relayer settlement on mainnet.
8. Publish a security and threat model review covering verification, authorization, replay protection, relayer trust assumptions, privacy limitations, and user-risk disclosures.
9. Provide a final grant update with links to the repo, mainnet contracts, SDK, relayer, demo app, documentation, demo video, mainnet transactions, usage metrics, and known limitations.

## Final Adoption Metric

- At least 25 successful end-to-end mainnet intents processed by the relayer.
- At least 5 distinct mainnet wallets participating in intent creation or settlement.
- At least 2 non-team wallets completing a mainnet intent flow.
- At least 1 DAO-style or payout-style mainnet flow demonstrated.
- At least 1 non-team developer, wallet team, DAO tooling team, or DeFi protocol
- reviews the SDK, demo, or protocol specification and provides written feedback.
- At least 1 public Stacks forum post or equivalent public write-up sharing the
- protocol specification, privacy assumptions, mainnet demo, and integration path.
- At least 1 independently reproducible mainnet flow using the public documentation.
