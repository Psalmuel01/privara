# Privara Developer Guide

## Overview

Privara provides one-time-address payments with encrypted announcements and local
recipient scanning. The live sBTC, USDCx, and native-STX paths use signed SIP-018 intents,
asset-specific router custody, and relayer-submitted settlement.

Repository:

```text
https://github.com/Psalmuel01/privara
```

## Install

```bash
git clone https://github.com/Psalmuel01/privara.git
cd privara
npm install
```

The reusable SDK is also published independently:

```bash
npm install @privara-stacks/sdk
```

The current stable release is `0.1.0`. Production integrations may pin it exactly with
`npm install @privara-stacks/sdk@0.1.0`.

Package: [@privara-stacks/sdk@0.1.0](https://www.npmjs.com/package/@privara-stacks/sdk/v/0.1.0)

Useful commands:

```bash
clarinet check
npm test
npm run app:dev
npm run app:build
npm --prefix sdk run build
```

## Mainnet Reference Configuration

| Component | Mainnet value |
| --- | --- |
| Registry | `SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-stealth-registry` |
| sBTC router | `SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-router-m2-sbtc` |
| USDCx router | `SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-router-m2-usdcx` |
| Sponsored spend | `SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-sponsored-spend-v2` |
| Native STX router | `SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-stx-router-v1` |
| sBTC asset | `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` |
| USDCx asset | `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx` |
| Relayer | `https://privara-production.up.railway.app` |

## Recipient Setup

The application should:

1. generate an independent random privacy seed
2. derive spending/viewing keypairs
3. encrypt and export a backup
4. require successful restore verification
5. register public spending/viewing keys onchain
6. mark private receiving enabled

Do not derive the privacy seed from wallet signatures.

## Privacy Identity

Conceptually:

```ts
const identity = generateIdentity();
```

Private values remain client-side.

## Register Public Stealth Keys

Register `P` and `V` against the user's normal Stacks principal.

The recipient's normal wallet remains the lookup identity used by senders.

## Sender Flow

The sender enters the recipient's normal Stacks address or BNS name. On mainnet, a
BNS name is resolved through BNSv2 to an exact address before the registry lookup. The
review shows that address, and the app re-resolves the name before signing; an ownership
change stops submission.

The application:

1. queries the stealth registry
2. validates returned secp256k1 points
3. samples fresh ephemeral randomness
4. derives one-time stealth principal
5. builds encrypted announcement
6. hashes announcement
7. creates M2 payment intent using stealth principal as recipient
8. shows human-readable payment summary
9. obtains SIP-018 signature

For native STX the same intent sequence is used, but `asset` and the SIP-018 domain
both identify `privara-stx-router-v1`. The sender first funds that separate router,
then submits the exact signed envelope to the relayer. The relayer pays the settlement
network fee. A one-time STX address pays its own later transfer fee; the full-withdrawal
path estimates and subtracts that fee before signing.

10. submits signed envelope to relayer

## Just-In-Time Router Funding

The protocol requires sender funds in the asset-specific router before relayer settlement.

The normal UI should not expose router balance as a primary concept.

Recommended flow:

```text
user enters recipient + amount
        ↓
app checks required router balance
        ↓
if short, deposit only missing amount
        ↓
sign private payment intent
        ↓
relayer settles
```

## Settlement Fee

Privara's existing settlement/relayer fee is 1% of the transferred token amount.

It is paid in the SIP-010 asset and is separate from Stacks network fees.

## Recipient Scanning

The recipient fetches public M2 settlement events and scans locally with the viewing key.

The scanner should:

- validate each record independently
- skip malformed records
- continue scanning
- never upload private keys

## Spending From Stealth Balance

The recipient can:

- withdraw full balance
- send a partial amount
- pay another principal directly
- keep remaining funds at the stealth address

## Sponsored Spending

If the stealth address has no STX:

1. fetch sponsor quote
2. show exact quote to user
3. freeze quote after approval
4. build origin transaction
5. sign locally with stealth private key
6. submit signed transaction to sponsor
7. sponsor validates exact payload
8. sponsor adds STX authorization and broadcasts

The sponsor never receives the stealth private key.

## Paid Sponsorship

For paid sponsorship, bind:

```text
asset
destination
payment amount
fee recipient
sponsor fee
expected sponsor
```

The relayer must reject any mismatch.

The current mainnet pilot policy sets `F` to `200` sats (`0.00000200 sBTC`).
Applications should still read the live quote from the relayer instead of hardcoding it.

## Full Withdrawal

For balance `B` and sponsor fee `F`:

```text
recipient receives B - F
```

Show:

- available balance
- sponsor fee
- amount received
- STX required: 0

Warn that withdrawal to a public wallet may reveal linkage.

## Error Handling

Applications should distinguish:

- intent expired
- intent already used
- insufficient router deposit
- invalid announcement
- unsupported recipient
- malformed registry key
- relayer unavailable
- sponsor unavailable
- sponsor fee changed before confirmation
- sponsor fee policy rejected
- malformed announcement skipped
- backup not verified

## Privacy Messaging

Recommended wording:

> Privara routes this payment to a fresh one-time address so the recipient's long-term wallet is not exposed as the settlement destination.

## Wallet Security Disclosure

Recommended wording:

> Privara private balances are controlled by your Privara privacy seed, not by your connected wallet or hardware wallet. Keep your Privara backup secure.

## Independent Reproduction

An independently reproduced flow is stricter than ordinary external-wallet
participation. A non-team tester must use a fresh browser profile, follow the public
guide without Privara operating their session, restore-verify the encrypted backup,
register P/V, receive and scan a payment, and spend or withdraw from the detected
one-time address. Record transaction links and written feedback, never secrets.

See [reproducibility.md](./reproducibility.md) for the exact checklist and reference
transactions.
