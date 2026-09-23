# Privara integrator demo

A deliberately separate merchant-style checkout that consumes the published
`@privara-stacks/sdk@0.1.0` package. It does not import code from Privara's main React
application.

The demo covers one complete mainnet SIP-010 sender path:

1. fetch and validate the hosted relayer's public configuration
2. connect a Stacks wallet
3. resolve a Stacks address or BNS name
4. verify the recipient has registered Privara P/V keys
5. prepare an exact private payment and fresh one-time destination
6. fund only the missing router balance, when required
7. wait for funding confirmation
8. revalidate BNS and request the SIP-018 signature
9. submit the signed public envelope to the relayer

## Run

From the repository root:

```bash
npm install --prefix examples/integrator-demo
npm run demo:integrator
```

Open `http://localhost:5174`.

The Vite development proxy forwards `/privara-api` to Privara's hosted relayer. This is
only local convenience. A real deployed browser integration must either have its exact
origin added to the relayer allowlist or send requests through infrastructure it owns.

## What this intentionally exposes

- the SDK does not own wallet connection or approval UX
- the host must pin deployment principals and show exact consent details
- router funding can add a transaction and confirmation wait
- BNS ownership must be rechecked before signing
- pending, failure, retry, and uncertain-broadcast states belong in the host product

Recipient recovery and scanning are documented on Privara's `/developers` page but are
outside this small payer-side example.
