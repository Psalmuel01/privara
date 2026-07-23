# Relayer

Reference relayer service for Privara. Not yet implemented — this is the M2 deliverable.

Planned responsibilities:

- accept signed-intent JSON envelopes from users (via API or direct submission)
- validate intent structure, signature, nonce, and expiry before broadcasting
- submit `settle-intent` transactions to Stacks testnet/mainnet
- track execution status and surface explorer links
- expose simple REST or WebSocket APIs for wallets, SDK clients, and demo apps

For M1, the relayer role is played manually by the `scripts/settle.ts` demo script:
a relayer key holder reads a signed-intent JSON file and broadcasts the settlement.
See [scripts/README.md](../scripts/README.md) for the full M1 demo flow.
