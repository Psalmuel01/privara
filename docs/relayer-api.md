# Privara Relayer and Sponsor API

Status: Reference implementation

## Purpose

The Privara relayer:

1. submits valid signed payment intents
2. sponsors valid stealth-origin transactions by paying the Stacks network fee in STX

The relayer never receives user private keys.

## Health Endpoint

Recommended:

```http
GET /health
```

## Public Configuration

Expose browser-safe configuration only.

Implemented response from `GET /v1/config`:

```json
{
  "version": 1,
  "network": "testnet",
  "coreAddress": "ST...",
  "registry": "ST....privara-stealth-registry",
  "router": "ST....privara-router-m2-sbtc",
  "asset": "ST...",
  "tokenName": "sbtc-token",
  "relayerAddress": "ST...",
  "settlementFeeBps": 100,
  "maxIntentAmount": "...",
  "sponsorFee": "1200"
}
```

The separate `GET /v1/stealth/sponsor-policy` response exposes the spend contract,
fee recipient, expected sponsor, exact token fee, maximum payment, and maximum STX fee:

```json
{
  "version": 1,
  "network": "testnet",
  "spendContract": "ST....privara-sponsored-spend-v2",
  "asset": "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token",
  "tokenName": "sbtc-token",
  "feeRecipient": "ST...",
  "sponsorAddress": "ST...",
  "sponsorFee": "1200",
  "maxPaymentAmount": "...",
  "maxStacksNetworkFee": "..."
}
```

## Settlement Endpoint

Implemented:

```http
POST /v1/intents/settle
```

The relayer should independently recompute:

- intent hash
- signed digest
- announcement hash
- recovered signer

For M2 validate:

- network
- asset
- relayer assignment
- amount bounds
- relayer fee bounds
- expiry
- announcement version
- announcement asset
- announcement stealth principal
- canonical announcement hash
- M2 intent hash
- router-bound digest
- recoverable signature

## Sponsorship Endpoint

Implemented:

```http
POST /v1/stealth/sponsor
```

Request:

```json
{
  "originSignedTransaction": "..."
}
```

Derive destination, amount, fee, and asset from the signed transaction rather than trusting duplicate JSON fields.

## Sponsorship Validation

Validate:

- sponsored auth type
- configured network
- single-sig origin
- allowlisted contract
- allowlisted method
- allowlisted asset
- payment bound
- fee recipient
- exact sponsor fee
- expected sponsor
- recipient relationships
- deny-mode post-condition
- exact FT outflow
- origin signature
- confirmed Privara stealth origin
- serialized size
- maximum STX fee
- duplicate status

## Sponsor Quote Binding

Required:

```text
fetch quote
↓
display quote
↓
user confirms
↓
freeze quote
↓
build transaction with same fee
↓
sign
↓
submit
```

Do not refetch or silently replace the fee after approval.

## Response

Example:

```json
{
  "txid": "...",
  "status": "broadcast",
  "origin": "ST...",
  "destination": "ST...",
  "paymentAmount": "40000000",
  "tokenSponsorFee": "10000",
  "networkFeePaid": "..."
}
```

`networkFeePaid` is the actual STX network fee.

The current public testnet service is
`https://privara-production.up.railway.app`. Browser access is restricted to configured
exact origins; command-line requests do not send an Origin header.

## Operational Controls

At minimum:

- per-origin rate limit
- transaction size cap
- payment cap
- STX fee cap
- duplicate request tracking
- sponsor signing serialization
- HTTPS
- restricted browser origins

## Multi-Replica Limitation

Production multi-replica deployment requires:

- shared transactional store
- distributed nonce coordination
- finality tracking
- cross-replica idempotency
