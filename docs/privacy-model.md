# Privacy Model

Privara's privacy claim is deliberately narrow: it hides the recipient's long-term wallet
from the on-chain settlement destination by paying a derived one-time address.

## What Privara v1 Improves

- derives a fresh settlement destination from the recipient's registered public keys
- lets the recipient discover and spend that output with an independent Privara seed
- avoids putting the recipient's long-term wallet in the settlement destination field

## What Remains Public

Normal SIP-010 settlement still exposes information onchain.

Public or recoverable from public data:

- settlement transaction
- asset
- amount
- one-time recipient address
- timing
- relayer address
- payer identity/activity; Privara makes no payer-anonymity claim
- API requests, IP/network metadata, and scanner access patterns
- links created when a one-time address later pays or withdraws to a known address

## What Privara v1 Does Not Claim

Privara v1 does not claim:

- hidden amounts
- payer anonymity
- network or API anonymity
- unlinkability after later spending or withdrawal
- fully trustless Tornado-style shielded pools
- complete timing privacy

## Key custody

Stealth funds are controlled by the independent Privara privacy seed. Leather, Xverse,
and connected hardware wallets do not hold, recover, or authorize with that seed. The
wallet registers public P/V keys and handles payer-side wallet operations only. Users
must export and successfully restore-verify the encrypted JSON before P/V registration.
