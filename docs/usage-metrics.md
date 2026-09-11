# Privara M2 Usage Metrics

Status: Mainnet evidence updated; unverified outcomes are not counted

| Metric | Required | Current | Evidence |
|---|---:|---:|---|
| Successful end-to-end mainnet intents processed by relayer | 25 | 5 | Five confirmed settlements listed below |
| Distinct mainnet wallets participating | 5 | 4 | Two team wallets and two non-team wallets |
| Non-team wallets completing mainnet intent flow | 2 | 2 | External registration, funding, and settlement confirmed |
| DAO-style or payout-style mainnet flow | 1 | 1 | Two-recipient contributor payout confirmed |
| External written review | 1 | 1 | `werner.btc`, Leather Support; correspondence retained by Privara and summarized below |
| Public Stacks forum post or equivalent | 1 | Pending | Not yet published |
| Independently reproducible mainnet flow | 1 | Pending | Requires a non-team tester to complete recovery through withdrawal |

## Mainnet Intent Log

| # | Participants | Public evidence | Status |
|---:|---|---|---|
| 1 | Team · Wallet B → Wallet A | [Settlement](https://explorer.hiro.so/txid/0xfe5e518482c218ccd2f526909eb11e9a77647219aff339084b2b8d9c4f9eca10?chain=mainnet) | Confirmed |
| 2 | Team · Wallet A → Wallet B | [Settlement](https://explorer.hiro.so/txid/0x39ebb9869d9e04977541b3f0c81ff810efb418544a8df2da525f9becfd67c5f3?chain=mainnet) · [Withdrawal](https://explorer.hiro.so/txid/0xed0c361c7959acac3e1fceb9fc52816cbd2749a6ffb2f04a490b378ac1ca3b53?chain=mainnet) | Confirmed and withdrawn |
| 3 | Contributor payout · recipient 1 | [Settlement](https://explorer.hiro.so/txid/0xea6a3a858cf3f456ce6a9127431c6fd2876368290fbfb3b4082ff1c735e6cd5a?chain=mainnet) | Confirmed |
| 4 | Contributor payout · recipient 2 | [Settlement](https://explorer.hiro.so/txid/0x2caa9b9ed0d3e9cd5539c0a62c1a9d0a3ec71969426dc699049930da8d96102c?chain=mainnet) | Confirmed |
| 5 | Non-team · Wallet C → Wallet D | [Registration](https://explorer.hiro.so/txid/0xac62517c03a1e9092d5f292ddc30bba134a826570545216bffcbb8bf279446c2?chain=mainnet) · [Funding](https://explorer.hiro.so/txid/0x25056a1cbe24e7ba79935f4ddc949be23ba3096df3bfa6921afed47884e518b4?chain=mainnet) · [Settlement](https://explorer.hiro.so/txid/0xd7e06b676fbd936d96f61fbadd7f9c490f0339fba1788901e6bd905e4a2bbcf2?chain=mainnet) | Confirmed |

Continue through at least 25.

## Distinct Wallets

| Label | Team / non-team | Role | Evidence |
|---|---|---|---|
| `SP1H7G…K7AE` | team | deployer, sender, registered recipient | Mainnet registration and second settlement |
| `SPXB1Y…P3K8V` | team | sender, registered recipient | First settlement and second registration |
| `SP1G1G7…R7KPQ` | non-team | sender | Router funding and private settlement |
| `SP2JS7G…6PJT3` | non-team | registered recipient | Registration and settlement to a fresh one-time address |
| Wallet E | pending | needed for five-wallet target | Not yet verified |

## DAO / Payout Flow

One funding approval supplied 1,010 sats for two independently signed contributor
payments. Each registered contributor received 500 sats at a fresh one-time address.

- [Router funding](https://explorer.hiro.so/txid/0x11edfac9b7dd5bf27ee5cec41fa0a9e208975e1fc477b466185b55db12e68ee1?chain=mainnet)
- [Recipient 1 settlement](https://explorer.hiro.so/txid/0xea6a3a858cf3f456ce6a9127431c6fd2876368290fbfb3b4082ff1c735e6cd5a?chain=mainnet)
- [Recipient 2 settlement](https://explorer.hiro.so/txid/0x2caa9b9ed0d3e9cd5539c0a62c1a9d0a3ec71969426dc699049930da8d96102c?chain=mainnet)

## External Review

`werner.btc` of Leather Support provided written technical feedback on wallet-signing
assumptions, sponsor-fee approval binding, backup verification, malformed-announcement
resilience, key custody disclosures, and privacy claims. The findings were addressed and
regression-tested. This is not a formal audit, Leather endorsement, or mainnet signoff.

## Independent Reproduction

Pending. A non-team tester must follow the public guide in a fresh browser and complete
backup restore, registration, receipt, local scan, and spend or withdrawal.

## Public Write-Up

Pending publication.

## Demo Video

[Privara M2 Demo](https://drive.google.com/file/d/17Tq3e_0SUm_DSFVITSTOqzao2hp4otop/view)
