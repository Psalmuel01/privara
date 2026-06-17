# 🙍‍♂️ STEP 1 — Applicant Identity

## **Legal name**

Samuel Dahunsi

---

# 🧾 STEP 2 — Project

## **Project name**

Privara

---

## **Primary category**

Privacy

---

## **Secondary category**

Developer Tools & Infrastructure
---

## **Repo**

[Github](https://github.com/Psalmuel01/privara)
---

## **Project Description**

Privara is a SIP-010 privacy execution layer for Stacks that enables intent-based transfers with reduced wallet traceability. It introduces a router-based settlement system where users sign encrypted payment intents that can be executed by relayers, separating transaction authorization from onchain settlement.

Today, SIP-010 transfers on Stacks are fully transparent, exposing wallet relationships, treasury flows, and payment patterns. Privara addresses this by introducing:

- intent-based payment authorization
- relayer-submitted settlement transactions
- encrypted offchain payment instructions
- fresh-address routing for recipients
- a reusable SDK for integrating privacy-aware transfers into wallets and DeFi apps

The grant funds the development of a working testnet protocol including Clarity smart contracts, a TypeScript SDK, and a reference relayer service that demonstrates privacy-preserving SIP-010 transfers in real applications such as DAO payouts and wallet-to-wallet payments. This gives Stacks useful privacy today and a migration path to stronger ZK proofs verification later, when supported.

---

# 👥 STEP 3 — Audience and ecosystem fit

## **Primary audience**

Stacks users who need payment privacy, wallet teams, DAO treasury operators, DeFi protocols integrating deposits/payouts, and developers building privacy-aware applications.
---

## **Audience segmentation**

- Individual users: people who want wallet-graph privacy when transferring SIP-010 assets
- Wallet developers who want to offer "private transfer" as a native SIP-010 action
- DAO treasuries managing payroll and contributor payouts
- DeFi protocols handling deposits, withdrawals, and liquidity flows
- Relayer operators providing execution services
- Builders integrating privacy-preserving payment flows into apps

---

## **Why Stacks?**

Privara is built specifically for Stacks because SIP-010 token transfers are fully transparent at the application layer, creating a gap for privacy-aware financial workflows.

Stacks also has:

* Clarity smart contracts with deterministic execution
* growing sBTC ecosystem enabling Bitcoin-denominated financial activity
* intent-based execution patterns emerging across DeFi tooling

Privara uses these primitives to introduce a privacy execution layer that sits between user intent and SIP-010 settlement. This cannot be ported directly from other ecosystems because it depends on Clarity-based authorization verification and SIP-010 token standards.

---

## **Maintenance plan**

The project will be maintained by myself with ongoing updates post-grant. The codebase will be open source with:

- monthly versioned releases during development
- public issue tracking on GitHub
- documentation updates for SDK and contract integration
- support for early integrators (wallets and DAO tools) during testnet phase

Maintenance will focus on stability updates, relayer improvements, and ecosystem integration support.
After enough traction, I'll pursue follow-on funding for mainnet deployment, protocol integrations and further iterations.

---

## **Ecosystem fit**

Privara directly aligns with the Privacy focus area in this cycle. It advances Bitcoin-native finance by helping Stacks users and protocols reduce direct wallet-to-wallet traceability in payments/treasury flows, and creates a foundation for stronger privacy as Clarity evolves. 

The protocol provides a reusable infrastructure that any Stacks builder can integrate for SIP-010 transfers, rather than a single-application product. This multiplies the ecosystem impact beyond Privara's own users. As sBTC TVL grows toward $1B (currently ~$200M), the absence of any privacy layer becomes increasingly limiting for the class of users Bitcoin DeFi needs to attract.

Privara also establishes the architectural foundation for stronger ZK-based privacy on Stacks when Clarity gains pairing operations, meaning this grant funds infrastructure that compounds in value as the runtime evolves.

---

# ⚠️ STEP 4 — Risk and prior history

## **Referral source**

Stacks Endowment announcement tweet

---

## **Risk disclosure**

Main risks:

- Clarity runtime constraints: Clarity lacks onchain ZK proof verification. Privara v1 is explicitly designed around this, using commitment hashing and signature-based authorization rather than ZK proofs. This is documented in the protocol spec as a non-goal, not an oversight.

- Relayer liveness: if all relayers go offline, users can self-settle using their own key, though this reveals more metadata. Mitigation: the registry supports multiple competing relayers; the self-settle path is included in v1.

---

## **Prior grants**

Stacks Ascent 2025 for Stackpay MVP

---

## **Prior Stacks work**

StackPay: a Bitcoin-native SIP-010 payments gateway on Stacks, production Clarity contracts, Bitcoin settlement logic, and full-stack integration. This is my primary prior Stacks work and demonstrates direct familiarity with Clarity's execution model, SIP-010 token standard, and Stacks transaction lifecycle.

---

# 💰 STEP 5 — Track and qualification

## Grant track

Getting Started track

---

## **Requested amount, USD**

7,500

---

# 🧠 STEP 6 — Track-specific context

## **What are you proposing to explore or build?**

A privacy-preserving SIP-010 payment intent system for Stacks. Core deliverables: 

1. A privara-router Clarity contract for relayer-settled payment intents with signature verification, nonce tracking, and expiry enforcement
2. TypeScript SDK for generating intent hashes, encrypted notes, and settlement messages
3. A reference relayer implementation for non-custodial transaction submission;
4. React demo app for creating intents and managing fresh-address workflows
5. Testnet deployment with working sBTC or SIP-010 flows.

---

## **What user or ecosystem problem motivates the project?**

All SIP-010 transactions are fully transparent and expose complete wallet graphs, treasury flows, and payment patterns. This limits the usability of Stacks for DAOs, DeFi protocols, and institutions that require basic financial privacy for operational security and user protection.

As sBTC adoption grows, the need for privacy-preserving payment flows will increase, yet Stacks currently lacks native privacy infrastructure for SIP-010 assets.

---

## **Why is Stacks the right environment for this work?**

Stacks ecosystem possesses the ideal combination of market demand, asset liquidity, and runtime primitives to make Privara a reality. The Foundation’s open RFP explicitly highlights the need for shielded SIP-010 asset transactions and intent-based architectures. Concurrently, sBTC provides a secure, Bitcoin-native settlement asset with a rapidly expanding TVL, yet it lacks any form of privacy layer. By leveraging Clarity’s native sha256, secp256k1-verify, and contract-code-hash builtins, we can engineer and deploy a robust V1 immediately.

While networks like Ethereum have established mature privacy layers via Tornado Cash, Aztec, and Privacy Pools, Stacks remains entirely unserved. With production smart contracts, scaling liquidity, and an active DeFi community, Stacks is uniquely positioned for this infrastructure, making this the right moment to build its premier privacy engine.

---

## **What have you already validated, prototyped, or learned?**

I conducted a comprehensive technical feasibility assessment of privacy-preserving asset transfers on Stacks to ensure the proposed architecture aligns with the capabilities and constraints of Clarity. Key conclusions from that review include:

- Clarity's existing primitives, including `sha256`, `secp256k1-verify`, and `contract-code-hash`, are sufficient to support commitment hashing, relayer authorization, registry verification, and replay protection.
- Clarity does not currently support BN254 pairing operations or equivalent cryptographic primitives required for on-chain zero-knowledge proof verification. Rather than treating this as a limitation to work around, the protocol architecture is intentionally designed around these constraints.
- There is currently no established shielded SIP-010 asset transfer protocol on Stacks, leaving a significant opportunity to introduce privacy-preserving transaction infrastructure within the ecosystem.
- The proposed v1 architecture, including intent-based routing, signature-based authorization, relayer settlement, commitment verification, and replay protection, maps directly onto Clarity's available primitives and can be implemented without requiring protocol-level changes.

As a result, the proposed design is not speculative. It is based on a validated assessment of what can be built securely and realistically on Stacks today, while preserving a clear upgrade path for stronger privacy guarantees as the ecosystem's cryptographic capabilities evolve.

---

## **Who will do the work and what experience do they bring?**

I will lead the design and implementation of the system end-to-end.

I have prior experience building privacy and crypto-native systems, including VeilMarkets (a private prediction market on Aleo), StackPay (a Bitcoin-native payments system on Stacks), and Iris ID (commitment-based identity proofs). Across these projects, I worked directly with primitives relevant to this grant - commitment schemes, nullifiers, intent-style execution flows, and cryptographic identity constructs.

In addition to product building, I have conducted security reviews and audits of DeFi systems, identifying critical vulnerabilities and protocol-level risks. I also have a mathematics background (BSc.) with emphasis on formal reasoning in cryptographic protocols, particularly around commitments, privacy-preserving state transitions, and adversarial threat modeling.

I believe this combination of privacy-system engineering experience and smart contract development on Stacks positions me to implement Privara as a production-grade intent and relayer-based privacy layer for SIP-010 assets.

---

## **What is the smallest useful outcome this grant should produce?**

The smallest useful outcome is a working `privara-router` contract deployed on testnet that can verify signed payment intents, enforce nonce and expiry protections, execute SIP-010 token settlement, and distribute relayer fees.

Accompanying this would be a minimal end-to-end demonstration showing a user creating a signed intent and a relayer successfully settling that intent on-chain.

This represents the core protocol primitive and the minimum viable proof that intent-based private payments can function on Stacks. All other deliverables, including the SDK, relayer infrastructure, developer tooling, and user-facing interfaces, are built on top of this foundation.

---

## **What evidence will show the concept is worth continuing?**

- 25+ successful end-to-end testnet intents processed by the relayer
- At least one Stacks wallet or DeFi protocol expresses interest in SDK integration
- Public demo video showing the full user flow from intent creation to relayer settlement
- Protocol spec reviewed and discussed publicly in the Stacks community forum
- Documented security and threat model review that confirms the verification and authorization mechanism is sound.

---

## **What dependencies or risks could affect delivery?**

While the project is intentionally scoped to minimize delivery risk, the following dependencies and considerations have been identified:

- Clarity Runtime and Current Protocol Capabilities
Privara is designed around the primitives available in Clarity today and does not depend on future language upgrades or protocol changes. Core functionality, including commitment hashing, signature verification, relayer authorization, and replay protection, can be implemented using existing Clarity capabilities. Future additions to Clarity may enable stronger privacy guarantees, but they are not required for v1 delivery.

- sBTC and SIP-010 Asset Availability
The primary demonstration asset will be sBTC on testnet. While sBTC testnet infrastructure has been stable, the protocol architecture is asset-agnostic and can operate with any SIP-010 token. This provides a straightforward fallback path if testnet conditions change during development.

- Relayer Infrastructure
The relayer is an off-chain component and represents the primary operational dependency within the v1 architecture. To reduce risk, the grant scope includes a reference relayer implementation with documented APIs and deployment instructions, allowing independent operators to run compatible relayers.

- Security and Privacy Assumptions
Because Clarity does not currently support on-chain zero-knowledge proof verification, v1 focuses on privacy through intent abstraction, commitment schemes, and relayer-mediated settlement rather than fully shielded transfers. This is a deliberate design choice, not a technical blocker, but it does define the privacy guarantees achievable in the initial release.

- Scope Management
The grant scope is intentionally conservative. Deliverables are limited to testnet smart contracts, SDK tooling, a reference relayer, protocol specifications, documentation, and developer resources. Mainnet deployment, production infrastructure, and advanced privacy extensions are explicitly outside the scope of this grant, significantly reducing execution risk and increasing confidence in successful delivery.

---

## **What support from the Stacks ecosystem would help?**

- Technical review of the protocol specification from the Stacks developer ecosystem, particularly around intent hash design, signature verification flows, and correct usage of secp256k1-verify in Clarity contracts
- Introductions to one or two wallet or DeFi protocol teams for early-stage integration feedback and validation of the SDK and intent lifecycle
- Community visibility to help recruit early relayer operators willing to run the reference implementation on testnet and provide operational feedback under real conditions
- Direct introductions to wallet teams such as Leather and Xverse for integration discussions, testing support, and potential adoption of intent-based SIP-010 flows in wallet UX

---

## **How will you share progress or learnings publicly?**

- A public GitHub repository from day one, containing all smart contracts, SDK code, tests, and the reference relayer implementation in open source form
- Regular milestone updates posted on the Stacks forums, including deployed testnet addresses, progress summaries, and transparent notes on what worked and what didn’t
- A milestone demo video showing the full end-to-end flow from intent creation to relayer execution and settlement on testnet
- A standalone protocol specification document outlining architecture, intent model, privacy assumptions, threat model, and non-goals in a review-friendly format
- Public developer documentation for the SDK and contracts to support early experimentation and integration by wallets and protocols

---

## **What happens after the grant if the work succeeds?**

If the grant is successful, Privara will transition from a prototype into a reusable privacy execution layer for SIP-010 and sBTC flows.

Post-grant work will focus on expanding wallet and DeFi integrations, enabling DAO treasury usage, and strengthening the relayer architecture toward a more decentralized network. As the system matures, it can be extended to support stronger privacy primitives as Clarity and the broader Stacks ecosystem evolves.

The next phase would include preparing for mainnet deployment with a formal security audit, pursuing additional ecosystem funding or builder grants for deeper protocol integrations, and evolving the relayer system into a multi-operator network. Parallel efforts would focus on wallet and protocol partnerships for SDK adoption, along with continued open-source maintenance and ecosystem support.

---

## **Any other context reviewers should consider?**

Privara is intentionally scoped as a practical privacy layer rather than a fully trustless mixer. It focuses on shipping usable privacy improvements within current Clarity constraints while establishing a clear upgrade path toward stronger cryptographic privacy in future Stacks improvements.

---

# ✅ STEP 7 - Compliance Readiness

# 🧱 STEP 8 — Milestones

## **Milestone 1**

**Name:** Privara Core Protocol + Testnet Router

**Target date:** August 14th, 2026

**Description:**
Build and deploy the core Privara SIP-010 intent router on Stacks testnet, enabling signed payment intents and relayer-executed settlement with nonce-based replay protection and expiry enforcement.

**Success criteria:**

1. privara-router Clarity contract deployed on testnet with settle-intent function, nonce map, expiry enforcement, secp256k1-verify relayer auth, and SIP-010 transfer execution
2. privara-registry Clarity contract deployed with relayer registration, optional STX staking, and public key mapping for authorization
3. Clarinet test suite passing (valid settlement, replay rejection, invalid signature rejection, expired intent rejection, fee accounting correctness)
4. Protocol specification published (threat model, privacy guarantees, non-goals, upgrade path toward stronger cryptographic privacy)
5. Public GitHub repository with working end-to-end contract demo
6. Testnet deployment publicly verifiable with contract addresses

**Payment percent:** 50%

---

## **Milestone 2**

**Name:** SDK + Relayer + Developer Integration Layer

**Target date:** September 14th, 2026

**Description:**
Deliver full developer tooling and execution layer enabling wallets, DAOs, and DeFi protocols to create and execute private payment intents via a non-custodial relayer network on Stacks.

**Success criteria:**

1. TypeScript SDK published to npm (createIntent, hashIntent, encryptNote, generateNonce, buildSettlementMsg, wallet adapter helpers)
2. Reference relayer implementation open-sourced (listens for intents, validates and executes settlements, non-custodial submission, fee collection)
3. React demo application showing intent creation, signing, relayer execution, and settlement confirmation
4. Developer documentation (SDK guide, integration guide, relayer architecture overview)
5. Public demo video (3–5 min) showing full lifecycle: intent → relayer → settlement
6. Stacks forum post with milestone update, learnings, and ecosystem feedback

**Payment percent:** 50%

**Final adoption metric:**

≥25 successful end-to-end testnet intent executions
≥1 external wallet or protocol integration actively demonstrating usage on Stacks
