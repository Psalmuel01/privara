# Demo App

Demo application workspace for Privara. Not yet implemented — this is the M2 deliverable.

Planned flows:

- wallet-to-wallet SIP-010 intent creation and signing
- relayer-submitted settlement with status tracking
- fresh-address recipient routing
- simulated DAO payout flow
- transaction explorer integration

The sponsored-spend screen must show the available balance, destination payment, fixed
token sponsor fee, total token deduction, and `STX required from you: 0` before local
signing. Full withdrawal displays `amount received = balance - sponsor fee` and warns:

> Withdrawing directly to your public wallet may publicly link this stealth payment to
> that wallet.

Sponsorship removes the need for STX at the one-time address; it does not hide the
on-chain transfer or destination.

For M1, the end-to-end flow is demonstrated via the CLI scripts in `scripts/`.
See [scripts/README.md](../scripts/README.md).
