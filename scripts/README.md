# Privara demo scripts

End-to-end M1 flow driven from the TypeScript SDK: a user deposits, signs a payment
intent **offline**, a relayer broadcasts the settlement, and anyone can check status.
No secret is ever committed — every key and address comes from the environment.

## Configuration

| Env var | Meaning | Default |
|---|---|---|
| `PRIVARA_NETWORK` | `testnet` or `mainnet` | `testnet` |
| `PRIVARA_CORE_ADDRESS` | address that deployed `privara-router` | *(required)* |
| `PRIVARA_ASSET` | SIP-010 asset principal | `<core>.mock-token` |
| `USER_KEY` | hex private key of the depositing/signing user | *(as needed)* |
| `RELAYER_KEY` | hex private key of the relayer broadcasting settlement | *(as needed)* |
| `STACKS_API_URL` | RPC override | Hiro testnet/mainnet |

Run with `tsx` (installed as a dev dependency) or the npm aliases below.

## Flow

```sh
export PRIVARA_CORE_ADDRESS=ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT

# 1. User deposits tokens into the router.
USER_KEY=$USER_HEX npm run deposit -- 1000000

# 2. User signs an intent OFFLINE. Prints a JSON envelope to stdout.
#    args: <recipient> <relayer> <amount> <relayerFee> [expiryBlocks]
USER_KEY=$USER_HEX npm run create-intent -- \
  ST2RECIPIENT... ST3RELAYER... 100000 1000 > intent.json

# 3. Relayer broadcasts the settlement (reads the envelope; can also take `-` on stdin).
RELAYER_KEY=$RELAYER_HEX npm run settle -- intent.json

# 4. Anyone checks whether the intent settled + the user's nonce/deposit.
npm run status -- intent.json
```

The intent's digest binds the network's `chain-id`, so a signature made for testnet
can never be replayed on mainnet (and vice versa). Steps 1–4 are the exact sequence
recorded as the M1 acceptance demo.
