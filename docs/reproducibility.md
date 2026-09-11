# Reproducing a Privara Flow

Status: public mainnet procedure available; independent non-team evidence pending

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

## Verification

- [ ] backup export worked
- [ ] fresh restore worked
- [ ] keys registered
- [ ] sender paid normal recipient identity
- [ ] settlement landed at fresh stealth address
- [ ] recipient discovered payment locally
- [ ] recipient derived spend authority
- [ ] sponsored spend worked with 0 STX at stealth address
- [ ] amount remained public
- [ ] recipient public wallet was not the settlement destination

The reproduction is complete only when the same non-team tester performs the recovery,
scan, and spend or withdrawal. Merely supplying two external wallet addresses, receiving
a payment, or having the Privara operator complete the browser steps does not qualify.

Record only public transaction links, the browser/wallet environment, the documentation
followed, any failures encountered, and the tester's written outcome. Screenshots must
exclude secrets and may abbreviate public addresses for readability.

## Tester Evidence

Tester:

```text
TODO
```

Affiliation:

```text
TODO
```

Date:

```text
TODO
```

Written feedback:

```text
TODO
```
