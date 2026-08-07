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

Intents are signed as [SIP-018 structured data](https://github.com/stacksgov/sips/blob/main/sips/sip-018/sip-018-signed-structured-data.md),
so browser wallets (Leather, Xverse) can sign them natively in M2 with no custom
signing cryptography.

> **Signing-UX limitation (known, M2).** "Natively signable" is not the same as
> "clearly presented." Leather renders a SIP-018 request as the raw Clarity tuple:
> field names with raw values — `amount: u100000` (not "0.001 sBTC"), full
> unabbreviated principals, and no semantic framing that tells the user *this
> signature spends money*. The fields are all visible and correct, but nothing on the
> signing screen says "you are authorizing a payment." The wallet controls this view;
> the dApp cannot restyle it. Because the signature IS the spend authorization, this
> is a phishing surface: a hostile dApp could show a friendly summary while the raw
> tuple authorizes something else.
>
> **M1/early-M2 mitigation (chosen): out-of-band.** The domain `name`/`version`
> ("privara"/"1") do display, identifying the app. Integrating dApps MUST add a
> pre-sign confirmation that states the payment in human terms and instructs the user
> to verify the raw `recipient` principal and `amount` shown by the wallet against it.
> This trusts user diligence and does not cryptographically bind the framing.
>
> **Deferred stronger fix:** bind a human-readable `summary` string into the signed
> tuple and have the contract reconstruct and assert it from the numeric fields, so a
> forged summary cannot settle and Leather renders a bound, readable sentence. Not
> done: reconstructing a formatted decimal amount in Clarity (`int-to-ascii` +
> decimal placement) is non-trivial and would change the digest. Tracked for M2.

### Domain

```
domain = { name: "privara", version: "1", chain-id: <chain-id keyword>, router: <this router principal> }
domain-hash = sha256(to-consensus-buff?(domain))
```

The `chain-id` keyword evaluates to `u1` on mainnet and `u2147483648` on testnet and
simnet. Binding it into the domain means a signature produced for testnet can never
be replayed on mainnet, and vice versa. The `router` field is this contract's own
principal (`.privara-router`, resolving to `<deployer>.privara-router`), so a signature
is valid only against the exact deployment it was made for — it cannot be replayed on a
different or redeployed router, even one sharing the same contract name under a
different deployer.

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

The router takes no `user` argument at all. The payer is recovered from the
signature and used directly for nonce, deposit, and settlement:

```clarity
(secp256k1-recover? digest user-sig)   ;; -> (ok (buff 33)) compressed pubkey
(principal-of? recovered-pubkey)        ;; -> (ok principal) == the payer
```

A Stacks address is a `hash160` of the public key — a one-way function. A relayer
cannot derive the user's public key from their address, so requiring the caller to
supply it (the pre-M1 design) created an out-of-band burden and a "wrong pubkey"
failure mode. Recovery eliminates both: the signature is the sole source of signer
identity.

Because no `user` is passed, the payer's principal never appears in the call
arguments or the `settle-intent` print event. It is obtainable only by re-running
`secp256k1-recover?` on the signature — the signer is still cryptographically
present, but is no longer named in plaintext calldata.

**Trade-off.** With no supplied `user` to assert against, a forged or tampered
signature simply recovers to *some other* principal that never deposited, and fails
`ERR_NO_DEPOSIT (u110)` rather than `ERR_INVALID_SIG (u102)`. `ERR_INSUFFICIENT_FUNDS
(u104)` is reserved for a genuine depositor who is merely short. Only a well-formed
signature over this exact intent, by a principal with a funded deposit, can settle.

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
 |                         |                         | 5. recover payer from sig
 |                         |                         | 6. assert nonce == get-nonce(payer)
 |                         |                         | 7. assert deposit(payer, asset) > 0, then >= amount
 |                         |                         | 8. mark digest settled
 |                         |                         | 9. increment nonce
 |                         |                         |10. debit deposit
 |                         |                         |11. transfer net-amount to recipient
 |                         |                         |12. transfer relayer-fee to relayer
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
- **The payer is not named in calldata.** `settle-intent` takes no `user` argument
  and emits no `user` field in its print event. The authorizing principal is recovered
  from the signature inside the contract and never handed to the chain in plaintext.

### What does not improve

- **The signer is still cryptographically recoverable.** The RSV signature plus the
  intent fields let anyone reconstruct the digest and recover the signer's public key
  via `secp256k1-recover?`, then derive its principal. Removing the `user` argument
  raises the effort to link a settlement to its payer — it is no longer a plaintext
  field — but does not make the payer unlinkable. Further unlinkability (stealth
  addresses, encrypted notes, nullifiers) is M2 scope.
- **Amounts are public.** The settlement amount and relayer fee appear in the
  transaction arguments and in the `settle-intent` print event.
- **Recipients are public.** The recipient principal is a settlement argument.
- **Timing is public.** Block height and transaction ordering are visible.
- **The relayer is public.** The relayer's address appears in both the intent and the
  transaction sender field.

Privara v1 reduces wallet-graph traceability — the direct sender-to-recipient link
that appears in a normal SIP-010 transfer — and keeps the authorizing principal out
of plaintext calldata, but does not hide amounts, recipients, or a signer determined
enough to run signature recovery.

---

## Threat model

| Threat | Impact | Mitigation |
|---|---|---|
| Malicious relayer alters intent fields | Signature no longer matches | `secp256k1-recover?` recovers a different principal that never deposited; `ERR_NO_DEPOSIT` |
| Attacker aims a signature at a funded victim | Charge someone else | Impossible — the signature *is* the payer; recovery yields only the signer's own principal, so a victim can only be charged by a signature they themselves produced |
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
