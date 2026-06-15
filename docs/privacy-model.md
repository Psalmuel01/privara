# Privacy Model

Privara v1 focuses on reduced wallet traceability rather than full cryptographic privacy.

## What Privara v1 Improves

- separates payment authorization from transaction submission
- allows relayers to submit settlement transactions
- supports encrypted offchain payment instructions
- encourages fresh-address recipient flows
- gives wallets and protocols reusable privacy-aware payment tooling

## What Remains Public

Normal SIP-010 settlement still exposes information onchain.

Public information may include:

- settlement transaction
- asset
- amount
- recipient address
- timing
- relayer address

## What Privara v1 Does Not Claim

Privara v1 does not claim:

- hidden amounts
- hidden settlement recipients
- fully trustless Tornado-style shielded pools
- complete timing privacy

## Research Direction

The longer-term research direction is stronger shielded-note infrastructure using private membership proofs, blind-signature patterns, federated attestation, or future Stacks cryptographic improvements.

