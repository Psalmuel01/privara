# Privara M2 Stealth Settlement Specification

- Status: Mainnet contracts, services, small-value acceptance, and external technical review confirmed; remaining adoption target in progress
- Version: 0.2
- Author: Samuel Dahunsi
- Organization: Privara
- Contributors: Samuel Dahunsi

## 1. Purpose

Privara M2 extends the M1 signed-intent settlement model with one-time stealth recipient addresses for SIP-010 payments on Stacks.

The goal is narrow and practical:

> A sender can pay a known Stacks user through Privara without exposing that user's long-term wallet as the payment destination onchain.

Privara M2 does not hide transaction amounts and does not provide payer anonymity against a full-chain observer.

## 2. Actors

### Sender
A user who knows the recipient's normal Stacks address and wants to send a SIP-010 payment through Privara.

### Recipient
A user who has enabled Privara private receiving by generating and backing up a Privara privacy identity and registering public stealth keys.

### Relayer
An offchain service that receives signed payment intents and broadcasts settlement transactions.

### Sponsor
A Stacks account that pays STX transaction fees for a stealth address that holds SIP-010 assets but no STX.

### Router
The Clarity contract that verifies signed intents, enforces expiry and replay protection, debits sender deposits, transfers SIP-010 assets, and emits the stealth announcement.

### Stealth Registry
The Clarity contract that maps a user's normal Stacks principal to their current public stealth spending and viewing keys.

## 3. Privacy Model

Privara M2 provides recipient-side address unlinkability at settlement.

The chain sees:

- payment amount
- SIP-010 asset
- one-time stealth principal
- relayer
- relayer fee
- encrypted announcement
- ephemeral public key
- later spends from the stealth address

The chain does not directly name the recipient's long-term wallet as the settlement destination.

The sender already knows the intended recipient.

The payer can still be recovered from the SIP-018 settlement signature.

A later withdrawal to the recipient's known wallet may reveal the relationship between the stealth address and that wallet.

## 4. Privacy Identity

Privara MUST generate an independent cryptographically random 32-byte privacy seed.

The privacy seed is the recovery root.

Wallet signatures MUST NOT be used as the canonical source of stealth spending or viewing keys.

Wallet signing determinism is not assumed across wallet versions, cryptographic libraries, hardware wallets, MPC signers, or future signing implementations.

The seed MUST:

- be generated client-side
- never be sent to the relayer
- never be sent to the indexer
- never be logged
- support encrypted export
- support import and recovery
- not be persisted unencrypted

## 5. Key Derivation

From the privacy seed, Privara derives two independent secp256k1 scalars using domain-separated hashing:

- spending private key `p`
- viewing private key `v`

Public keys:

```text
P = pG
V = vG
```

Only `P` and `V` are registered publicly.

Suggested domains:

```text
privara:spending-key:v1
privara:viewing-key:v1
```

## 6. Registration

The recipient registers:

```text
spending-key = P
viewing-key  = V
epoch        = current key epoch
```

under their normal Stacks principal.

Registration MUST happen only after backup export and successful restore verification.

Rotation affects future payments only.

Recipients must retain recovery material for historical key epochs while funds may still exist at derived stealth addresses.

## 7. Sender Stealth Derivation

Let:

```text
P = recipient spending public key
V = recipient viewing public key
```

The sender samples a fresh random scalar `r`.

Then:

```text
R = rG
Q = rV
h = HashToScalar("privara:stealth:v1" || compressed(Q))
P' = P + hG
```

`P'` is converted to a one-time Stacks principal `S`.

`S` becomes the recipient field in the M2 payment intent.

The sender MUST use a fresh `r` for every payment.

## 8. Recipient Detection

For each public announcement, the recipient computes:

```text
Q = vR
h = HashToScalar("privara:stealth:v1" || compressed(Q))
P' = P + hG
```

If the Stacks principal derived from `P'` matches the announced stealth principal, the payment belongs to the recipient.

The viewing key is sufficient for detection but not spending.

## 9. Recipient Spending Key

For a matching payment:

```text
p' = (p + h) mod n
```

Then:

```text
p'G = P'
```

The recipient can therefore spend from the one-time stealth principal.

## 10. Encrypted Announcement

Privara uses authenticated encryption for the private note.

The current design uses:

```text
ECDH shared point
    ↓
HKDF-SHA256
    ↓
AES-GCM
```

Associated data binds the ciphertext to:

- network
- router
- stealth principal
- SIP-010 asset
- registry epoch
- protocol version

The signed payment intent commits to the canonical announcement hash.

## 11. M2 Intent

An M2 intent includes:

```text
asset
amount
recipient
relayer
relayer-fee
nonce
expiry
announcement-hash
```

The `recipient` is the one-time stealth principal.

The signed domain is versioned separately from M1 and bound to:

- chain ID
- exact M2 router principal
- Privara protocol name
- M2 version

This prevents testnet/mainnet replay, M1/M2 replay, and cross-deployment replay.

## 12. Atomic Settlement

The M2 router:

1. validates the asset
2. validates expiry
3. rejects replayed digests
4. validates the announcement envelope
5. recomputes the announcement hash
6. requires it to match the signed commitment
7. recovers the payer from the SIP-018 signature
8. checks the payer deposit
9. debits the payer deposit
10. sends the net payment to the stealth principal
11. sends the signed relayer fee
12. emits the stealth announcement

The transfer and announcement publication occur in the same transaction.

## 13. Announcement Scanning

Announcements are public chain data.

The reference implementation fetches Privara contract log events from Stacks/Hiro APIs and parses them client-side.

Private scanning happens locally.

The index/fetch layer MUST NOT receive:

- privacy seed
- viewing private key
- spending private key
- derived stealth private key
- decrypted note contents

Malformed announcements MUST be handled per-record. A malformed record MUST NOT abort the scan of the remaining page or history.

## 14. Spending From a Stealth Address

A stealth address is a normal spendable Stacks account controlled by `p'`.

The recipient may:

- withdraw the full balance to a normal wallet
- send only part of the balance
- pay a merchant directly
- send to another fresh address
- keep the remainder at the stealth address

Privara does not require a full sweep.

## 15. Sponsored Spending

A stealth address may hold sBTC or another SIP-010 token while holding zero STX.

Privara uses Stacks sponsored transactions to abstract the STX network fee.

Flow:

```text
recipient signs origin transaction with p'
        ↓
Privara validates complete signed payload
        ↓
Privara sponsor adds sponsor authorization
        ↓
Privara sponsor pays STX network fee
        ↓
transaction is broadcast
```

The recipient's stealth private key MUST remain client-side.

## 16. Sponsorship Economics

The following costs are distinct:

### Settlement fee
Paid by the original sender during initial Privara settlement.

Current model:

```text
1% Privara settlement/relayer fee
```

This is paid in the transferred SIP-010 asset and is not the Stacks network fee.

### Stacks network fee
Paid in STX by the account broadcasting or sponsoring the transaction.

### Stealth-spend sponsor service fee
A separate fee that may be charged when Privara sponsors a later spend from a stealth address.

The current testnet and mainnet implementations use paid sponsorship. The origin-signed helper call
atomically pays a configured fixed service fee in the same SIP-010 asset. The confirmed
sBTC policy uses `200` sats (`0.00000200 sBTC`); this is separate from the STX network
fee paid by the sponsor wallet. The mainnet fee is configured at `200` sats as a
usability-first pilot policy and must be revalidated against observed network,
infrastructure, and abuse-prevention costs before broader use.

Any paid sponsorship model MUST bind the exact sponsor fee and fee recipient into the origin-signed transaction.

The fee shown to the user MUST be the exact fee later signed. It MUST NOT be silently refreshed or changed after user approval.

## 17. Full Withdrawal

For balance `B` and sponsor fee `F`:

```text
B - F → recipient wallet
F     → sponsor/service fee recipient
```

The UI must warn:

> Withdrawing directly to a public wallet may link this private payment to that wallet onchain.

## 18. Sponsored Spend Helper

For paid sponsorship, Privara may use an additive helper contract that atomically performs:

```text
payment amount → destination
sponsor fee    → fee recipient
```

The origin signature binds:

- asset
- destination
- payment amount
- sponsor fee
- fee recipient
- expected Stacks sponsor

An exact fungible-token post-condition in deny mode should limit total token outflow to:

```text
payment amount + sponsor fee
```

## 19. Non-Goals

Privara M2 does not claim:

- hidden amounts
- hidden payer identity
- payer unlinkability against a full-chain observer
- hidden balances
- mixer-style anonymity
- trustless ZK shielded-pool semantics
- network-layer anonymity
- anonymity from the sender
- protection from self-linkage caused by later withdrawals

## 20. Wallet Separation

Leather/Xverse provide the user's normal Stacks wallet identity and payment-intent signing UX.

Privara stealth funds are controlled by the independent Privara privacy seed.

A connected hardware wallet does not automatically protect the Privara stealth private keys.

## 21. Mainnet Readiness Requirements

Before mainnet:

- sponsor fee approval must be bound to the exact user-approved quote
- backup export + successful restore must precede stealth-key registration
- import must not silently overwrite an existing privacy identity
- malformed announcements must not abort scanning or sponsorship-origin lookup
- fresh-browser restore must be verified
- complete two-wallet testnet flow must succeed
- deployment constants must be production-correct
- independent security review is recommended
