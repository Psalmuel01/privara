# Grant Application - Stacks Ecosystem Fund

**RFP Reference:** Shielded Transactions (Privacy) - Confidential SIP-010 asset transactions, including intent-based protocols  
**Project Title:** Privara - Privacy-Preserving SIP-010 Payment Infrastructure for Bitcoin-Native Finance  
**Applicant:** Samuel Dahunsi - github.com/psalmuel01  
**Requested Duration:** 5 months  
**Category:** Privacy Infrastructure / Protocol Primitive  
**Status:** Revised technical framing after feasibility review

---

## 1. Executive Summary

Privara is a privacy infrastructure project for SIP-010 assets on Stacks. It explores and implements the strongest practical privacy layer that can be built with Clarity today: a payment-intent and shielded-note toolkit that reduces wallet-graph leakage, supports private note delivery, and prototypes stronger shielded pools with explicit trust assumptions.

The key design choice is honesty about what Stacks can and cannot support today:

- **Feasible today:** private note delivery, fresh-address payment flows, relayer-submitted settlement, signed payment authorization, relayer registries, metadata-reduction UX, SDKs, and protocol adapters that make SIP-010 flows less publicly linkable.
- **Partially feasible with explicit trust assumptions:** coordinator- or relayer-attested shielded withdrawals where an offchain verifier checks private note validity and the onchain contract verifies the verifier's signature.
- **Not feasible today in a fully trustless way without onchain ZK verification or equivalent private membership proofs:** arbitrary SIP-010 transfers where the contract hides both the amount and recipient, or Tornado-style unlinkable pools where withdrawals prove membership without revealing which deposit created the note.

Privara v1 therefore focuses on a realistic productizable primitive: **privacy-preserving SIP-010 payment tooling plus an attested shielded-note prototype**. It improves payment privacy by separating long-term wallets from recipient-facing settlement, supporting encrypted payment instructions, routing settlement through relayers, encouraging fresh-address workflows, and giving protocols a standard integration surface for privacy-aware deposits, payouts, and treasury movement.

This is not a port of Tornado Cash, Aztec, or an Ethereum design. It is a Stacks-native protocol shaped around Clarity's current execution model, SIP-010 assets, sBTC growth, and the Stacks RFP request for shielded/confidential SIP-010 transactions.

---

## 2. What Exactly Are We Building?

Privara v1 is a set of contracts, SDKs, and relayer software for privacy-preserving SIP-010 payment flows. The first version should not pretend to be a fully trustless shielded pool. It should deliver useful privacy tooling now while making the trust and privacy boundaries explicit.

### Core User Flow

1. A user selects a SIP-010 asset, recipient mode, relayer, and optional denomination bucket.
2. The frontend generates a private payment intent offchain:
   - asset
   - amount or denomination
   - recipient or fresh withdrawal address
   - relayer fee
   - salt
   - expiry
3. The user funds a router, integrating protocol, or attested pool depending on the selected flow.
4. The recipient or relayer receives only the execution data needed for that flow.
5. The relayer submits the settlement transaction and receives a fee.
6. For the attested-pool prototype, a verifier/coordinator validates private note state offchain and signs a withdrawal authorization.
7. The onchain contract verifies signatures, enforces replay protection, and executes SIP-010 settlement.

### Optional Research Prototype: Attested Shielded Pool

A fully trustless shielded pool is not feasible in Clarity today without private membership proofs. However, an attested pool can be prototyped with explicit trust assumptions:

1. User deposits into a pool and creates a private note.
2. A registered verifier/coordinator checks note validity offchain.
3. The coordinator signs a withdrawal authorization that includes a nullifier, recipient, fee, and expiry.
4. The contract verifies the coordinator signature and nullifier uniqueness.
5. The contract transfers the SIP-010 amount.

This gives the chain less information than a direct transfer, but it introduces verifier trust. The coordinator must not be marketed as trustless. It is a stepping stone and research artifact, not the main security claim.

### Why A Trustless Pool Needs More Than Commitments

A commitment and nullifier are not enough by themselves. The contract must know that the withdrawal corresponds to a real unspent deposit. If the user reveals the note secret to prove that relationship, observers can recompute the commitment and link the withdrawal to the deposit. If the user does not reveal it, the contract needs a private proof of membership, normally a ZK proof or another cryptographic primitive that Clarity does not currently make practical.

That is the key feasibility boundary.

### Practical v1 Tracks

Privara should be proposed as two connected tracks:

**Track A: Non-custodial privacy tooling**

- encrypted payment notes
- fresh-address and wallet-hygiene flows
- relayer-submitted settlement where possible
- adapter patterns for wallets, payroll tools, DAO payouts, and DeFi protocols
- clear privacy scoring that warns users when a flow remains linkable

This track is feasible and useful, but it provides metadata reduction rather than full shielded transfer privacy.

**Track B: Attested or blind-signed shielded-note prototype**

- fixed-denomination deposits
- offchain verifier, coordinator, or federation
- nullifier/replay protection onchain
- settlement or redemption authorization verified by Clarity signatures
- explicit documentation of trust assumptions

This track is the real research contribution. If a blind-signature construction compatible with Clarity signature verification is practical, it can reduce coordinator linkage. If not, the prototype remains an attested design with clear verifier trust.

### What Privara v1 Provides

| Property | Realistic v1 Guarantee |
|---|---|
| Sender-recipient linkage | Reduced through encrypted notes, relayers, fresh addresses, delayed settlement, and optional denomination buckets |
| Deposit amount | Public unless routed through an integrating protocol with its own abstraction |
| Settlement amount | Public to the chain for normal SIP-010 settlement |
| Recipient address | Public at final settlement unless the recipient uses a fresh address |
| Sender address | Hidden from the settlement transaction when a relayer submits it |
| Replay protection | Enforced onchain with nonces, intent hashes, expiries, and optional nullifiers |
| Relayer custody | None. Relayers submit authorized transactions but cannot redirect funds |
| Protocol integration | Possible through router, note, relayer, and adapter interfaces |

### What Privara v1 Does Not Claim

Privara v1 does **not** claim fully confidential arbitrary SIP-010 settlement where amount and recipient are invisible to the chain. In Clarity today, if a contract transfers SIP-010 tokens to a recipient, the contract must know the recipient and amount at execution time, and those values are normally exposed through transaction arguments, state changes, and token events.

Privara v1 also does **not** claim a fully trustless Tornado-style pool. A trustless unlinkable pool requires the withdrawal to prove membership in the deposit set without revealing which commitment it spends. That requires ZK proofs, ring signatures, blind-signature infrastructure, or another private membership mechanism. Clarity's currently exposed primitives are enough for signatures and hashes, but not enough for that full trustless construction.

Privara v1 is therefore best described as:

> A privacy-preserving SIP-010 payment toolkit that reduces public linkage, supports private note delivery and relayer settlement, and includes a clearly scoped research prototype for stronger shielded notes.

This is still valuable. Practical financial privacy often starts with reducing the obvious wallet graph: separating funding wallets from recipient-facing wallets, avoiding direct sender-recipient transfers, using relayers, supporting private payment instructions, and making safer privacy defaults available to wallets and protocols.

---

## 3. Why This Use Case Makes Sense

Stacks is becoming a Bitcoin-native financial layer. As sBTC and SIP-010 assets grow, transparent payments become a real limitation.

Users and institutions may not want the public to see:

- treasury movements between operational wallets
- payroll or contractor payouts
- position funding before using a DeFi protocol
- fund rebalancing
- OTC settlement preparation
- recurring payments
- donations or grants
- transfers between personal wallets

The point is not to make illicit activity easier. The point is that public financial rails expose too much by default. Privacy is normal in traditional finance. A Bitcoin-native financial ecosystem needs privacy primitives if it wants serious users, businesses, and institutions.

Privara gives Stacks a credible first privacy layer that can be built now.

---

## 4. Why It Matters For Stacks

The Stacks RFP explicitly calls for shielded/confidential SIP-010 asset transactions and mentions intent-based protocols. Privara addresses that request directly.

### Ecosystem Impact

**More meaningful onchain activity:** Privara creates a new transaction category: encrypted payment intents, relayer settlement, fresh-address flows, attested note redemption, and protocol-integrated privacy flows.

**More useful sBTC:** sBTC becomes more institution-friendly when holders have a privacy-aware transfer and treasury-management option.

**Reusable infrastructure:** Instead of every DeFi team inventing privacy tooling, Privara provides shared contracts, SDKs, and integration guides.

**New relayer fee market:** Relayers can earn fees for settlement execution, creating a small but real service economy around privacy-preserving payments.

**Better developer experience:** Protocols get adapter patterns for encrypted payouts, fresh-address deposits, relayer settlement, and future shielded-note flows.

**Foundation for future ZK privacy:** If Stacks later supports efficient proof verification or another viable private membership primitive, Privara's intent, note, relayer, and adapter architecture can evolve toward stronger hidden-amount and hidden-recipient designs.

---

## 5. Feasibility Review

### What Clarity Supports Today

Clarity supports the core building blocks needed for v1 payment privacy tooling:

- maps for commitments, nullifiers, nonces, and replay protection
- SIP-010 contract calls
- `sha256` hashing
- `secp256k1-verify` for signature authorization
- `secp256r1-verify` introduced in Clarity 4, useful for future passkey experiments but currently requiring care because of documented message-hash behavior
- `contract-hash?` introduced in Clarity 4 for checking deployed contract code hashes

These are enough to build replay-protected payment intents, private note delivery tooling, relayer settlement, and an explicitly trusted/attested shielded-note prototype.

### What Clarity Does Not Give Us Yet

Clarity does not currently provide the practical onchain ZK proof verification environment needed for full hidden-amount, hidden-recipient arbitrary transfers. Without that, the contract cannot safely transfer assets without learning and exposing the transfer amount and recipient.

It also does not give us a practical trustless private membership proof for a classic shielded pool. This matters because a commitment alone does not prove that a hidden withdrawal is valid. The contract needs either:

- public transfer data, which weakens confidentiality, or
- a trusted/attested verifier, which introduces trust assumptions, or
- a zero-knowledge/private membership proof, which Clarity does not currently make practical for this use case.

### Revised Technical Claim

The fundable and technically credible claim is:

> Privara v1 brings privacy-preserving payment tooling to SIP-010 assets on Stacks, reducing wallet-graph leakage today while documenting and prototyping the path to stronger shielded notes later.

That claim is achievable.

---

## 6. Architecture

### 6.1 Contracts

**`privara-router`**

The main settlement contract for authorized SIP-010 payment intents where a router flow is appropriate.

Responsibilities:

- verify user intent signatures
- enforce nonces and expiries
- execute SIP-010 transfers
- pay relayer fee where applicable
- emit minimal events

Core functions:

```clarity
(define-public (settle-intent
  (intent-hash (buff 32))
  (asset <sip010-trait>)
  (amount uint)
  (recipient principal)
  (relayer principal)
  (relayer-fee uint)
  (user-sig (buff 65))
  (expiry uint)))
```

The exact signature format will be finalized during milestone 1. The important property is that a relayer can execute an authorized intent but cannot change the recipient, amount, fee, or expiry.

**`privara-registry`**

A relayer registry.

Responsibilities:

- register relayer public keys
- optionally require STX stake
- track relayer metadata
- allow users to choose relayers based on fee and availability

Slashing should be conservative in v1. It is difficult to prove many forms of relayer misbehavior onchain. The first version should prioritize registration, reputation, and optional staking over aggressive slashing claims.

**`privara-attested-pool`**

An optional research prototype for fixed-denomination pool redemptions with a registered verifier/coordinator.

Responsibilities:

- accept pool deposits
- store commitments
- verify coordinator redemption signatures
- enforce nullifier uniqueness
- make trust assumptions explicit

This contract is useful for experimentation, but the grant should not make it a trustless claim unless the private membership problem is solved.

**`privara-sip010-adapter`**

An integration interface and example adapter for other protocols.

Use cases:

- DeFi protocols accepting relayer-settled deposits
- protocols routing user payouts through privacy-preserving intents
- DAO payroll tools funding encrypted payment notes
- wallets exposing "private transfer" as a SIP-010 action

### 6.2 SDK

The TypeScript SDK handles offchain note operations:

- generate note secrets
- encode note data
- compute intent hashes
- compute nonces and optional nullifiers
- encrypt note payloads for recipients
- create settlement authorization messages
- integrate with wallets and relayers
- support fresh-address workflows

### 6.3 Relayer

The relayer is a non-custodial transaction submitter.

Responsibilities:

- receive settlement requests offchain
- validate user authorization
- submit settlement transactions
- receive a fee from the settled asset or a separate fee flow

The relayer should not be required for protocol correctness. Users should have a self-settle path if relayers are unavailable, though using it may reveal more metadata.

---

## 7. Privacy Model

Privara's v1 privacy comes from four mechanisms:

1. **Intent separation:** the funding action and final settlement can be split into different steps and wallets.
2. **Relayer execution:** the settlement transaction does not need to be submitted by the sender.
3. **Fresh-address support:** recipients can withdraw or receive to addresses not publicly tied to their long-term wallet.
4. **Private note delivery:** payment instructions can be encrypted offchain instead of posted as public transaction metadata.

For the optional attested-pool prototype, privacy also depends on the coordinator/verifier not linking deposits and withdrawals or leaking private note information.

### Public Information

The following remains public in v1:

- deposit transaction
- asset
- settlement transaction
- settlement amount
- settlement recipient unless the user uses a fresh address
- settlement timing
- relayer address

### Private Or Partially Private Information

The following is protected:

- direct sender-to-recipient transaction path
- private payment instructions
- who authorized the relayer, if the offchain channel is private
- sender identity at settlement time when a relayer submits the transaction

### Metadata Risks

Small flows have weak privacy. If a user funds an intent and settles immediately for a unique amount, observers may infer the relationship. Timing analysis can also reveal likely links.

Mitigations:

- minimum delay recommendations
- UI warnings when a flow has weak privacy
- optional denomination buckets to standardize amounts
- relayer submission by default
- fresh-address generation
- optional batching in later versions

---

## 8. Use Cases

### Private Wallet-To-Wallet Transfer

A user creates a private payment intent for 0.1 sBTC and sends encrypted claim details to a recipient. The recipient or relayer settles to a fresh address. Observers see settlement, but not a normal sender-submitted transfer from the user's long-term wallet to the recipient's long-term wallet.

### Treasury Operations

A project treasury prepares several private payout intents for operational wallets. Public observers may see settlements, but the workflow avoids publishing the full treasury-to-operator wallet graph in one obvious path.

### Payroll And Contractor Payouts

A DAO or company can create private payout instructions for contributors. Contributors receive through relayers or fresh addresses, reducing direct wallet graph exposure.

### DeFi Position Preparation

A user routes funds into a fresh wallet before entering a DeFi position. The protocol interaction is still public, but the user's original funding wallet is less directly linked.

### Integrator Flow

A Stacks DeFi protocol integrates the Privara SDK so users can create relayer-routed deposits or receive payouts without exposing as much wallet linkage.

---

## 9. First Milestone

### Month 1-2: Core Protocol And Spec

Deliverables:

- `privara-router` Clarity contract for SIP-010 intent settlement
- intent hash and nonce tracking
- expiry enforcement
- settlement authorization
- basic relayer fee handling
- Clarinet test suite for settlement, replay rejection, invalid authorization, expiry, and fee accounting
- written protocol spec with threat model, privacy guarantees, and non-goals
- testnet deployment

### Month 3-4: SDK, Relayer, And Multi-Pool Support

Deliverables:

- TypeScript SDK for encrypted notes, intent hashes, nonces, and settlement messages
- relayer reference implementation
- optional denomination-bucket UX
- attested-pool research prototype with explicit trust assumptions
- testnet integration with at least one SIP-010 token, ideally including sBTC testnet flows where available
- latency and fee benchmark report

### Month 5: Frontend, Integrations, And Launch Readiness

Deliverables:

- React/Next.js app for creating intents, encrypted note delivery, and relayer settlement
- fresh-address workflow
- relayer selection
- passkey experiment or documented passkey feasibility report
- integration guide for Stacks wallets and DeFi protocols
- community demo and developer walkthrough
- mainnet readiness checklist

Mainnet deployment should happen only if the security review and testnet results justify it. Otherwise, the milestone should end with audited testnet contracts and a clear mainnet launch plan.

---

## 10. What Success Looks Like

**Technical success**

- no replay or unauthorized-settlement bugs in testnet or mainnet deployment
- independent review confirms the intent authorization model
- reproducible contract deployments
- clear docs that do not overstate privacy

**Adoption success**

- at least one wallet, DAO tool, or DeFi protocol integrates the SDK or adapter
- at least two SIP-010 assets supported on testnet
- at least one sBTC-focused demo flow

**Usage success**

- 100+ successful testnet intents and settlements
- 25+ unique testnet users
- measurable reduction in direct sender-recipient wallet linkage in demo flows
- relayer successfully processes most settlements during testnet

**Ecosystem success**

- Stacks builders can reuse the privacy primitive instead of starting from scratch
- the project creates a credible foundation for future ZK-based or private-membership privacy on Stacks

---

## 11. Would Stacks Fund This?

There is no guarantee, but this is a credible grant direction if framed correctly.

The proposal is likely stronger than a generic trading bot because:

- it directly matches an open RFP
- it creates infrastructure rather than only an app
- it is Stacks-specific
- it helps sBTC and SIP-010 assets become more usable
- it has measurable deliverables
- it can be built incrementally

The biggest funding risk is overclaiming. A reviewer may reject a proposal that says "fully hidden amount and recipient" if the mechanism cannot support that onchain. The stronger approach is to say:

> We are building the first feasible privacy-preserving SIP-010 payment infrastructure on Stacks: relayer settlement, private note delivery, fresh-address workflows, SDKs, integration paths, and an explicitly scoped research prototype for stronger shielded pools. This gives Stacks useful privacy today and a migration path to stronger ZK or private-membership privacy later.

That is specific, technically credible, and aligned with the RFP.

---

## 12. Open Questions To Resolve Before Submission

1. Which first asset should be supported: sBTC, a stablecoin, or a test SIP-010 token?
2. Should v1 support arbitrary amounts, denomination buckets, or both?
3. Should v1 charge relayer fees inside the settled asset or via a separate STX fee?
4. Should Privara support recipient-encrypted notes in v1, or keep note delivery out of scope?
5. Is an attested-pool prototype worth including, or should v1 stay focused on non-custodial intent routing?
6. Should mainnet deployment be promised in month 5, or should the proposal promise testnet plus mainnet-readiness?
7. What compliance-conscious features are appropriate, such as optional view keys or selective disclosure exports?

---

## 13. Why Me

I have built directly in the intersection of privacy, cryptography, and decentralized protocols:

**VeilMarkets on Aleo:** designed and shipped a 7-contract private prediction market on Leo/snarkVM, including FPMM design, collateral separation, consume-pattern authorization, and frontend integration with Shield Wallet.

**Iris Id:** worked on commitment-based identity proofs with selective disclosure.

**StackPay:** built Bitcoin-native payment infrastructure on Stacks and shipped production Clarity contracts.

**Security auditing:** found critical and high-severity issues in DeFi systems, including decimal scaling, nonce, reservation, and redemption-queue bugs.

**Mathematics background:** comfortable with the formal reasoning behind commitments, nullifiers, soundness, and protocol threat models.

Privara sits at the intersection of the systems I have already been building: Stacks, privacy, cryptographic commitments, and production protocol engineering.

---

## 14. Final Positioning

Privara should not be pitched as magic private transfers or a fully trustless mixer. It should be pitched as the first practical privacy infrastructure layer for SIP-010 payment flows on Stacks.

The crisp version:

> Privara brings privacy-preserving intent routing, relayer settlement, private note delivery, and reusable privacy tooling to SIP-010 assets. It gives Stacks users better wallet-graph privacy today, gives protocols an integration path, and lays the groundwork for stronger ZK or private-membership confidentiality as the Clarity runtime evolves.

That is feasible. That is useful. That is fundable.
