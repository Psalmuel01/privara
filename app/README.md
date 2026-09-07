# Privara React demo

A standalone Vite + React application for the Privara M2 experience. It is kept inside
this repository and has no hosted-platform integration.

## Run locally

```sh
cd app
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Create a production bundle with `npm run build`; the output
is written to `app/dist/` for deployment on any static host.

## Demo coverage

- sBTC-first private balance dashboard;
- configurable SIP-010 asset registry, with testnet MOCK as the second example;
- exact-recipient and fee-inclusive private payment modes using `@privara/sdk` math;
- P/V registration and encrypted-backup explanation;
- local announcement scanning and detected one-time balances;
- partial sponsored payments and full withdrawals with separate token/STX fees;
- public-wallet privacy warning before withdrawal;
- DAO contributor payout flow and confirmed testnet proof links.

Wallet approval and broadcast buttons are intentionally simulated in this UI build. No
private key, mnemonic, or privacy seed is embedded in frontend source. The confirmed
testnet proof linked in the interface comes from the real Phase 4/5 HTTP acceptance run.
Connecting Leather/Xverse and a deployed relayer URL is the remaining live-integration
step before treating this as a production transaction interface.

## Adding another SIP-010 token

Add its symbol, decimals, contract principal, display metadata, and sponsor fee to
`src/config/assets.ts`, then enable the same contract in the relayer policy. Components
do not branch on token symbols, so the existing send, receive, fee, and sweep screens will
use the new asset configuration.
