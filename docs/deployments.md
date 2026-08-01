# Deployments

Contract addresses, transaction IDs, and explorer links for each Privara deployment.

---

## Testnet — Stage 1: mock-token dry run

> Status: ✅ complete — end-to-end flow verified with the mintable `mock-token`
> stand-in before switching to real sBTC.

Network: Stacks testnet  
Deployer: `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0`  
Whitelisted asset (`SBTC` constant): `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.mock-token`

Demo roles:

| Role | Address |
|---|---|
| deployer | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0` |
| user (signs intents) | `ST16H55CE41DBKFY9QDHESXQT2GD110WKT7VW9EPR` |
| relayer (broadcasts settlement) | `ST15SJ519YTDC54FP9NKZ239S59E5EKMYMSMC6QF2` |
| recipient | `ST367CTM3NZAXSQ8BF6P63G0R701PV0ER7CX6Z137` |

| Contract | Address | Deploy tx |
|---|---|---|
| `sip010-ft-trait` | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.sip010-ft-trait` | [explorer](<txid>) |
| `mock-token` | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.mock-token` | [explorer](<txid>) |
| `privara-registry` | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-registry` | [explorer](<txid>) |
| `privara-router` | `STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-router` | [explorer](<txid>) |

For this stage the router's `SBTC` constant is set to `.mock-token`, so `mock-token`
is deployed alongside the production contracts. Stage 2 reverts the constant to real
sBTC and `mock-token` is dropped.

### Dry-run demo transactions

| Action | Tx ID | Explorer |
|---|---|---|
| Deposit | `<txid>` | [explorer](<link>) |
| Settle intent (success) | `<txid>` | [explorer](<link>) |
| Replay rejected (ERR_INTENT_USED u100) | `d732aa058361fcacd6dfe48a5ab8a9098a9f4b60873844c23f6958505cec9511` | [explorer](https://explorer.hiro.so/txid/0xd732aa058361fcacd6dfe48a5ab8a9098a9f4b60873844c23f6958505cec9511?chain=testnet) |
| Expired intent rejected (ERR_INTENT_EXPIRED u101) | `<txid>` | [explorer](<link>) |
| Relayer registered in registry | `<txid>` | [explorer](<link>) |

---

## Testnet — Stage 2: real sBTC

> Status: pending — fresh deployer, `SBTC` set to canonical testnet sBTC. Deploys
> `privara-router` (+ trait, registry) and runs the flow with real sBTC (no `mint`).

Network: Stacks testnet  
Deployer: `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN`  
Whitelisted asset (`SBTC` constant): `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`

Stage 2 uses a new deployer address, so `privara-router` is a fresh contract at
`ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.privara-router` (no name collision with the
Stage 1 deployer's router; the contract name is unchanged).

| Contract | Address | Deploy tx |
|---|---|---|
| `sip010-ft-trait` | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.sip010-ft-trait` | [explorer](<txid>) |
| `privara-registry` | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.privara-registry` | [explorer](<txid>) |
| `privara-router` (sBTC build) | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.privara-router` | [explorer](<txid>) |

### sBTC demo transactions

| Action | Tx ID | Explorer |
|---|---|---|
| Deposit | `<txid>` | [explorer](<link>) |
| Settle intent (success) | `<txid>` | [explorer](<link>) |
| Replay rejected (ERR_INTENT_USED u100) | `<txid>` | [explorer](<link>) |
| Expired intent rejected (ERR_INTENT_EXPIRED u101) | `<txid>` | [explorer](<link>) |
| Relayer registered in registry | `<txid>` | [explorer](<link>) |

## Managing the SBTC constant

The router's whitelisted asset is a single `define-constant SBTC` line. It varies by
network and is the only source difference between a test build and a testnet build:

| Target | `SBTC` value |
|---|---|
| simnet / tests (committed default) | `.mock-token` |
| testnet | `'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token` |
| mainnet | `'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` |

The committed value stays `.mock-token` so `npm test` needs no network. The testnet
value is set immediately before `clarinet deployments apply --testnet` and reverted
after, so the repo default never drifts. The deploy tx ID above pins exactly which
source was published.

### Whitelisted asset

The testnet demo runs in two stages, each with its own whitelisted asset:

- **Stage 1 (dry run, done):** `mock-token` — the mintable stand-in — was deployed to
  testnet so the full flow could be exercised with a faucet-mintable asset.
- **Stage 2 (pending):** **real testnet sBTC**,
  `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token` (8 decimals).

The committed contract keeps `.mock-token` as its `SBTC` value so the offline test
suite (`npm test`) runs without any network dependency. Before the Stage 2 deploy the
constant is set to the sBTC principal and reverted after. See "Managing the SBTC
constant" for how the swap is handled.

---

## Simnet / local

Contracts are deployed automatically by Clarinet on every test run. No persistent
addresses — see `Clarinet.toml` for the contract list and `tests/` for the test suite.

Run tests:

```
npm test
```

---

## Mainnet

Not yet deployed. Mainnet deployment requires replacing the `SBTC` constant with
`SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` and a separate audit.
