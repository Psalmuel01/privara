# Deployments

Contract addresses, transaction IDs, and explorer links for each Privara deployment.

---

## Testnet — Stage 1: mock-token dry run

> Status: ✅ complete — end-to-end flow verified with the mintable `mock-token`
> stand-in before switching to real sBTC.

Network: Stacks testnet  
Deployer: `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN`  
Whitelisted asset (`SBTC` constant): `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.mock-token`

Demo roles:

| Role                            | Address                                     |
| ------------------------------- | ------------------------------------------- |
| deployer                        | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN` |
| user (signs intents)            | `ST16H55CE41DBKFY9QDHESXQT2GD110WKT7VW9EPR` |
| relayer (broadcasts settlement) | `ST15SJ519YTDC54FP9NKZ239S59E5EKMYMSMC6QF2` |
| recipient                       | `ST367CTM3NZAXSQ8BF6P63G0R701PV0ER7CX6Z137` |

| Contract           | Address                                                      | Deploy tx        |
| ------------------ | ------------------------------------------------------------ | ---------------- |
| `sip010-ft-trait`  | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.sip010-ft-trait`  | [explorer](txid) |
| `mock-token`       | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.mock-token`       | [explorer](txid) |
| `privara-registry` | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.privara-registry` | [explorer](txid) |
| `privara-router`   | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.privara-router`   | [explorer](txid) |

For this stage the router's `SBTC` constant is set to `.mock-token`, so `mock-token`
is deployed alongside the production contracts. Stage 2 reverts the constant to real
sBTC and `mock-token` is dropped.

---

## Testnet — Stage 2: real sBTC

> Status: ✅ complete — fresh deployer, `SBTC` set to canonical testnet sBTC. Deploys
> `privara-router` (+ trait, registry) and runs the flow with real sBTC (no `mint`).

Network: Stacks testnet  
Deployer: `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN`  
Whitelisted asset (`SBTC` constant): `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`

Stage 2 uses a new deployer address, so `privara-router` is a fresh contract at
`ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.privara-router` (no name collision with the
Stage 1 deployer's router; the contract name is unchanged).

Deploy tx IDs are pending backfill (testnet indexer was down at capture time; the
contracts are live — verified by the successful deposit/settle txs below).

| Contract                      | Address                                                      | Deploy tx       |
| ----------------------------- | ------------------------------------------------------------ | --------------- |
| `sip010-ft-trait`             | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.sip010-ft-trait`  | _pending_       |
| `privara-registry`            | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.privara-registry` | _pending_       |
| `privara-router` (sBTC build) | `ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.privara-router`   | _pending_       |

### sBTC demo transactions

Confirmed on-chain via the varied-intent shakeout (real sBTC, no mint step). Every
settlement that ran succeeded; the two below are representative (a min-size intent and a
larger one with a 5000 fee).

| Action                                            | Tx ID                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Deposit (0.001 sBTC)                              | `c7cb1ece4192f7b92b833f563f0db22a2c76bcb0d84e8e898d0ef48792c60dc5` |
| Settle intent (success, 100000/1000)              | `0275cb999b735e12997e0ee8b9fb68c39a803a53d15083544cb1b14c9e7c9e50` |
| Settle intent (success, 250000/5000)              | `e054e4505072fe14db5801493413b984cf1069dc30eaac0c87e17c32621101b0` |
| Expired intent rejected (ERR_INTENT_EXPIRED u101) | _pending — run expiry proof against Stage 2_                       |
| Relayer registered in registry                    | _pending_                                                         |

Explorer: `https://explorer.hiro.so/txid/0x<tx-id>?chain=testnet`

## Managing the SBTC constant

The router's whitelisted asset is a single `define-constant SBTC` line. It varies by
network and is the only source difference between a test build and a testnet build:

| Target                             | `SBTC` value                                            |
| ---------------------------------- | ------------------------------------------------------- |
| simnet / tests (committed default) | `.mock-token`                                           |
| testnet                            | `'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token` |
| mainnet                            | `'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` |

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
