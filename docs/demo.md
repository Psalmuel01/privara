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

Pay the intended person or merchant directly from the one-time address when possible.
For full movement, use a fresh self-custody Stacks address and explain that it provides
wallet or operational separation rather than a privacy reset: the transfer remains
publicly traceable and can merely add another observable hop. Show **Convert to BTC** as
coming soon. The demo must not imply that a Bitcoin `bc1` address is currently accepted
or that Privara currently performs the official sBTC peg-out.

## Sponsored Fee UX

Before signing show:

- payment amount
- sponsor/service fee if applicable
- total deduction
- STX required from user: 0

The displayed sponsor quote must be the exact signed quote.

## DAO / Payout Flow

The recorded mainnet contributor-payout flow validated both recipients independently,
funded 1,010 sats once, and completed two independently signed 505-sat intents:

- [router funding](https://explorer.hiro.so/txid/0x11edfac9b7dd5bf27ee5cec41fa0a9e208975e1fc477b466185b55db12e68ee1?chain=mainnet)
- [recipient 1 settlement](https://explorer.hiro.so/txid/0xea6a3a858cf3f456ce6a9127431c6fd2876368290fbfb3b4082ff1c735e6cd5a?chain=mainnet)
- [recipient 2 settlement](https://explorer.hiro.so/txid/0x2caa9b9ed0d3e9cd5539c0a62c1a9d0a3ec71969426dc699049930da8d96102c?chain=mainnet)

## Demo Narration

> Privara lets a sender pay a normal Stacks identity while settling the payment to a fresh one-time address controlled only by the recipient. The sender still knows who they are paying, amounts remain public, and the payer is not anonymous. The privacy improvement is that the recipient's long-term wallet is not exposed as the settlement destination.

## Final Video

[Watch the Privara M2 demo](https://drive.google.com/file/d/17Tq3e_0SUm_DSFVITSTOqzao2hp4otop/view)
