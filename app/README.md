# Privara React testnet application

Standalone Vite + React client for the live Privara M2 flow. Wallet private keys remain
inside Leather/Xverse; the independent privacy seed is encrypted locally and is never
sent to the relayer.

## Run locally

```sh
cd app
npm install
npm run dev
```

Copy the public environment template first:

```sh
cp .env.example .env.local
```

Open `http://127.0.0.1:5173`. The relayer must be running at the URL configured by
`VITE_PRIVARA_RELAYER_URL`. Create a production bundle with `npm run build`; `VITE_`
values are public and compiled into `app/dist/`, so private keys must never use that
prefix.

## Live testnet flow

1. Start the relayer and app.
2. Connect a Leather or Xverse **testnet** account.
3. In **Receive & scan**, create a 12+ character backup password and create the privacy
   identity. Download the encrypted JSON, import it to prove recovery, and only then
   approve P/V registration. Keep another secure copy.
4. In **Send privately**, enter a registered recipient and amount. The app checks the
   available Privara balance and, when necessary, requests one wallet approval for the
   exact funding shortfall. It waits for confirmation and continues automatically.
5. Review the recipient amount and fee, sign the SIP-018 message in the wallet, and
   submit it to the relayer. MOCK faucet minting is under **Testnet tools & advanced
   details** and is not part of the production payment experience.
6. The recipient imports/unlocks their own backup and scans. After the settlement is
   confirmed and indexed, the one-time balance appears.
7. Select **Spend** to make a partial payment or withdraw all. The one-time key signs in
   the browser; the relayer adds its sponsor signature and pays the STX network fee.

MOCK is the only live asset in this deployment because `privara-router-m2` currently
whitelists that exact contract. sBTC remains visible but disabled until a separate
sBTC-bound router/helper pair is reviewed and deployed.

Wallet and live-chain approvals cannot be automated by the test suite. Always inspect
the contract, arguments, amount, fee mode, and network displayed by the wallet.

## Adding another SIP-010 token

Deploy a router/helper pair bound to the asset, configure the relayer with that exact
contract and token name, then add its display metadata to `src/config/assets.ts` and set
`liveTestnet` only after live acceptance succeeds.
