# Architecture

Privara is planned as a SIP-010 privacy execution layer built around signed payment intents, relayer-submitted settlement, encrypted offchain instructions, and fresh-address recipient flows.

## Components

### Router

The router verifies signed payment intents and executes SIP-010 settlement.

Expected responsibilities:

- verify intent signatures
- enforce nonce and expiry checks
- prevent replayed settlements
- execute SIP-010 transfers
- support relayer fee payment

### SDK

The SDK helps wallets and protocols create and submit Privara-compatible payment flows.

Expected responsibilities:

- construct payment intents
- hash and sign intents
- format relayer requests
- support encrypted payment notes
- expose integration helpers

### Relayer

The relayer submits authorized settlement transactions on behalf of users.

Expected responsibilities:

- accept authorized settlement requests
- validate intent payloads
- submit transactions
- report settlement status

### Attested Pool Prototype

The attested pool is a research track for stronger shielded-note flows under explicit trust assumptions.

Expected responsibilities:

- store commitments
- track nullifiers
- verify coordinator or federation authorizations
- document trust boundaries clearly

