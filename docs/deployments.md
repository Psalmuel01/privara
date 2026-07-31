# Deployments

Contract addresses, transaction IDs, and explorer links for each Privara deployment.

---

## Testnet

> Status: pending — Phase 4 in progress.

Network: Stacks testnet  
Deployer: `<deployer-address>`  
Deploy date: `<date>`

| Contract | Address | Deploy tx |
|---|---|---|
| `sip010-ft-trait` | `<deployer>.sip010-ft-trait` | [explorer](<link>) |
| `privara-registry` | `<deployer>.privara-registry` | [explorer](<link>) |
| `privara-router` | `<deployer>.privara-router` | [explorer](<link>) |

`mock-token` is a test-only fixture and is not deployed to testnet — the router
whitelists the canonical testnet sBTC contract instead.

### Live demo transactions

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

The testnet demo settles **real testnet sBTC**:
`ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token` (8 decimals).

Before deploying, the router's `SBTC` constant is set to that principal. The committed
contract keeps `.mock-token` as its value so the offline test suite (`npm test`) runs
without any network dependency — `mock-token` is the mintable stand-in for sBTC in
simnet. `mock-token` is **not** deployed to testnet; only the four production contracts
below are. See "Managing the SBTC constant" for how the swap is handled.

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
