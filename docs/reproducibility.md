# Reproducing a Privara Flow

Status: independently reproduced on mainnet by a non-team tester

## Prerequisites

- a recipient wallet and a separate sender wallet
- enough STX for recipient registration and sender approvals
- a small amount of real mainnet sBTC
- a fresh browser profile or private session for the recipient recovery test
- the live Privara app and public documentation only

Repository:

```text
https://github.com/Psalmuel01/privara
```

Live production app:

```text
https://privara-sbtc.vercel.app
```

Live production relayer:

```text
https://privara-production.up.railway.app
```

## Recipient Setup

1. Open Privara.
2. Connect recipient wallet.
3. Generate Privara privacy identity.
4. Export encrypted backup.
5. Successfully restore/verify backup.
6. Register public stealth keys.
7. Confirm private receiving is enabled.

The tester—not the Privara operator—must retain the encrypted backup and password. Never
send the backup password, privacy seed, spending key, viewing key, or one-time private key
to Privara or include it in evidence.

Registration tx:

```text
Record the independent tester's transaction ID. Reference testnet acceptance:
e1a782c7722defcb773377d393483d480f0d9734a0d84d13ff698ab1d649447a
```

## Sender Payment

1. Connect sender wallet.
2. Enter recipient's normal Stacks address.
3. Select supported asset.
4. Enter small amount.
5. Confirm private receiving is detected.
6. Review amount and settlement fee.
7. Approve any just-in-time router funding.
8. Sign SIP-018 payment intent.
9. Submit through relayer.
10. Wait for confirmation.

Settlement tx:

```text
Record the independent tester's transaction ID. Reference testnet acceptance:
d0c86135e63072085457535125d083e4fc1efd29f5cecf97ab946ba7ebf3e854
```

## Recipient Scan

1. Unlock Privara privacy identity.
2. Scan for private payments.
3. Confirm received payment appears.
4. Confirm settlement destination is a fresh stealth principal.

## Sponsored Spend

1. Choose the private balance.
2. Enter destination.
3. Review exact sponsor quote.
4. Confirm quote.
5. Sign origin transaction.
6. Sponsor pays STX and broadcasts.
7. Wait for confirmation.

Sponsored spend tx:

```text
Record the independent tester's transaction ID. Reference testnet acceptance:
89ab391f7b8e22cfd7d2ae0656a3b60ff5df6a788df1a48fc73471134b454bb9
```

The reference sBTC flow is evidence that the implementation works on testnet; it is not
the required independent reproduction or mainnet usage evidence. Replace the tester
fields below only after another person completes the flow.

## Reference Mainnet Acceptance

Privara's project acceptance run confirmed two production settlements and one full
sponsored withdrawal. This is implementation evidence, not an independent reproduction:

- settlement 1: `fe5e518482c218ccd2f526909eb11e9a77647219aff339084b2b8d9c4f9eca10`
- settlement 2: `39ebb9869d9e04977541b3f0c81ff810efb418544a8df2da525f9becfd67c5f3`
- sponsored withdrawal: `ed0c361c7959acac3e1fceb9fc52816cbd2749a6ffb2f04a490b378ac1ca3b53`

The second flow settled 6,398 sats to a fresh address and withdrew the full balance as
5,198 sats to the chosen destination plus the approved 1,200-sat sponsor fee. The stealth
origin held zero STX; the sponsor paid the 474-micro-STX network fee.

## Independent Mainnet Reproduction

A second non-team sender/recipient pair completed this publicly verifiable sequence:

- recipient registration: `61c8f4d103bd6f16c55f05ec4e7d68866c0856c8167423b034a56269bbc87586`
- funding and settlement 1: `0ccb8984f2411ba3d3f7b5846fe39c6c1a4b8e778518178fd6e332340e7ac003` · `439e5bbc150494c94aa5df1baa952ca07d198261a3d40c19edc63c5666ff1d4e`
- funding and settlement 2: `c5a3dd22eb5f096a79423990f050a5ba18102e95e3da23bc96377a9c558e426a` · `63f0d501618a4a041fc9d09e9c027ace81de49924bb0e9227caa108e9f4bd713`
- full withdrawals: `b2be50fc8b279e97ac2533aaedbac9fd79b4d9002b63b54fe9b99d5daf67cddc` · `c56d4629fbe556021dc5c1e4eac19d53c02d3cf463f7df638d5fdd2078b3e6fe`

Both one-time origins now hold zero sBTC. The non-team tester also confirmed in writing
that they restored the encrypted backup in a fresh browser/session, scanned locally,
followed the public guide themselves, and completed the withdrawal. Privara retains that
confirmation privately; no secret recovery material is included in this evidence.

## Verification

- [x] backup export worked
- [x] fresh restore worked
- [x] keys registered
- [x] sender paid normal recipient identity
- [x] settlement landed at fresh stealth address
- [x] recipient discovered payment locally
- [x] recipient derived spend authority
- [x] sponsored spend worked with 0 STX at stealth address
- [x] amount remained public
- [x] recipient public wallet was not the settlement destination

The reproduction is complete only when the same non-team tester performs the recovery,
scan, and spend or withdrawal. Merely supplying two external wallet addresses, receiving
a payment, or having the Privara operator complete the browser steps does not qualify.

Record only public transaction links, the browser/wallet environment, the documentation
followed, any failures encountered, and the tester's written outcome. Screenshots must
exclude secrets and may abbreviate public addresses for readability.

## Tester Evidence

Tester:

```text
Anonymous non-team tester; written confirmation retained privately by Privara
```

Affiliation:

```text
Non-team tester
```

Date:

```text
11 September 2026
```

Written feedback:

```text
Confirmed fresh-browser/session backup restore, local scanning, independent use of the
public guide, and completion of the sponsored withdrawal.
```
