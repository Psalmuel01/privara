# Protocol Specification — Privara v1

Privara is a SIP-010 intent settlement layer for Stacks. Users authorize payments
offline as signed structured data; relayers submit the settlement transaction on their
behalf. This document is the authoritative description of the wire format, digest
construction, authorization model, and trust boundaries for Milestone 1.

---

## Actors

- **User** — holds a Stacks account and SIP-010 tokens. Creates and signs payment
  intents offline. Never submits a settlement transaction directly.
- **Relayer** — a server that accepts signed intents and broadcasts `settle-intent`
  to the Stacks network. Earns a fee from each settlement. Registered in
  `privara-registry` for discovery; authorization comes from the signed intent, not
  registry membership.
- **Recipient** — the destination principal named in the intent. Receives
  `amount - relayer-fee` tokens on settlement.
- **Router** (`privara-router`) — the on-chain settlement contract. Verifies
  signatures, enforces nonces and expiries, prevents replays, and executes SIP-010
  transfers under a scoped asset allowance.
- **Registry** (`privara-registry`) — a discovery contract. Relayers publish their
  endpoint URL, fee rate, and compressed secp256k1 public key. The router does not
  consult the registry; it is read by wallets and the SDK to find relayers.

---

## Intent model

An intent is a structured record of a single authorized payment:

| Field | Clarity type | Description |
|---|---|---|
| `asset` | `principal` | SIP-010 contract principal |
| `amount` | `uint` | Total tokens to move, including the relayer fee |
| `recipient` | `principal` | Destination of `amount - relayer-fee` |
| `relayer` | `principal` | Relayer that will call `settle-intent` |
| `relayer-fee` | `uint` | Fee paid to the relayer from `amount` |
| `nonce` | `uint` | Monotonic per-user counter; must equal `get-nonce(user)` at settlement |
| `expiry` | `uint` | Stacks block height after which the intent is invalid |

The intent is not submitted on-chain. It is hashed, signed, and handed to the relayer
as a JSON payload. The relayer passes all fields plus the signature to `settle-intent`.

---

## SIP-018 digest construction

Intents are signed as [SIP-018 structured data](https://github.com/stacksgov/sips/blob/main/sips/sip-018/sip-018-signed-structured-data.md).
This makes them signable by browser wallets (Leather, Xverse) in M2 without any
custom signing UI.

### Domain

```
domain = { name: "privara", version: "1", chain-id: <chain-id keyword> }
domain-hash = sha256(to-consensus-buff?(domain))
```

The `chain-id` keyword evaluates to `u1` on mainnet and `u2147483648` on testnet and
simnet. Binding it into the domain means a signature produced for testnet can never
be replayed on mainnet, and vice versa.

### Message

```
message = {
  asset:       <principal>,
  amount:      <uint>,
  recipient:   <principal>,
  relayer:     <principal>,
  relayer-fee: <uint>,
  nonce:       <uint>,
  expiry:      <uint>,
}
message-hash = sha256(to-consensus-buff?(message))
```

Clarity's `to-consensus-buff?` serializes tuples with keys in lexicographic order.
The TypeScript SDK uses `serializeCVBytes(tupleCV(...))` from `@stacks/transactions`,
which produces byte-for-byte identical output (proven by the parity test in
`tests/sdk-parity.test.ts`).

### Full digest

```
PREFIX = 0x534950303138   ;; ascii "SIP018", 6 bytes
digest = sha256(PREFIX || domain-hash || message-hash)
```

This is the 32-byte value the user signs and the contract recovers the signer from.

### TypeScript (SDK)

```ts
import { hashIntent, messageDigest } from "@privara/sdk";

const dataHash = hashIntent(intent);          // sha256(serializeCVBytes(intentTuple))
const digest   = messageDigest(intent, "testnet"); // sha256(PREFIX || domainHash || dataHash)
```

---

## Signing

The user signs `digest` with their secp256k1 private key using the RSV layout
(recovery byte last, 65 bytes total). `signMessageHashRsv` from `@stacks/transactions`
v7 produces this layout directly; no byte reordering is needed.

```ts
import { signIntent } from "@privara/sdk";

const signed = signIntent(intent, privateKey, "testnet");
// signed.userSig  — 65-byte RSV signature
// signed.digest   — the 32-byte digest that was signed
// signed.user     — the signer's Stacks principal (derived from privateKey)
```

---

## Authorization flow

The router does not accept a caller-supplied public key. Instead it recovers the
signer's public key from the signature:

```clarity
(secp256k1-recover? digest user-sig)   ;; -> (ok (buff 33)) compressed pubkey
(principal-of? recovered-pubkey)       ;; -> (ok principal)
(asserts! (is-eq recovered-signer user) ERR_INVALID_SIG)
```

A Stacks address is a `hash160` of the public key — a one-way function. A relayer
cannot derive the user's public key from their address, so requiring the caller to
supply it (the pre-M1 design) created an out-of-band burden and a "wrong pubkey"
failure mode. Recovery eliminates both: the signature is the sole source of signer
identity.

The caller still names `user` explicitly. The contract asserts `recovered-signer ==
user`, so a forged signature fails with `ERR_INVALID_SIG` rather than being
misreported as `ERR_INSUFFICIENT_FUNDS` (the recovered principal would simply own no
deposit, but the error clarity matters for debugging and for test expectations).

---

## Settlement flow

```
User                    Relayer                 Router (on-chain)
 |                         |                         |
 |-- sign intent offline ->|                         |
 |                         |-- settle-intent() ----->|
 |                         |                         | 1. assert is-whitelisted(asset)
 |                         |                         | 2. assert not is-intent-settled(digest)
 |                         |                         | 3. assert block-height < expiry
 |                         |                         | 4. assert amount > relayer-fee
 |                         |                         | 5. recover signer from sig
 |                         |                         | 6. assert recovered == user
 |                         |                         | 7. assert nonce == get-nonce(user)
 |                         |                         | 8. assert deposit(user, asset) >= amount
 |                         |                         | 9. mark digest settled
 |                         |                         |10. increment nonce
 |                         |                         |11. debit deposit
 |                         |                         |12. transfer net-amount to recipient
 |                         |                         |13. transfer relayer-fee to relayer
 |                         |<-- (ok digest) ----------|
```

Steps 1–4 are identity-independent and run before signature recovery, so a
non-whitelisted asset or expired intent gets a clear error code rather than a
misleading signature failure.

### Asset allowance

Every router-initiated transfer runs inside an `as-contract?` block bounded by a
`(with-ft SBTC "*" amount)` allowance. The `"*"` wildcard covers any fungible token
defined in the `SBTC` contract without requiring knowledge of its internal ft-name.
The contract can never move more than `amount` of the whitelisted asset in a single
settlement, regardless of what the relayer passes.

`SBTC` is the only line that changes per network:

```clarity
;; simnet / tests
(define-constant SBTC .mock-token)
;; testnet
(define-constant SBTC 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token)
;; mainnet
(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
```

---

## Nonce, expiry, and replay semantics

**Nonce** — a per-user monotonic counter stored in `user-nonces`. The intent must
name the user's current nonce exactly; the contract increments it on settlement.
This prevents intent reordering and double-submission.

**Expiry** — a Stacks block height. The contract asserts `stacks-block-height <
expiry` at settlement time. Users set expiry to limit the window in which a relayer
can act.

**Replay protection** — the full SIP-018 digest (which binds all intent fields plus
the domain) is stored in `settled-intents` on first settlement. Any attempt to
re-submit the same digest returns `ERR_INTENT_USED`. Because the digest binds
`chain-id`, a settled intent on testnet cannot be replayed on mainnet even if the
same key and nonce are used.

**Cross-deployment replay** — the current digest does not bind the router's own
contract principal. A redeployed router at a different address would accept the same
signatures. This is a known limitation; binding the router principal into the domain
or message is the straightforward fix and is planned for a future version.

---

## Relayer role and trust assumptions

A relayer can:
- **Censor** — refuse to submit an intent, or delay it until it expires.
- **Front-run** — submit a settlement before a competing relayer (benign in practice;
  the user's funds still go to the named recipient).

A relayer cannot:
- **Alter** — changing any intent field invalidates the signature.
- **Steal** — the recipient and amount are bound in the signed digest; the contract
  enforces them.
- **Replay** — the digest is marked settled on first use.

**Self-settle fallback** — if every relayer censors a user, the user can call
`withdraw` directly to reclaim their deposit. Settlement never depends on a single
relayer's cooperation.

The registry is discovery-only. The router does not require registry membership to
settle; authorization comes entirely from the signed intent binding a specific relayer
principal. A relayer not in the registry can still settle any intent that names them.

---

## Privacy assumptions — honest account

### What improves

- The settlement transaction is submitted by the relayer, not the user. The
  recipient's transaction history shows the router contract as the counterparty, not
  the user's wallet address.
- Payment authorization is decoupled from on-chain submission. The user's wallet
  never appears as the direct sender of a transfer to the recipient.

### What does not improve

- **The sender is identifiable from calldata.** `settle-intent` takes an explicit
  `user` principal argument. Anyone reading the transaction can see who authorized
  the payment. Even without that argument, the RSV signature plus the intent fields
  allow anyone to recover the signer's public key via `secp256k1-recover?`.
- **Amounts are public.** The settlement amount and relayer fee appear in the
  transaction arguments and in the `settle-intent` print event.
- **Recipients are public.** The recipient principal is a settlement argument.
- **Timing is public.** Block height and transaction ordering are visible.
- **The relayer is public.** The relayer's address appears in both the intent and the
  transaction sender field.

Privara v1 reduces wallet-graph traceability — the direct sender-to-recipient link
that appears in a normal SIP-010 transfer — but does not hide amounts, recipients, or
the authorizing principal.

---

## Threat model

| Threat | Impact | Mitigation |
|---|---|---|
| Malicious relayer alters intent fields | Signature no longer verifies | `secp256k1-recover?` recovers a different principal; `ERR_INVALID_SIG` |
| Malicious relayer replays a settled intent | Double-spend | Digest stored in `settled-intents`; `ERR_INTENT_USED` |
| Malicious relayer submits after expiry | Stale payment | `stacks-block-height < expiry` check; `ERR_INTENT_EXPIRED` |
| Relayer censors user | Funds locked | `withdraw` self-settle path always available |
| Wrong nonce submitted | Reordering / double-submit | Exact nonce match required; `ERR_NONCE_MISMATCH` |
| Non-whitelisted asset deposited | Funds trapped | Whitelist checked at deposit, withdraw, and settle |
| Signature malleability | Forged authorization | `secp256k1-recover?` is canonical; recovery byte disambiguates |
| Key compromise | Attacker drains deposit | Standard key hygiene; no protocol-level mitigation |
| Cross-deployment replay | Old sig reused on new router | Known limitation; fix is to bind router principal into domain |

---

## Non-goals and upgrade path

Privara v1 does not provide:
- Hidden amounts or hidden recipients
- Trustless Tornado-style shielded pools (requires ZK proofs or blind-signature
  infrastructure not currently practical in Clarity)
- Complete timing privacy

The longer-term research direction is stronger shielded-note infrastructure using
private membership proofs, ZK-friendly hash functions, or future Stacks cryptographic
improvements. The intent model and SIP-018 signing scheme are designed to be
forward-compatible with that direction.
