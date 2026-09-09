# Privara Known Limitations

## Amounts Are Public
Privara does not provide confidential amounts.

## Payer Is Recoverable
The payer can be recovered from the signed intent. Privara does not provide payer anonymity.

## Sender Knows Recipient
The sender begins with the recipient's normal Stacks address.

## Recipient Privacy Is Address Unlinkability
The primary M2 privacy property is that the recipient's long-term wallet is not exposed as the onchain settlement destination.

## API Metadata Is Not Hidden
Registry lookups, relayer requests, and chain API access can expose IP, timing, queried principal, and session metadata.

## Withdrawals Can Reveal Identity
A direct withdrawal from a stealth address to a known public wallet may reveal linkage.

## Spending Graphs Remain Public
A stealth address is still a public Stacks account.

## Different Amounts Are Only a Heuristic
Partial spending may reduce simple equality matching but is not cryptographic privacy.

## Hardware Wallet Protection Does Not Extend Automatically
Privara stealth balances are controlled by the Privara privacy seed, not automatically by a connected hardware wallet.

## Privacy Seed Loss Can Lose Funds
Private receiving should remain disabled until backup and restore are verified.

## Relayer Can Censor
The relayer can refuse or delay settlement.

## Sponsor Can Censor
The sponsor can refuse to pay STX. The user can fund the stealth address with STX and spend independently.

## Current Indexing Uses Public Chain Infrastructure
The reference scanner relies on Stacks/Hiro contract-log APIs.

## No ZK Shielded Pool
Privara M2 does not implement hidden balances, ZK withdrawal proofs, or trustless shielded-pool semantics.

## Router Deposit Is Public
The sender's router deposit transaction is public even if the UI hides router mechanics.

## Mainnet Risk
External ecosystem review should not be treated as a formal audit.
