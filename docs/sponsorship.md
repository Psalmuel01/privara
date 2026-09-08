# M2 stealth-spend sponsorship

Privara uses Stacks sponsored transactions so a one-time stealth address can move a
supported SIP-010 asset without holding STX. The recipient signs the complete origin
transaction locally. The Privara sponsor validates it, adds the sponsor authorization,
pays the Stacks network fee in STX, and broadcasts it. Private keys and the privacy seed
never leave the client.

## Three separate costs

| Cost | Paid by | Paid when | Asset |
| --- | --- | --- | --- |
| Settlement fee | Original sender | Initial intent settlement | Settled SIP-010 token |
| Sponsor service fee | Stealth recipient | Sponsored stealth spend | Spent SIP-010 token |
| Stacks network fee | Privara sponsor wallet | Sponsored broadcast | STX |

The settlement fee remains the router's existing signed fee, capped at 1%. The sponsor
service fee is a configurable fixed number of atomic token units. It is not a conversion
of the live STX network fee. The reference MOCK policy defaults to `100` atomic units and
can be changed with `PRIVARA_TOKEN_SPONSOR_FEE`.

For a partial payment, the stealth balance decreases by `payment + sponsor service fee`.
For full withdrawal, the destination receives `balance - sponsor service fee`. A balance
that does not exceed the service fee cannot be sponsored.

## Signed and on-chain fields

The origin-signed `privara-sponsored-spend-v2::sponsored-spend` call commits to the token,
payment destination, payment amount, fee treasury, exact token fee, and expected Stacks
sponsor. An exact-total fungible-token post-condition in deny mode limits the origin's
token outflow to `payment + fee`. The helper transfers both amounts atomically and never
takes custody. If either transfer fails, both are rolled back.

The contract call, both token transfers, one-time origin, destinations, amounts, expected
sponsor, actual sponsor, and transaction fee are public on-chain. The relayer accepts only
the configured v2 helper, asset, token name, treasury, exact fee, and sponsor. It verifies
the origin signature and confirmed Privara M2 announcement, caps payment size and STX fee,
rate-limits each origin, serializes sponsor signing to avoid local nonce collisions, and
stores accepted request hashes across restarts.

The file store and in-process rate limit are appropriate for the single-instance M2 demo.
A multi-replica service still needs a shared transactional store, distributed nonce
coordination, authentication and abuse controls, finality tracking, and operational
monitoring.

## Privacy behavior

Sponsorship solves fee funding, not transaction visibility. Transfers from the one-time
address remain public. Withdrawing directly to a known wallet can publicly associate that
wallet with the stealth payment. Different amounts or unrelated fresh destinations may
reduce simple correlation but are heuristics, not cryptographic privacy guarantees.

The UI must show the sponsor fee and total deduction before the recipient signs, state
that the user needs `0 STX`, and show the public-wallet linkage warning for withdrawals.
It fetches one quote for the confirmation screen and signs that exact fee, fee recipient,
destination, and amount. Submission never refreshes the quote. If server policy changes
in the meantime, the relayer rejects the old signed transaction and the user must request
and approve a new quote.

The one-time spending key comes from the independent Privara privacy seed. Leather,
Xverse, and connected hardware wallets cannot recover or control stealth funds.
