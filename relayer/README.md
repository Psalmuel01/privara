# Privara reference relayer

The reference service exposes the two Milestone 2 relayer operations:

- `POST /v1/intents/settle` validates and broadcasts either a signed M1 intent or an
  announcement-bound M2 private intent (`kind: "stealth"`).
- `POST /v1/stealth/sponsor` validates an origin-signed stealth transfer, adds the
  sponsor authorization, and broadcasts it.
- `GET /v1/stealth/sponsor-policy` returns the exact token fee and treasury the client
  must display and sign.
- `GET /v1/config` returns the public network, contracts, relayer address, asset, and
  settlement fee configuration consumed by the React app.

Neither endpoint accepts a privacy seed, backup password, viewing key, spending key, or
derived one-time private key. Recipient scanning and origin signing stay client-side.

## Run locally

Use dedicated relayer keys. `RELAYER_KEY` signs ordinary settlement transactions;
`SPONSOR_KEY` signs the sponsor authorization and pays its STX fee. They may be the same
testnet account for development but should be separately managed in production.

```sh
export PRIVARA_NETWORK=testnet
export PRIVARA_CORE_ADDRESS=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0
export PRIVARA_ROUTER=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-router-m2-sbtc
export PRIVARA_ASSET=SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token
export PRIVARA_TOKEN_NAME=sbtc-token
export PRIVARA_SPEND_CONTRACT=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-sponsored-spend-v2
export PRIVARA_SPONSOR_FEE_RECIPIENT=ST...TREASURY
export PRIVARA_TOKEN_SPONSOR_FEE=1200
export PRIVARA_ALLOWED_ORIGINS=http://127.0.0.1:5173
export RELAYER_KEY="$RELAYER_PRIVATE_KEY"
export SPONSOR_KEY="$SPONSOR_PRIVATE_KEY"
npm run relayer:serve
```

The server listens on `127.0.0.1:8787` by default. Put TLS ingress or a
reverse proxy in front of it for a remote deployment; do not expose the raw development
listener directly.

## Container deployment

Build the provider-neutral image from the repository root:

```sh
cp relayer/.env.example relayer.env
# Fill the two keys, treasury address, and exact deployed app origin in relayer.env.
docker build -f Dockerfile.relayer -t privara-relayer .
```

Run exactly one replica for the base testnet deployment and mount durable storage:

```sh
docker run --rm -p 8787:8787 \
  --env-file relayer.env \
  -v privara-relayer-data:/data \
  privara-relayer
```

### Railway

Set the service Dockerfile path to `Dockerfile.relayer` and leave the start command
blank so the image `CMD` is used. Create a Railway-managed volume mounted at `/data`;
the Dockerfile deliberately does not declare `VOLUME` because Railway manages
persistent mounts through its service settings. The relayer stores accepted request
IDs at `/data/relayer-processed.json`.

The hosting provider must supply HTTPS, persistent storage at `/data`, and secrets as
environment variables. Set `HOST=0.0.0.0`, `PRIVARA_PROCESSED_STORE` to
`/data/relayer-processed.json`, and `PRIVARA_ALLOWED_ORIGINS` to the exact deployed app
origin. Do not use `*`; requests from scripts without an `Origin` header still work.

For this base release keep one replica: sponsor nonce allocation is serialized inside
one process. Horizontal replicas require a transactional shared replay store and a
distributed lock before they are safe.

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

## BTC/USD display quote

`GET /v1/market/btc-usd` returns a briefly cached CoinGecko BTC/USD quote for the React
application. It is an optional display aid only: it is never used in intent validation,
fee calculations, signatures, or contract calls. Provider failure returns HTTP `503`
without interrupting exact sBTC payment and sponsored-spend endpoints.

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
| `HOST` | `127.0.0.1` | Bind host; use `0.0.0.0` inside a container |
| `PORT` | `8787` | Local listen port |
| `PRIVARA_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated exact browser origins |
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
