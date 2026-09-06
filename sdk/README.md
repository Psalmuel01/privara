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
- `signStealthIntent` uses the version-2, exact-router SIP-018 domain.
- `buildStealthSettlementArgs` refuses any payload that differs from the signed commitment.
- `fetchAnnouncementPage` reads the supported Hiro contract-log endpoint, authenticates
  canonical event hashes, and returns public candidate data for local scanning.

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

- sponsored SIP-010 sweep construction and relayer integration;
- live-chain expiry helpers;
- Leather/Xverse integration utilities.

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
