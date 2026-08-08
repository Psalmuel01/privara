# Privacy Model

Privara v1 focuses on reduced wallet traceability rather than full cryptographic privacy.

## What Privara v1 Improves

- separates payment authorization from transaction submission
- allows relayers to submit settlement transactions
- keeps the authorizing principal out of plaintext calldata — `settle-intent` takes
  no `user` argument and emits none in its print event; the payer is recovered from
  the signature inside the contract. Casual observers, block explorers, and
  token-event feeds therefore do not see who paid; recovering the payer takes
  deliberate `secp256k1-recover?` work per settlement (see What Remains Public)
- supports encrypted offchain payment instructions
- encourages fresh-address recipient flows
- gives wallets and protocols reusable privacy-aware payment tooling

## What Remains Public

Normal SIP-010 settlement still exposes information onchain.

Plaintext (visible to any casual observer or explorer):

- settlement transaction
- asset
- amount
- recipient address
- timing
- relayer address

Recoverable with effort (not plaintext, but not hidden):

- **the payer.** The payer is not a calldata field, so it does not appear in the
  transaction args, the print event, or token-transfer feeds. But the 65-byte signature
  is public, so anyone willing to reconstruct the SIP-018 digest and run
  `secp256k1-recover?` over each settlement can derive the payer. v1 raises the *cost*
  of linking a payment to its payer; it does not make the payer unlinkable against a
  determined indexer.

## What Privara v1 Does Not Claim

Privara v1 does not claim:

- hidden amounts
- hidden settlement recipients
- fully trustless Tornado-style shielded pools
- complete timing privacy

## Research Direction

The longer-term research direction is stronger shielded-note infrastructure using private membership proofs, blind-signature patterns, federated attestation, or future Stacks cryptographic improvements.

