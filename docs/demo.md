# Privara M2 Demo Guide

## Demo Goal

Show:

> A sender can pay a known Stacks user through Privara without exposing the recipient's long-term wallet as the onchain settlement destination.

## Recipient Setup

1. connect Leather/Xverse
2. generate independent privacy identity
3. export encrypted backup
4. successfully restore/verify backup
5. register public stealth keys
6. show private receiving enabled

Do not expose the privacy seed on video.

## Sender Flow

Show only the user-facing concepts:

```text
recipient normal Stacks address
asset
amount
```

Privara handles stealth derivation under the hood.

If router funding is needed, present it as payment authorization rather than a visible router-balance workflow.

## Payment Confirmation

Show:

- recipient
- amount
- 1% Privara settlement fee
- recipient receives

Then show wallet approval, SIP-018 payment authorization, relayer submission, and settlement confirmation.

## Onchain Evidence

Show that settlement goes to a fresh stealth principal rather than the recipient's normal wallet.

Normal wallet:

```text
Use the recipient wallet participating in the recorded demo.
```

Stealth destination:

```text
Use the fresh address shown in the scan result and settlement transaction.
```

## Recipient Scan

Show the recipient scanning public announcements locally and discovering the payment.

## Stealth Spend

Show either:

- partial spend
- full withdrawal

For full withdrawal, show privacy-linkage warning.

## Sponsored Fee UX

Before signing show:

- payment amount
- sponsor/service fee if applicable
- total deduction
- STX required from user: 0

The displayed sponsor quote must be the exact signed quote.

## DAO / Payout Flow

Show the DAO payout screen validating registered P/V keys row by row, enforcing the
connected-wallet balance, and preparing sequential fresh-address payments. For final
grant evidence, complete and record at least one mainnet payout-style flow.

Tx:

```text
Pending live DAO/payout transaction.
```

## Demo Narration

> Privara lets a sender pay a normal Stacks identity while settling the payment to a fresh one-time address controlled only by the recipient. The sender still knows who they are paying, amounts remain public, and the payer is not anonymous. The privacy improvement is that the recipient's long-term wallet is not exposed as the settlement destination.

## Final Video

```text
TODO
```
