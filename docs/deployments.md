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
| `mock-token` | `<deployer>.mock-token` | [explorer](<link>) |
| `privara-registry` | `<deployer>.privara-registry` | [explorer](<link>) |
| `privara-router` | `<deployer>.privara-router` | [explorer](<link>) |

### Live demo transactions

| Action | Tx ID | Explorer |
|---|---|---|
| Deposit | `<txid>` | [explorer](<link>) |
| Settle intent (success) | `<txid>` | [explorer](<link>) |
| Replay rejected (ERR_INTENT_USED u100) | `<txid>` | [explorer](<link>) |
| Expired intent rejected (ERR_INTENT_EXPIRED u101) | `<txid>` | [explorer](<link>) |
| Relayer registered in registry | `<txid>` | [explorer](<link>) |

### Whitelisted asset

`mock-token` is the whitelisted settlement asset for the testnet demo. The router
constant `SBTC` points to `<deployer>.mock-token`. To use real testnet sBTC, replace
that constant with `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token` before
deploying.

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
