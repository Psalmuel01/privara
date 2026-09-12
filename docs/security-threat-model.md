# Privara M2 Security and Threat Model

Status: Implemented controls and external technical feedback documented; independent audit recommended for future higher-value use

## 1. Scope

This document covers:

- M1 signed payment intents
- M2 stealth recipient derivation
- encrypted announcements
- stealth registry
- M2 router
- announcement scanning
- relayer
- sponsored stealth spending
- backup and recovery

Privara is not a fully shielded privacy protocol.

## 2. Assets to Protect

- user SIP-010 deposits
- signed payment intents
- privacy seed
- spending private key
- viewing private key
- derived stealth private keys
- sponsor STX balance
- relayer private key
- sponsor private key
- deployment configuration
- settlement integrity

## 3. Security Goals

Privara should ensure:

1. only a valid signer can authorize settlement from their deposit
2. a signed intent cannot be replayed after settlement
3. a signed intent cannot cross networks or router deployments
4. relayers cannot change payment parameters
5. stealth announcements cannot be substituted after signing
6. stealth funds can be recovered from the privacy seed
7. malformed public data cannot halt all scanning
8. sponsors cannot change origin-signed spend parameters
9. relayer/sponsor private keys remain server-side
10. user stealth keys remain client-side

## 4. Signature Model

M1/M2 intents use SIP-018 structured-data signing.

The payer is recovered from the recoverable secp256k1 signature.

Security property: a relayer cannot settle from another user's deposit without a valid signature over the exact intent fields.

Privacy limitation: the payer is cryptographically recoverable from the signature. Privara therefore does not claim payer anonymity.

## 5. Replay Protection

Replay protection is keyed by the final signed digest.

The random nonce is a uniqueness salt rather than an ordered account counter.

Reissuing with a fresh nonce does not invalidate the original. Users must confirm cancellation or wait for expiry before reissue.

## 6. Cross-Deployment Replay

The signed domain binds:

- chain ID
- exact router principal
- protocol version

This prevents replay between testnet/mainnet, M1/M2, and separate deployments.

## 7. Cancellation Race

Cancellation and settlement are ordinary onchain transactions.

A relayer may settle before a cancellation confirms.

Use short expiries for sensitive intents and require confirmed cancellation before reissue.

## 8. Router Custody

The router holds user deposits before settlement.

Risks:

- contract bug
- incorrect asset configuration
- unsafe transfer allowance
- compromised deployment process

Mitigations:

- asset allowlisting
- exact balance accounting
- scoped fungible-token allowances
- explicit withdrawal path
- versioned deployments
- comprehensive tests
- independent contract and security review

## 9. Privacy Seed Compromise

If the privacy seed is compromised, an attacker can derive the user's Privara spending and viewing keys and potentially recover spend authority for stealth funds.

Mitigations:

- random independent seed
- encrypted local storage
- encrypted export
- explicit backup
- no server transmission
- no logging
- clear disclosure that the privacy seed controls stealth balances

## 10. Backup Failure

A user may register stealth keys and later lose the only copy of the privacy seed.

Required mitigation:

1. export encrypted backup
2. successfully restore/verify it
3. only then register public stealth keys

## 11. Import Overwrite Risk

Import MUST NOT silently replace an existing privacy identity.

Require explicit replacement or preserve historical identities safely.

## 12. Wallet-Signature Determinism

Wallet signatures are not assumed deterministic across wallet versions, hardware signers, MPC signers, or signing libraries.

The random privacy seed is the recovery root.

## 13. Hardware Wallet Assumption

Leather/Xverse hardware-wallet protection does not automatically protect Privara stealth balances.

Privara stealth private keys are derived from the separate privacy seed.

This must be clearly disclosed.

## 14. Invalid Curve Points

A malformed secp256k1 point may appear in public event data.

Risk: a naive scanner throws and stops processing later valid announcements.

Required mitigation:

- validate per record
- catch per-record errors
- skip malformed record
- continue scanning
- log only safe public metadata
- do not let malformed events break sponsor-origin verification

## 15. Announcement Substitution

The M2 intent signs `announcement-hash`.

The router recomputes the canonical hash of the supplied payload and requires equality before settlement.

## 16. Encrypted Note Integrity

Privara uses authenticated encryption.

Associated data binds the ciphertext to:

- network
- router
- stealth principal
- asset
- registry epoch
- version

Tampering causes decryption failure.

## 17. Stealth Derivation Risks

Risks:

- bad randomness for `r`
- key reuse
- invalid public points
- incorrect domain separation

Mitigations:

- CSPRNG-generated ephemeral scalar
- fresh scalar per payment
- point validation in SDK
- domain-separated hash-to-scalar
- test vectors and parity tests

## 18. Relayer Censorship

The relayer can refuse or delay settlement.

The user retains a withdrawal path for unspent router deposits.

## 19. Sponsor Censorship

The sponsor can refuse to pay STX for a stealth spend.

The stealth address remains self-custodial and may be funded with STX to spend independently.

## 20. Sponsor-Fee Approval Mismatch

Dangerous pattern:

```text
show fee
↓
user approves
↓
fetch new fee
↓
sign different fee
```

Required mitigation:

```text
fetch quote
↓
show exact quote
↓
user confirms
↓
freeze quote
↓
build transaction with same fee
↓
sign
↓
relayer validates same fee
```

No silent refresh after user approval.

## 21. Sponsor Mutation

The sponsor must not be able to alter:

- asset
- destination
- payment amount
- sponsor fee
- fee recipient
- expected sponsor

All values must be bound into the origin-signed contract call.

## 22. FT Outflow Safety

For paid sponsorship, an exact fungible-token post-condition in deny mode should cap token outflow to:

```text
payment amount + sponsor fee
```

## 23. Duplicate Sponsorship

Hash the complete signed request and maintain pending + processed request tracking.

Only mark processed after successful node acceptance.

## 24. Sponsor Nonce Races

A single-instance deployment can serialize sponsor signing locally.

Multi-replica deployment requires distributed nonce coordination.

## 25. Network Fee Abuse

Mitigations:

- maximum transaction size
- maximum STX network fee
- allowlisted contract/method
- exact sponsor policy
- rate limiting

## 26. Free-Relay Abuse

Only sponsor transactions originating from confirmed Privara stealth settlement addresses.

## 27. API and Metadata Privacy

Privara does not provide network-layer anonymity.

Lookup requests may reveal:

- IP address
- timing
- queried principal
- browser/session metadata

## 28. Withdrawal Linkage

A direct withdrawal to a known public wallet may reveal ownership of the stealth address.

The UI must warn the user.

## 29. Amount Correlation

Amounts are public.

Partial spending can reduce trivial equality matching but is not cryptographic privacy.

## 30. Privacy Claims

Privara may claim:

> The recipient's long-term wallet is not exposed as the onchain settlement destination.

Privara must not claim:

- hidden amounts
- hidden payer
- hidden recipient from the sender
- network anonymity
- mixer anonymity
- hidden balances

## 31. Mainnet Validation Status

Implemented and regression-tested:

- sponsor-fee approval binding
- backup-before-registration
- safe import behavior
- per-record malformed announcement resilience
- isolated fresh-session backup restore
- complete two-wallet sBTC testnet flow through the HTTP relayer

Future hardening recommended before larger-value mainnet use:

- graphical fresh-browser wallet walkthrough by a non-team tester
- independent security audit of contracts, SDK, relayer, and production configuration,
  followed by closure of any findings; this is not a Milestone 2 requirement
- production secret management, monitoring, incident response, and fee economics review
- shared idempotency/rate limiting and distributed sponsor-nonce coordination before
  operating more than one relayer replica

## 32. Independent Review

`werner.btc` of Leather Support provided attributable written technical feedback covering
wallet-signing assumptions, sponsor-fee approval, backup verification,
malformed-announcement resilience, key custody, and privacy claims. The reported
blockers were addressed and regression-tested.

That review is valuable but is not a formal audit, Leather endorsement, or mainnet
signoff.

An independent security audit is advisable before meaningful mainnet value at risk.
