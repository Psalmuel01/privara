# Reproducing a Privara Flow

Status: testnet procedure available; independent mainnet evidence pending

## Prerequisites

- Leather or Xverse
- small amount of testnet sBTC for rehearsal, or mainnet sBTC after production deployment
- modern browser
- live Privara app

Repository:

```text
https://github.com/Psalmuel01/privara
```

Live testnet app:

```text
https://privara-sbtc.vercel.app
```

Live testnet relayer:

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
