# SDK

TypeScript SDK for Privara SIP-010 payment intents.

## What's here (M1 core)

**`src/types.ts`** — `Intent`, `SignedIntent` (with `user`, `intentHash`, `digest`,
`userSig`), `SettlementRequest`, `RelayerInfo`.

**`src/crypto.ts`** — SIP-018 digest helpers:
- `hashIntent(intent)` — sha256 of the consensus-serialized intent tuple. Byte-for-byte
  identical to the contract's `hash-intent` (proven by the parity test).
- `domainHash(network)` — sha256 of the consensus-serialized domain tuple for a network.
  Computed offline; no RPC needed to sign.
- `messageDigest(intent, network)` — full SIP-018 digest:
  `sha256(0x534950303138 || domainHash || hashIntent)`. This is what the contract
  recovers the signer from via `secp256k1-recover?`.
- `CHAIN_ID` — `{ mainnet: 1n, testnet: 2147483648n }`. Binding chain-id into the
  domain means a testnet signature can never be replayed on mainnet.

**`src/intent.ts`** — `createIntent`, `signIntent(intent, privateKey, network)`,
`buildSettlementArgs(signedIntent)`.

`signIntent` uses `signMessageHashRsv` from `@stacks/transactions`, which emits the
65-byte RSV layout (recovery byte last) that Clarity's `secp256k1-recover?` expects.
It also derives and records the signer's Stacks principal from the key, so
`buildSettlementArgs` can supply the `user` argument that `settle-intent` requires.

## Usage

```ts
import { createIntent, signIntent, buildSettlementArgs } from "@privara/sdk";

const intent = createIntent({
  asset: "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token",
  amount: 100_000n,
  recipient: "ST2RECIPIENT...",
  relayer: "ST3RELAYER...",
  relayerFee: 1_000n,
  nonce: 0n,   // fetch from get-nonce on the router
  expiry: 1200, // block height
});

const signed = signIntent(intent, process.env.USER_KEY!, "testnet");
const args = buildSettlementArgs(signed);
// args.user, args.userSig, etc. — pass to settle-intent
```

## Deferred (M2)

- `encryptNote` / `decryptNote` — ECIES encrypted off-chain payment notes
  (ephemeral ECDH + AES-GCM using the relayer's registered pubkey).
- Nonce and expiry helpers that fetch live chain state.
- Wallet integration utilities (Leather, Xverse structured-message signing).

## Build

```bash
cd sdk && npm install && npm run build
```
