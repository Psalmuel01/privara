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

## Wallets

The demo uses three testnet accounts. Derive all three from a single fresh mnemonic:

```sh
# generates a new mnemonic and prints deployer/user/relayer addresses + hex keys
npm run gen-wallets
```

- **deployer** (account 0) — publishes the contracts; its mnemonic goes in
  `settings/Testnet.toml`.
- **user** (account 1) — deposits and signs intents; export as `USER_KEY`.
- **relayer** (account 2) — broadcasts settlement; export as `RELAYER_KEY`.

Fund all three with testnet STX from the
[Hiro faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet). `gen-wallets`
prints private keys — only ever use a fresh testnet-only mnemonic.

## Flow

```sh
# The address that deployed the contracts (account 0 / "deployer" from gen-wallets).
# Scripts build contract IDs as ${PRIVARA_CORE_ADDRESS}.privara-router, etc.
export PRIVARA_CORE_ADDRESS=ST...YOUR_DEPLOYER_ADDRESS

# 0. (mock-token dry run only) mint the mintable test asset to the user.
#    Skip this on the real sBTC demo — the user holds real sBTC instead.
USER_KEY=$USER_HEX npm run mint -- 1000000

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
