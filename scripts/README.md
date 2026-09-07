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
| `PRIVARA_PRIVACY_PASSWORD` | Password for encrypted stealth-seed backup (12+ characters) | *(for stealth registration)* |
| `PRIVARA_PRIVACY_BACKUP_PATH` | Encrypted stealth-seed backup location | `.privara/stealth-<network>-<wallet>.json` |

Run with `tsx` (installed as a dev dependency) or the npm aliases below.

## M2 stealth registry deployment

The new registry is deployed separately so the confirmed M1 contract names are never
reused. Verify the transaction locally and query live testnet state without broadcasting:

```sh
PRIVARA_CORE_ADDRESS=ST...YOUR_DEPLOYER_ADDRESS \
PRIVARA_DEPLOYER_ADDRESS=ST...YOUR_DEPLOYER_ADDRESS \
DRY_RUN=1 npm run deploy:stealth-registry:testnet
```

Remove `DRY_RUN=1` only when the reported address, nonce, and fee are correct. The command
publishes `privara-stealth-registry` and prints its transaction ID and explorer link.

The M2 router is a separate deployment with a version-2 signing domain. After the full
local suite passes, dry-run it against the original Privara deployer:

```sh
PRIVARA_CORE_ADDRESS=ST...YOUR_DEPLOYER_ADDRESS \
PRIVARA_DEPLOYER_ADDRESS=ST...YOUR_DEPLOYER_ADDRESS \
DRY_RUN=1 npm run deploy:router-m2:testnet
```

Removing `DRY_RUN=1` publishes `privara-router-m2`; it never overwrites or changes
`privara-router`.

## Register wallet stealth keys

The registration command generates an independent privacy seed, encrypts it locally,
registers only its public spending/viewing keys, waits for testnet confirmation, and
verifies the result through the SDK. It never prints the seed or derived private keys.

```sh
export PRIVARA_CORE_ADDRESS=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0
export USER_KEY="$USER_HEX"
read -s "PRIVARA_PRIVACY_PASSWORD?Privacy backup password: "
export PRIVARA_PRIVACY_PASSWORD
npm run register:stealth-keys
unset PRIVARA_PRIVACY_PASSWORD
```

The generated `.privara/stealth-testnet-<wallet>.json` file is gitignored and written
with owner-only permissions. Copy it to a second secure location. Running the command
again loads that backup and verifies the existing registration without broadcasting.
If a wallet already has different registered keys, the command refuses to replace them;
intentional rotation additionally requires `PRIVARA_ROTATE_STEALTH_KEYS=1`.

## M2 stealth acceptance

After `privara-router-m2` is confirmed, run the public testnet flow. It resolves the
registered recipient P,V, creates a fresh one-time address, mints/deposits MOCK, settles
the signed announcement-bound intent, and verifies the indexed event:

```sh
PRIVARA_CORE_ADDRESS=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0 \
npm run acceptance:stealth:testnet
```

Recipient detection and spend-key derivation happen locally after unlocking the backup:

```sh
export PRIVARA_CORE_ADDRESS=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0
export PRIVARA_RECIPIENT_ADDRESS=ST16H55CE41DBKFY9QDHESXQT2GD110WKT7VW9EPR
read -s "PRIVARA_PRIVACY_PASSWORD?Privacy backup password: "; echo
export PRIVARA_PRIVACY_PASSWORD
npm run scan:stealth:testnet
unset PRIVARA_PRIVACY_PASSWORD
```

The scanner validates that the encrypted backup matches the live registry record,
authenticates each indexed payload, decrypts matching notes locally, and proves the
one-time spending key can be derived without printing it.

## Sponsored stealth sweep

The client and relayer are deliberately separate commands. First, the recipient unlocks
the backup locally, derives p', and writes only an origin-signed sponsored transaction:

```sh
export PRIVARA_CORE_ADDRESS=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0
export PRIVARA_RECIPIENT_ADDRESS=ST16H55CE41DBKFY9QDHESXQT2GD110WKT7VW9EPR
export STEALTH_SETTLEMENT_TXID=0x16c7bebee5f479ab9de7e071faa84fcccaf5bf05cfe629332511111a8ab4ae99
export SWEEP_DESTINATION=ST...EXPLICIT_DESTINATION
export PRIVARA_SPONSOR_FEE_RECIPIENT=ST...TREASURY
export PRIVARA_SPONSOR_ADDRESS=ST...SPONSOR
export PRIVARA_TOKEN_SPONSOR_FEE=100
read -s "PRIVARA_PRIVACY_PASSWORD?Privacy backup password: "; echo
export PRIVARA_PRIVACY_PASSWORD
npm run create:sponsored-sweep
unset PRIVARA_PRIVACY_PASSWORD
```

Omit `SWEEP_AMOUNT` to withdraw the full balance net of the token sponsor fee. Set it to
the destination payment amount for a partial spend; the fee is added separately.

Then the relayer independently validates the network, origin signature, confirmed
Privara announcement, exact `privara-sponsored-spend-v2::sponsored-spend` call, expected
sponsor, payment ceiling, configured token fee and treasury, transaction size, deny mode,
and exact-total FT post-condition before adding its sponsor signature and paying the STX
fee:

```sh
PRIVARA_CORE_ADDRESS=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0 \
npm run sponsor:sweep:testnet -- sponsored-sweep.json
```

The same validated operation is available through the reference HTTP service. Configure
dedicated `RELAYER_KEY` and `SPONSOR_KEY` environment variables, run
`npm run relayer:serve`, and follow [`relayer/README.md`](../relayer/README.md).

Sweeping directly to the ordinary recipient address publicly links the one-time address
to that wallet. This is acceptable for the MOCK acceptance test but should be an explicit
user choice, not a silent SDK default.

## Combined HTTP paid acceptance

The Phase 4/5 runner exercises the real server adapter in one process: it registers a
disposable acceptance P/V pair, uses the high-level fee-added private-intent API, settles
through `POST /v1/intents/settle`, scans the indexed announcement, and withdraws through
`POST /v1/stealth/sponsor` with the v2 token fee:

```sh
npm run acceptance:http-paid:testnet
```

It reads only the local testnet mnemonic already configured for this repository. It
publishes testnet transactions and writes public evidence under the gitignored
`.privara/` directory; it never prints the mnemonic, privacy seed, or derived p'.

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
#    Use --silent so npm's own "> pkg@ver" banner does not land in the file.
USER_KEY=$USER_HEX npm run --silent create-intent -- \
  ST2RECIPIENT... ST3RELAYER... 100000 1000 > intent.json

# 3. Relayer broadcasts the settlement (reads the envelope; can also take `-` on stdin).
RELAYER_KEY=$RELAYER_HEX npm run settle -- intent.json

# 4. Anyone checks whether the intent settled + the user's nonce/deposit.
npm run status -- intent.json
```

The intent's digest binds the network's `chain-id`, so a signature made for testnet
can never be replayed on mainnet (and vice versa). Steps 1–4 are the exact sequence
recorded as the M1 acceptance demo.
