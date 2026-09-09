# Privara SDK

TypeScript SDK for M1 SIP-018 payment intents and M2 stealth recipients.

## M1 intent core

- `hashIntent(intent)` hashes the canonical seven-field Clarity tuple.
- `domainHash(network, router)` binds the chain and exact router deployment.
- `messageDigest(intent, network, router)` produces the SIP-018 digest.
- `signIntent(intent, privateKey, network, router)` produces the 65-byte RSV signature
  accepted by `settle-intent`.
- `randomNonce()` returns an unordered 64-bit uniqueness salt.
- `buildSettlementArgs(signedIntent)` formats the on-chain arguments. It deliberately
  omits `user`; the router recovers the payer from the signature.
- `reissue(intent)` creates a separately settleable authorization. Confirm cancellation
  of the original first or wait for its expiry to avoid double payment.

## M2 stealth core

- `generateIdentity` / `identityFromSeed` create an independent recovery seed and
  domain-separated spending/viewing keys.
- `deriveStealthForSender` creates a one-time recipient public key and ephemeral key.
- `deriveStealthPublicKeyForRecipient` performs watch-only detection using the viewing
  private key and spending public key.
- `deriveStealthForRecipient` derives spending authority only when the spending private
  key is explicitly supplied.
- `encryptStealthNote` / `decryptStealthNote` use ECDH, HKDF-SHA256, and AES-256-GCM.
  Associated data binds version, network, router, stealth principal, asset, and epoch.
- `exportPrivacySeed` / `importPrivacySeed` provide a password-encrypted authenticated
  recovery backup. Losing this seed can permanently lose access to stealth funds.
- `scanAnnouncement` / `scanAnnouncements` perform local recipient discovery.
- `serializeStealthAnnouncement` / `hashStealthAnnouncement` define the canonical payload
  committed to by the versioned M2 intent.
- `createStealthIntent` binds that announcement hash to the payment fields.
- `quoteSettlementFee` makes the user choice explicit: `included` deducts the fee from
  the entered amount, while `added` preserves the exact amount Bob should receive.
- `createPrivateIntent` resolves P/V from Bob's normal address, derives a fresh one-time
  address, encrypts the announcement, calculates the selected fee mode, and signs M2.
- `privateIntentEnvelope` produces the JSON-safe public request for the relayer endpoint.
- `signStealthIntent` uses the version-2, exact-router SIP-018 domain.
- `buildStealthSettlementArgs` refuses any payload that differs from the signed commitment.
- `fetchAnnouncementPage` reads the supported Hiro contract-log endpoint, authenticates
  canonical event hashes, and returns public candidate data for local scanning.
- `buildSponsoredSweep` creates an origin-signed SIP-010 transfer using p' with sponsored
  authorization and an exact-token post-condition.
- `validateSponsoredSweep` enforces the relayer's network, contract, method, amount,
  transaction-size, origin, memo, and post-condition policy before it pays a fee.
- `buildSponsoredSpend` signs an atomic helper call that binds the payment, destination,
  exact token sponsor fee, fee treasury, asset, and exact-total FT post-condition.
- `validateSponsoredSpend` reproduces the server's fail-closed sponsorship policy.
- `sendFromStealth` and `withdrawStealthBalance` fetch the relayer policy, read the live
  SIP-010 balance, sign with p' locally, submit only the serialized transaction, and
  return the broadcast transaction ID.
- `sweepStealthBalance` provides one UI-friendly partial/full-balance entry point.

`buildSponsoredSweep` remains exported only for compatibility with the first fee-free
testnet acceptance transaction. New integrations use `buildSponsoredSpend`.

## Private payment fee modes

With `feeMode: "added"`, `enteredAmount` is the exact amount delivered to Bob. At 1%,
entering `100_000_000` atomic sBTC units signs a total of `101_000_000`: Bob receives
`100_000_000` and the relayer receives `1_000_000`.

With `feeMode: "included"`, the same entered amount is the total Alice spends: Bob
receives `99_000_000` and the relayer receives `1_000_000`. All calculations use integer
atomic units and return a quote for display before signing.

## M1 signing example

```ts
import {
  buildSettlementArgs,
  createIntent,
  randomNonce,
  signIntent,
} from "@privara/sdk";

const router = "ST...DEPLOYER.privara-router";
const intent = createIntent({
  asset: "ST...DEPLOYER.mock-token",
  amount: 100_000n,
  recipient: "ST...RECIPIENT",
  relayer: "ST...RELAYER",
  relayerFee: 1_000n,
  nonce: randomNonce(),
  expiry: 1200,
});

const signed = signIntent(intent, process.env.USER_KEY!, "testnet", router);
const args = buildSettlementArgs(signed);
// Pass args to settle-intent. No payer/user argument is sent on-chain.
```

## Still deferred in M2

- multi-replica HTTP deployment and shared rate limiting/idempotency;
- live-chain expiry helpers.

Leather/Xverse integration currently lives in the reference React app rather than the
framework-neutral SDK package.

## Build and test

```bash
cd sdk
npm install
npm run build
```

The repository-level test suite contains the contract parity and M2 stealth tests:

```bash
npm test
npm run typecheck
```
