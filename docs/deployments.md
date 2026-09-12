# Deployments

Confirmed contract addresses, transaction IDs, and the reproducible Milestone 1
acceptance flow.

## Testnet — Milestone 1 mock-token deployment

Status: **deployed and confirmed on 2026-08-13**.

| Setting | Value |
| --- | --- |
| Network | Stacks testnet |
| Deployer | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0` |
| Router asset | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.mock-token` |
| Clarity version | 4 |
| Deployment blocks | `63647`–`63648` |

### Contracts

| Contract | Address | Deployment transaction |
| --- | --- | --- |
| `sip010-ft-trait` | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.sip010-ft-trait` | [47fd954c…cc55](https://explorer.hiro.so/txid/0x47fd954c213a1770b612bbc17e3feb3cac8e79eb0e91092cdcae07779978cc55?chain=testnet) |
| `mock-token` | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.mock-token` | [c440e871…9397](https://explorer.hiro.so/txid/0xc440e87148289bb17278f580418e2b4e0342755401de379926e06a3461849397?chain=testnet) |
| `privara-registry` | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-registry` | [3864a62a…e890](https://explorer.hiro.so/txid/0x3864a62ac6ff7fb90f8e32f556f443dd9866d936b5395dd491eb258f395be890?chain=testnet) |
| `privara-router` | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-router` | [faf35c91…759f](https://explorer.hiro.so/txid/0xfaf35c91071debcada464cc025f1cbd6186aa53782baa94fa7e619f03b03759f?chain=testnet) |

### Deployment command and Clarinet workaround

The deployer mnemonic is stored only in the gitignored `settings/Testnet.toml` file.
The deployment was executed with:

```sh
DEPLOYER_ACCOUNT_INDEX=0 \
PRIVARA_DEPLOYER_ADDRESS=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0 \
npm run deploy:testnet
```

## Acceptance transaction checklist

The following is the complete mock-token acceptance flow. Steps marked **on-chain**
consume testnet STX; intent creation and status checks do not.

The confirmed run below was automated with:

```sh
PRIVARA_CORE_ADDRESS=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0 \
npm run acceptance:testnet
```

### 1. Prepare the accounts

The existing testnet-only mnemonic derives these roles:

| Role | Account | Address |
| --- | --- | --- |
| Deployer | 0 | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0` |
| User/payer | 1 | `ST16H55CE41DBKFY9QDHESXQT2GD110WKT7VW9EPR` |
| Relayer | 2 | `ST15SJ519YTDC54FP9NKZ239S59E5EKMYMSMC6QF2` |
| Recipient | 4 | `ST1E8384R43BGYAB494CE4A3W2V9HMH2V0W130DTK` |

The user and relayer each had **500 testnet STX** (nonce `0`) when checked on
2026-08-13, so both are ready to pay transaction fees. If those balances are later
depleted, fund both addresses again. Keep all private keys in the shell environment;
never add them to this file or commit them.

```sh
export PRIVARA_NETWORK=testnet
export PRIVARA_CORE_ADDRESS=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0
export PRIVARA_ASSET=STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.mock-token
export USER_KEY=<ACCOUNT_1_TESTNET_PRIVATE_KEY>
export RELAYER_KEY=<ACCOUNT_2_TESTNET_PRIVATE_KEY>
```

Choose a recipient. A fresh testnet address best demonstrates the intended routing flow:

```sh
export RECIPIENT=ST1E8384R43BGYAB494CE4A3W2V9HMH2V0W130DTK
export RELAYER=ST15SJ519YTDC54FP9NKZ239S59E5EKMYMSMC6QF2
```

### 2. Register the relayer — optional, on-chain

Registration is for discovery only; the router does not require it to settle an intent.
The confirmed acceptance run used the intentionally non-routable placeholder endpoint
`https://testnet.invalid/privara-relayer`; replace it with a real endpoint when the
reference relayer is hosted.

```sh
npm run register-relayer -- 100 https://testnet.invalid/privara-relayer
```

This advertises a fee rate of 100 basis points (1%). Record the confirmed transaction ID
in the results table below.

### 3. Mint mock tokens — required, on-chain

The deployed mock token uses six decimals. This example mints `1,000,000` base units
(1 MOCK) to the user:

```sh
npm run mint -- 1000000
```

Wait for confirmation before depositing.

### 4. Deposit into the router — required, on-chain

```sh
npm run deposit -- 1000000
```

This transfers the user's MOCK into `privara-router` and credits the user's internal
deposit balance.

### 5. Create and sign an intent — required, off-chain

The example authorizes `100,000` base units in total: `99,000` to the recipient and
`1,000` to the relayer. The default expiry is 200 blocks after the current tip.

```sh
npm run --silent create-intent -- \
  "$RECIPIENT" "$RELAYER" 100000 1000 > intent.json
```

Inspect `intent.json` before sharing it. In particular, verify `asset`, `amount`,
`recipient`, `relayer`, `relayerFee`, and `expiry`. This step does not broadcast a
transaction.

### 6. Settle the intent — required, on-chain

```sh
npm run settle -- intent.json
```

The relayer broadcasts `settle-intent`. The script waits for mining and must report
`success`. Record its transaction ID.

### 7. Verify settlement — required, read-only

```sh
npm run status -- intent.json
```

Expected result: `settled: true`, with the user's router deposit reduced by `100000`.
Also verify the recipient received `99000` MOCK and the relayer received `1000` MOCK in
the explorer.

### 8. Prove replay protection — acceptance evidence, on-chain

Submit the exact same envelope again:

```sh
npm run settle -- intent.json
```

Expected mined result: `abort_by_response` with `(err u100)` (`ERR_INTENT_USED`). The
script exits non-zero because rejection is the expected security result. Record this
transaction ID separately from the successful settlement.

### 9. Prove expiry enforcement — acceptance evidence, on-chain

Create a second intent with an expiry height that is already in the past. Passing `1` as
the final argument makes that unambiguous on testnet:

```sh
npm run --silent create-intent -- \
  "$RECIPIENT" "$RELAYER" 100000 1000 1 > expired.json
npm run settle -- expired.json
```

Expected mined result: `abort_by_response` with `(err u101)`
(`ERR_INTENT_EXPIRED`). Record the transaction ID.

### 10. Capture the final evidence

Confirmed acceptance results:

| Action | Expected result | Transaction ID |
| --- | --- | --- |
| Relayer registration | `(ok <relayer>)` | [580c3c73…a425](https://explorer.hiro.so/txid/0x580c3c73bb2c5e09935c71e1e66297523b1c9abbe8d5b9637c4cc4ae526da425?chain=testnet) |
| Mint `1,000,000` MOCK | `(ok u1000000)` | [45c3efea…1ef8](https://explorer.hiro.so/txid/0x45c3efead562f12ba73f4e9738bf06c6c32198ee96af10dce0c175d24ca71ef8?chain=testnet) |
| Deposit `1,000,000` MOCK | `(ok u1000000)` | [556c3014…8159](https://explorer.hiro.so/txid/0x556c3014552412c9d3e6dd6720113dc7238037fd06d3ca08399bfd03d41e8159?chain=testnet) |
| Settle `100,000`, fee `1,000` | `(ok 0x1aea90e1…d696)` | [10e4d0ca…6ff2](https://explorer.hiro.so/txid/0x10e4d0cab2f4d465836157f37bf4113bc95e7d4b330769cbf000bed627256ff2?chain=testnet) |
| Replay same intent | `(err u100)` | [f84fe54a…5272](https://explorer.hiro.so/txid/0xf84fe54aa72d35261e8f54d2cd0bfd1e56d492d3eff07940f4466c87e1605272?chain=testnet) |
| Settle expired intent | `(err u101)` | [5c11ae3a…2aa9](https://explorer.hiro.so/txid/0x5c11ae3afa328568a3ea5104d06008ffe7649ff46be190c1272eed01f6962aa9?chain=testnet) |

Verified final state:

- Router deposit: `900000` MOCK
- Recipient balance: `99000` MOCK
- Relayer balance: `1000` MOCK
- Successful intent digest: `1aea90e1394f46f6850ce7b5374077e25ba1503fdeb8bff836a4298a7554d696`

## Testnet — Milestone 2 stealth registry

Status: **deployed and confirmed on 2026-09-06**.

| Setting | Value |
| --- | --- |
| Deployer / core address | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0` |
| Contract | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-stealth-registry` |
| Clarity version | 4 |
| Deployment block | `272093` |
| Deployment result | `(ok true)` |
| Deployment transaction | [8e026e77…9c1e](https://explorer.hiro.so/txid/0x8e026e77a43ff62d2858f773c949d4880f76f3fc45ec23f7fe28acc074c99c1e?chain=testnet) |

The deployment uses nonce `4` and a `60,000` micro-STX fee. No recipient keys were
registered as part of deployment. Key registration is blocked until the encrypted
privacy-seed backup has been downloaded and successfully restored from its JSON. Do not
register disposable keys for a wallet that may later receive funds. This independent
Privara seed—not Leather, Xverse, or a hardware wallet—controls stealth funds.

The backed-up test wallet registered P,V at epoch `1` in block `272459`:
[070deff4…ba39](https://explorer.hiro.so/txid/0x070deff4af1aa221a5aacf3dabca6f1fbc075662659ea3bdda59ff3aa808ba39?chain=testnet).
Only its public compressed keys are present on-chain.

## Testnet — Milestone 2 announcement-bound router

Status: **deployed and confirmed on 2026-09-06**.

| Setting | Value |
| --- | --- |
| Deployer / core address | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0` |
| Contract | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-router-m2` |
| Signing domain version | `2` |
| Clarity version | 4 |
| Deployment block | `272880` |
| Deployment result | `(ok true)` |
| Deployment transaction | [fff2b928…76c8](https://explorer.hiro.so/txid/0xfff2b928cd44a2be06e63ae5f71a8375b16ed73a7889bb7fd0c9e187830576c8?chain=testnet) |

The deployment used nonce `5` and a `100,000` micro-STX fee. It is a separate contract;
the confirmed M1 `privara-router` and its version-1 signing domain were not modified.

## Testnet — Milestone 2 sBTC router

Status: **deployed and confirmed on 2026-09-08**.

| Setting | Value |
| --- | --- |
| Deployer / core address | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0` |
| Contract | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-router-m2-sbtc` |
| Whitelisted SIP-010 asset | `SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token` |
| SIP-010 token name | `sbtc-token` |
| Signing domain version | `2` |
| Clarity version | 4 |
| Deployment block | `291076` |
| Deployment result | `(ok true)` |
| Deployment transaction | [38eb9a76…ccb5](https://explorer.hiro.so/txid/0x38eb9a76394eaac2c5fc7d20a00566b1980337a2cf918287cbb4f250a5c9ccb5?chain=testnet) |

This deployment used nonce `25` and a `100,000` micro-STX fee. The original core
address, stealth registry, MOCK router, and historical intents were not changed. New
sBTC intents are signed for the `privara-router-m2-sbtc` domain and cannot be replayed
against the MOCK router.

## Testnet — Milestone 2 sponsored-spend helpers

Status: **deployed and confirmed on 2026-09-07**.

| Setting | Value |
| --- | --- |
| Deployer / core address | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0` |
| Contract | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-sponsored-spend-v2` |
| Clarity version | 4 |
| Deployment block | `281347` |
| Deployment result | `(ok true)` |
| Deployment transaction | [a862d9b1…d727](https://explorer.hiro.so/txid/0xa862d9b1591b6f989a543ac9122b47ed1c1bcba64b25e3d7b37e3a27aa56d727?chain=testnet) |

The canonical v2 deployment used nonce `9` and a `60,000` micro-STX fee. This additive
helper does not modify either router and never takes custody. Its single
`sponsored-spend` entrypoint atomically moves the signed payment amount to the signed
destination and the exact signed token service fee to a separate treasury. It also binds
the expected Stacks sponsor in the origin-signed call and rejects a different actual
sponsor.

The immutable `privara-sponsored-spend` prototype was deployed earlier in block `281318`
([fb76f228…c3e7](https://explorer.hiro.so/txid/0xfb76f228df3b961199c7c1cfeff28997234449e809a08ad93e92b5ca9563c3e7?chain=testnet)).
It lacks the expected-sponsor binding, is unsupported by the SDK and relayer, and was
never used for a payment.

### First M2 stealth acceptance flow

| Action | Result | Transaction ID |
| --- | --- | --- |
| Mint `1,000,000` MOCK | `(ok u1000000)` | [38b50453…f12c](https://explorer.hiro.so/txid/0x38b50453ea9a9fc17c6b641de06269592958f514cd0b1e72e5ba878056a1f12c?chain=testnet) |
| Deposit into M2 router | `(ok u1000000)` | [b1a578aa…2192](https://explorer.hiro.so/txid/0xb1a578aa8f71a1002e462fabe735935967739643cdd9126af5483bd0bb822192?chain=testnet) |
| Settle stealth intent | `(ok 0x5b71bb97…866e)` | [16c7bebe…ae99](https://explorer.hiro.so/txid/0x16c7bebee5f479ab9de7e071faa84fcccaf5bf05cfe629332511111a8ab4ae99?chain=testnet) |

Confirmed settlement details:

- One-time recipient: `STF0481P1D2KVP1EAND65NKZGHXBG03KBKJXJEB9`
- Amount: `100000` MOCK; recipient net: `99000`; relayer fee: `1000`
- Announcement hash: `4ba84b44a6715434302b8d63c6865508164f17ac86a932b0b5e5ce821d944466`
- Intent digest: `5b71bb971c0daba69fe4baacd371f2b7b3894d0c1fa29d2e19fc622b87b5866e`
- Settlement block: `272903`
- Indexed contract-log event: index `2`, canonical hash revalidated by the SDK

The ordinary recipient wallet is not an intent or event field. `stealth-intent.json`
contains the public signed acceptance envelope and remains gitignored. The encrypted
privacy backup and its password are required separately for recipient detection and
one-time spend-key derivation.

Recipient-side acceptance was subsequently confirmed: the local scanner authenticated
the encrypted backup against the registered P,V record, detected the indexed settlement,
decrypted its note, and derived the one-time spending key without printing it.

### First sponsored stealth sweep (fee-free compatibility path)

The recipient derived the one-time private key locally, signed only the origin half of a
sponsored SIP-010 transfer, and handed the serialized transaction to the reference
relayer. The relayer validated the contract, method, asset, amount, destination,
post-condition mode, exact fungible-token post-condition, network, size, and origin
signature before adding its independent sponsor signature.

| Action | Result | Transaction ID |
| --- | --- | --- |
| Sweep `99,000` MOCK from the one-time address | `(ok true)` | [d3e46715…3374](https://explorer.hiro.so/txid/0xd3e46715178147904fbf1437d05cfb503f85a778b0b56579047c256dfd583374?chain=testnet) |

Confirmed sweep details:

- Block: `275753`
- Origin: `STF0481P1D2KVP1EAND65NKZGHXBG03KBKJXJEB9`
- Destination: `ST16H55CE41DBKFY9QDHESXQT2GD110WKT7VW9EPR`
- Sponsor: `ST15SJ519YTDC54FP9NKZ239S59E5EKMYMSMC6QF2`
- Sponsor fee: `374` micro-STX
- Final origin balances: `0` MOCK and `0` STX
- Final destination MOCK balance: `99000`

This confirms the complete recipient flow: indexed discovery, local one-time key
derivation, origin authorization, sponsored broadcast, and withdrawal without funding
the one-time address with STX. The gitignored `sponsored-sweep.json` contains the public
origin-signed transaction, not the derived private key.

This first acceptance predates the token-paid helper and therefore charged no separate
MOCK sponsorship fee. New sponsored-spend transactions use the deployed helper above;
their paid live acceptance is recorded below.

### Paid v2 HTTP acceptance flow

Status: **confirmed on 2026-09-07**. Both settlement and sponsorship were submitted
through the reference HTTP service, using the high-level SDK rather than hand-built
transaction arguments.

| Action | Result | Transaction ID |
| --- | --- | --- |
| Update acceptance P/V to epoch 2 | `(ok u2)` | [622bf42e…29a6](https://explorer.hiro.so/txid/0x622bf42e0be017a2b401fbc6ffb792b4c174fbf5c6aa24c3029c4269684c29a6?chain=testnet) |
| Mint `120,000` MOCK | `(ok u120000)` | [e73003d8…a115](https://explorer.hiro.so/txid/0xe73003d8fd0ec596586f12984f9b1811707dc14b78a210d0630847b61e41a115?chain=testnet) |
| Deposit `120,000` MOCK into M2 | `(ok u120000)` | [a1a489b5…d8a9](https://explorer.hiro.so/txid/0xa1a489b53c5f87354d6c934673316c6e36751ad01731160fb4f5ad2d9654d8a9?chain=testnet) |
| HTTP settle fee-added M2 intent | `(ok 0xf8ddb679…137e)` | [8a3aa853…560d](https://explorer.hiro.so/txid/0x8a3aa8535da2e16a5b42a442bc458625a4bacb938f262ad18d2dd9fed01c560d?chain=testnet) |
| HTTP paid full withdrawal | `(ok u99000)` | [8d4dcb85…aeb2](https://explorer.hiro.so/txid/0x8d4dcb85038232e02462f3b000dd59f6da136703692fd6c5c5b6309e5b9aaeb2?chain=testnet) |

The fee-added settlement removed `99,990` MOCK from Alice's deposit: the fresh one-time
address received exactly `99,000` and the settlement relayer received `990` (1% of the
entered recipient amount). The one-time address was
`ST24B2NYPBNEKXPY9HHY2WC8N436KHYZJWN4XN6AY` and held no STX.

The subsequent v2 call withdrew the full token balance atomically: `98,900` MOCK went to
`ST16H55CE41DBKFY9QDHESXQT2GD110WKT7VW9EPR`, `100` MOCK went to the separate Privara
treasury, and sponsor `ST15SJ519YTDC54FP9NKZ239S59E5EKMYMSMC6QF2` paid the `549`
micro-STX network fee. The stealth origin ended with `0` MOCK without ever being funded
with STX.

### Local intent evidence files

The acceptance runner regenerated both gitignored local envelopes against the canonical
router `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-router`:

- `intent.json` has a matching intent hash and SIP-018 digest, recovers the expected
  user, and was successfully settled. It is now spent and cannot be settled again.
- `expired.json` has a matching intent hash and SIP-018 digest and recovers the expected
  user, but intentionally has expiry block `1`; its settlement was rejected with
  `ERR_INTENT_EXPIRED (u101)`.

These files contain public signed authorizations and remain excluded from git. Generate
new envelopes for future payments rather than reusing either evidence file.

Explorer URL format:

```text
https://explorer.hiro.so/txid/0x<TX_ID>?chain=testnet
```

## Phase 6 browser app and relayer deployment

The React app now performs the live M2 flow. It does not accept wallet private keys.
Leather/Xverse signs wallet operations; a separate Privara privacy seed controls stealth
funds, is encrypted in the browser, and is never sent to the relayer. Connected wallets
and hardware wallets cannot recover that seed.

### Relayer service

Copy `relayer/.env.example` to the gitignored `relayer.env`, then set:

- `RELAYER_KEY`: testnet account 2 key used for settlement transactions;
- `SPONSOR_KEY`: the sponsor key that pays STX (it may equal account 2 for this demo);
- `PRIVARA_ROUTER`: `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-router-m2-sbtc`;
- `PRIVARA_ASSET`: `SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token`;
- `PRIVARA_TOKEN_NAME`: `sbtc-token`;
- `PRIVARA_SPONSOR_FEE_RECIPIENT`: the wallet receiving the signed sBTC sponsor fee;
- `PRIVARA_TOKEN_SPONSOR_FEE`: `200` atomic units (200 sats, or `0.00000200 sBTC`)
  for the testnet policy;
- `PRIVARA_ALLOWED_ORIGINS`: exact HTTPS React origin, without a trailing slash.

The settlement/sponsor wallet must hold enough testnet STX. Never add either key to the
React environment or any variable beginning with `VITE_`.

Build and run the provider-neutral container:

```sh
docker build -f Dockerfile.relayer -t privara-relayer .
docker run --rm -p 8787:8787 \
  --env-file relayer.env \
  -v privara-relayer-data:/data \
  privara-relayer
```

For Railway, set the Dockerfile path to `Dockerfile.relayer`, leave the start command
blank, and attach a Railway-managed volume at `/data`. Do not add a Dockerfile `VOLUME`
instruction; persistent storage is configured on the Railway service instead.

The remote service must use HTTPS, a persistent `/data` volume, and one replica for the
base release. Verify it before building the frontend:

```sh
curl --fail https://RELAYER_HOST/health
curl --fail https://RELAYER_HOST/v1/config
curl --fail https://RELAYER_HOST/v1/stealth/sponsor-policy
```

### React application

Create `app/.env.local` from `app/.env.example` and set:

```sh
VITE_PRIVARA_RELAYER_URL=https://RELAYER_HOST
VITE_STACKS_API_URL=https://api.testnet.hiro.so
```

Run `npm run app:build`, then deploy `app/dist/` to a static HTTPS host. If its final
origin differs from `PRIVARA_ALLOWED_ORIGINS`, update the relayer variable and restart
the service.

### Required browser acceptance

1. Bob connects a testnet wallet, creates and downloads an encrypted backup, restores
   that JSON in a fresh browser session, and only then registers/verifies P/V.
2. Alice connects a wallet funded with testnet sBTC and enters Bob's normal address and
   payment amount. If necessary, the app requests the exact router-funding shortfall and
   proceeds automatically after confirmation.
3. Alice chooses fee-added, reviews the exact payment, signs the SIP-018 intent, and
   records the returned settlement transaction ID.
4. After confirmation, Bob scans and sees the new one-time address and sBTC balance.
5. Bob pays another address from that balance, then withdraws any remainder. Record both
   sponsored transaction IDs and confirm the one-time address spent zero STX.

Add those transaction IDs above before declaring the Phase 6 exit complete.

### M2 hardening validation — 2026-09-08

Local validation passed with `141/141` tests, SDK/script typechecking, and a production
React build. The fresh-session recovery regression creates an encrypted backup in one
isolated browser storage, restores it into empty storage, verifies identical P/V, and
proves the registration gate opens only after export plus restore. A different backup is
rejected without changing existing storage unless the UI receives separate explicit
replacement confirmation.

The strict live test used different normal wallets for sender and recipient, plus the
operational relayer/sponsor account. It restored the recipient identity from an encrypted
backup before P/V registration, settled to a derived one-time address, found the indexed
announcement, derived the one-time spending key, approved a pinned `100` atomic MOCK
sponsor fee, and withdrew `98,900` MOCK to the recipient. The stealth origin ended at
zero MOCK and spent zero STX; the sponsor paid `541` micro-STX.

| Action | Confirmed testnet transaction |
| --- | --- |
| Recipient P/V registration | [9318f741…5e90](https://explorer.hiro.so/txid/0x9318f741ffd7d42ee5e41700ec10abb1b27ce7dc0dc72450c4b743110f7f5e90?chain=testnet) |
| Sender MOCK mint | [6798cdf7…ca8e](https://explorer.hiro.so/txid/0x6798cdf7ea44f34468b48440d8a4922698259619b3d4fd2701ea7b4e5e75ca8e?chain=testnet) |
| Sender router deposit | [52a98e34…d73f](https://explorer.hiro.so/txid/0x52a98e34530c9d00122c6da25ee22d1813fff6d664a3b75e074cd09f355dd73f?chain=testnet) |
| Private settlement | [6d369de8…d1f5](https://explorer.hiro.so/txid/0x6d369de865b577bf1b9573e3aafd9020e6f6eaed0225514cc902a9925ab4d1f5?chain=testnet) |
| Sponsored withdrawal | [60f22695…b1e7](https://explorer.hiro.so/txid/0x60f22695e04e349cdbf754e6fd8b281362e44ac58b6b69556e9bd19909f0b1e7?chain=testnet) |

Remaining validation limitations and expected failure cases:

- The isolated fresh-storage recovery test passed, but a graphical fresh-browser wallet
  walkthrough remains manual because no controllable browser/wallet session was connected
  during this run.
- A pinned sponsor quote is intentionally rejected if relayer policy changes before
  submission; the user must fetch and approve a new quote.
- Invalid announcement records are skipped, but complete Stacks API unavailability still
  prevents scanning and sponsor-origin verification.
- Mainnet contracts and the single-replica HTTPS relayer are deployed. Production
  acceptance remains open until a small real-sBTC settlement, scan, sponsored spend, and
  withdrawal are recorded, an independent security review is complete, and the
  sponsor-fee policy is validated against observed STX network costs. Multi-replica use
  additionally requires shared abuse/idempotency controls and distributed nonce coordination.

## sBTC acceptance status

Status: **complete through the real HTTP relayer path on 2026-09-08**.

The acceptance run used separate sender, recipient, and relayer/sponsor accounts. It
exported and restored a fresh encrypted privacy seed before registration, deposited
`120,000` sats, settled a fee-added private payment, detected its indexed announcement,
derived the fresh spending key, and completed a sponsored withdrawal. The fresh address
ended with zero sBTC and paid zero STX.

| Action | Confirmed testnet transaction |
| --- | --- |
| Recipient P/V registration | [e1a782c7…447a](https://explorer.hiro.so/txid/0xe1a782c7722defcb773377d393483d480f0d9734a0d84d13ff698ab1d649447a?chain=testnet) |
| Sender sBTC router deposit | [806c01a2…84d7](https://explorer.hiro.so/txid/0x806c01a2a5f55a72a4525b3122424d13aa9aef28b0de649b56d5a0308d1384d7?chain=testnet) |
| Private sBTC settlement | [d0c86135…e854](https://explorer.hiro.so/txid/0xd0c86135e63072085457535125d083e4fc1efd29f5cecf97ab946ba7ebf3e854?chain=testnet) |
| Sponsored sBTC withdrawal | [89ab391f…4bb9](https://explorer.hiro.so/txid/0x89ab391f7b8e22cfd7d2ae0656a3b60ff5df6a788df1a48fc73471134b454bb9?chain=testnet) |

The sender authorized `99,990` sats total: `99,000` sats to the one-time address and
`990` sats as the 1% settlement fee. The recipient later authorized `97,800` sats to the
withdrawal destination plus the independently displayed `1,200`-sat sponsorship fee.
The sponsor paid the `504` micro-STX network fee.

## Mainnet acceptance status

Status: **two settlements and one full sponsored withdrawal confirmed on 2026-09-10**.

The canonical evidence and account roles are recorded in
[mainnet-deployment.md](./mainnet-deployment.md). The complete mainnet flow deposited
6,462 sats, settled 6,398 sats to a fresh one-time address with a 64-sat settlement fee,
then withdrew the entire stealth balance: 5,198 sats to the chosen destination and 1,200
sats to the sponsor treasury. The stealth origin held zero STX; the sponsor paid 474
micro-STX.
