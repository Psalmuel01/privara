# Privara reference relayer

The reference service exposes the two Milestone 2 relayer operations:

- `POST /v1/intents/settle` validates and broadcasts either a signed M1 intent or an
  announcement-bound M2 private intent (`kind: "stealth"`).
- `POST /v1/stealth/sponsor` validates an origin-signed stealth transfer, adds the
  sponsor authorization, and broadcasts it.
- `GET /v1/stealth/sponsor-policy` returns the exact token fee and treasury the client
  must display and sign.

Neither endpoint accepts a privacy seed, backup password, viewing key, spending key, or
derived one-time private key. Recipient scanning and origin signing stay client-side.

## Run locally

Use dedicated relayer keys. `RELAYER_KEY` signs ordinary settlement transactions;
`SPONSOR_KEY` signs the sponsor authorization and pays its STX fee. They may be the same
testnet account for development but should be separately managed in production.

```sh
export PRIVARA_NETWORK=testnet
export PRIVARA_CORE_ADDRESS=ST...DEPLOYER
export PRIVARA_ASSET=ST...DEPLOYER.mock-token
export PRIVARA_TOKEN_NAME=mock
export PRIVARA_SPEND_CONTRACT=ST...DEPLOYER.privara-sponsored-spend-v2
export PRIVARA_SPONSOR_FEE_RECIPIENT=ST...TREASURY
export PRIVARA_TOKEN_SPONSOR_FEE=100
export RELAYER_KEY="$RELAYER_PRIVATE_KEY"
export SPONSOR_KEY="$SPONSOR_PRIVATE_KEY"
npm run relayer:serve
```

The server listens on `127.0.0.1:8787` by default. Put authenticated TLS ingress or a
reverse proxy in front of it for a remote deployment; do not expose the raw development
listener directly.

Check health:

```sh
curl http://127.0.0.1:8787/health
```

Submit an M1 signed intent or the JSON from `privateIntentEnvelope(...)`:

```sh
curl --fail-with-body \
  -H 'content-type: application/json' \
  --data-binary @intent.json \
  http://127.0.0.1:8787/v1/intents/settle
```

Submit the public origin-signed transaction created by `create:sponsored-sweep`:

```sh
curl --fail-with-body \
  -H 'content-type: application/json' \
  --data-binary @sponsored-sweep.json \
  http://127.0.0.1:8787/v1/stealth/sponsor
```

Successful submission returns HTTP `202` with a transaction ID and explorer URL. This
means the node accepted the broadcast, not that the transaction has mined; clients must
track the returned transaction ID to finality.

## Policy configuration

| Variable | Default | Meaning |
| --- | ---: | --- |
| `PRIVARA_MAX_INTENT_AMOUNT` | `100000000` | Maximum M1 settlement amount |
| `PRIVARA_MAX_RELAYER_FEE_BPS` | `100` | Maximum signed settlement fee (1%) |
| `PRIVARA_MAX_SWEEP_AMOUNT` | `100000000` | Maximum sponsored SIP-010 transfer |
| `PRIVARA_MAX_SPONSOR_FEE` | `10000` | Maximum sponsor fee in micro-STX |
| `PRIVARA_SPEND_CONTRACT` | `<core>.privara-sponsored-spend-v2` | Sponsor-bound atomic payment + fee helper |
| `PRIVARA_SPONSOR_FEE_RECIPIENT` | required | Token-fee treasury; separate from signer |
| `PRIVARA_TOKEN_SPONSOR_FEE` | `100` | Exact token service fee in atomic units |
| `PRIVARA_MAX_SPONSOR_TX_BYTES` | `4096` | Serialized sponsored-request limit |
| `PRIVARA_SPONSOR_RATE_LIMIT` | `10` | Sponsorships per one-time origin per window |
| `PRIVARA_SPONSOR_RATE_WINDOW_MS` | `60000` | In-memory rate-limit window |
| `STACKS_API_URL` | network default | Stacks API base URL override |
| `PORT` | `8787` | Local listen port |
| `PRIVARA_PROCESSED_STORE` | `.privara/relayer-processed.json` | Durable accepted-request IDs |

The sponsor additionally requires testnet/mainnet matching, sponsored single-signature
authorization, the configured helper contract's exact `sponsored-spend` method, six
canonical arguments, the allowed token, exact service fee and treasury, the expected
sponsor derived from `SPONSOR_KEY`, distinct destinations, deny post-condition mode, one
exact-total FT post-condition, a valid origin signature, and a matching confirmed Privara
M2 announcement. Accepted serialized requests are durably rejected on duplicate
submission.

The file-backed request store survives a local process restart. A multi-replica production
deployment still requires a shared transactional store, distributed sponsor-nonce
coordination, authentication/abuse controls, metrics, secret management, and finality
tracking.
