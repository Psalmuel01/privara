# Privara documentation

This directory is the canonical documentation set for the Privara protocol, its mainnet
deployment, testnet acceptance evidence, and the Milestone 2 grant submission. Start with the protocol
and architecture documents for design context, then use the developer and deployment
guides to run the system.

## Protocol and security

- [M1 protocol specification](./protocol-spec.md) — signed intents, unordered nonces,
  router authorization, and the original settlement model.
- [M2 stealth settlement specification](./m2-stealth-spec.md) — privacy identity,
  one-time destinations, announcements, scanning, and sponsored spending.
- [Architecture](./architecture.md) — deployed components and end-to-end data flow.
- [Privacy model](./privacy-model.md) and [known limitations](./known-limitations.md) —
  the exact privacy guarantee and explicit non-goals.
- [Sponsorship](./sponsorship.md) — settlement fee, token sponsor-service fee, and STX
  network fee.
- [Security and threat model](./security-threat-model.md) — trust boundaries, attacks,
  mitigations, and the remaining independent-review gate.

## Build, operate, and reproduce

- [Developer guide](./developer-guide.md) — integration flow and safe client behavior.
- [Relayer API](./relayer-api.md) — implemented HTTP endpoints and validation policy.
- [Deployments](./deployments.md) — confirmed testnet addresses, transaction IDs, and
  Railway/Vercel setup.
- [Mainnet deployment record](./mainnet-deployment.md) — deployed contracts, live-service
  configuration, confirmed sBTC acceptance transactions, and remaining production gates.
- [Demo guide](./demo.md) and [reproduction guide](./reproducibility.md) — proven testnet
  procedure and independent mainnet acceptance procedure.

## Grant evidence

- [Usage metrics](./usage-metrics.md) — the tracked evidence record for the grant's
  mainnet adoption targets.
- [Milestones](./milestones.md) — the original grant commitments and adoption targets.

Internal acceptance checklists, submission packaging, reviewer notes, publication drafts,
and the final grant report remain local and gitignored. Samuel Dahunsi will submit the
final report independently after incorporating confirmed evidence.

The milestone execution plans also remain local and gitignored. They are not submission
evidence. The authoritative public completion record is the final report plus concrete
links in `deployments.md`.
