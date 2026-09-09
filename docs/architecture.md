# Architecture

Privara is a SIP-010 payment layer built around signed payment intents,
relayer-submitted settlement, encrypted announcements, and fresh-address recipient
flows. Its current production-like environment is Stacks testnet with sBTC.

## Components

### Router

The router verifies signed payment intents and executes SIP-010 settlement.

Responsibilities:

- verify intent signatures
- enforce nonce and expiry checks
- prevent replayed settlements
- execute SIP-010 transfers
- support relayer fee payment

### M2 router and stealth registry

The M2 router adds an announcement hash to the signed intent, verifies the supplied
canonical announcement, settles to the one-time address, and emits the announcement in
the same transaction. The registry maps a recipient's normal principal to public
spending/viewing keys and a monotonic epoch. Only the wallet owner may register or rotate
those keys.

### Sponsored-spend helper

`privara-sponsored-spend-v2` atomically sends the requested token amount and the exact
token service fee. The origin signature binds destination, amount, token, fee recipient,
fee, and expected sponsor. A deny-mode exact-total post-condition limits token outflow.

### SDK

The SDK helps wallets and protocols create and submit Privara-compatible payment flows.

Responsibilities:

- construct payment intents
- hash and sign intents
- format relayer requests
- support encrypted payment notes
- expose integration helpers

The independent Privara privacy seed and derived one-time spending keys stay in the
client. Wallet extensions sign registration, deposits, and SIP-018 payment intents.

### Relayer and sponsor service

The relayer submits authorized settlement transactions on behalf of users.

Responsibilities:

- accept authorized settlement requests
- validate intent payloads
- submit transactions
- expose public configuration and sponsorship policy
- validate origin-signed sponsored spends, add the sponsor signature, and pay STX fees
- isolate malformed announcements while proving that a spend originated from a confirmed
  Privara settlement
- enforce limits and durable request idempotency for the single-replica M2 service

### Announcement discovery

The router emits canonical public settlement events. The browser and relayer fetch those
events from the Stacks API; the browser performs detection and note decryption locally.
There is no separate hosted database or server that receives viewing/spending keys. A
future high-volume deployment may add a persistent public event index, but that is not
required by the current testnet architecture.

### React application

The standalone React app connects Leather/Xverse, gates P/V registration behind a
verified encrypted backup, performs just-in-time router funding, signs private payments,
scans announcements, sponsors spends, and prepares sequential DAO payout intents. DAO
payouts are client-side orchestration, not a new batch contract.

## End-to-end flow

1. Bob creates a separate Privara seed, exports and verifies its encrypted backup, then
   registers only public P/V keys from his normal wallet.
2. Alice enters Bob's normal address. The SDK resolves P/V and derives fresh `R` and
   one-time destination `S`.
3. Alice reviews the amount and settlement fee, funds only any router shortfall, and
   signs an M2 intent that commits to the encrypted announcement.
4. The relayer validates and broadcasts; the router settles atomically to `S` and emits
   the announcement.
5. Bob's browser scans public events locally and derives the one-time spend key.
6. Bob reviews a fixed sponsor quote and signs the exact spend. The sponsor verifies it,
   pays the STX network fee, and broadcasts.

### Attested pool prototype — post-grant research

> **Scope note.** The attested pool is a *post-grant research track*, not part of the
> Milestone 1 grant scope. Nothing in this section is built, deployed, or claimed as an
> M1 deliverable. It is recorded here only to document the intended direction beyond the
> current grant.

The attested pool is a research track for stronger shielded-note flows under explicit trust assumptions.

Expected responsibilities:

- store commitments
- track nullifiers
- verify coordinator or federation authorizations
- document trust boundaries clearly
