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

## sBTC status

The confirmed deployment above is the Milestone 1 mock-token acceptance environment.
The router compiled into that deployment whitelists `.mock-token`.

The sBTC path is deferred because no test tokens are currently available. No sBTC
contract, deposit, settlement, or transaction ID is claimed for this run.


