# Privara Mainnet Deployment Record

Status: mainnet preflight prepared; no mainnet transaction broadcast

Do not replace TODO fields with guessed values.

## Deployment Summary

Network:

```text
Stacks Mainnet
```

Deployment date:

```text
TODO
```

Deployer principal:

```text
TODO
```

## Required M2 Contracts

SIP-010 Trait:

```text
TODO.sip010-ft-trait
```

M2 sBTC Router:

```text
TODO.privara-router-m2-sbtc
```

Stealth Registry:

```text
TODO.privara-stealth-registry
```

Sponsored Spend Helper:

```text
TODO.privara-sponsored-spend-v2
```

Add deployment tx IDs beside each before submission.

The M1 router and old relayer registry are not required for the M2 mainnet flow. Do
not deploy them merely to mirror testnet history.

## Supported Asset

Primary asset:

```text
sBTC
```

Mainnet token contract:

```text
SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
```

Token name:

```text
sbtc-token
```

Source of truth: [Stacks sBTC Clarity contracts](https://docs.stacks.co/learn/sbtc/clarity-contracts).

## Operational Addresses

Relayer address:

```text
TODO
```

Sponsor address:

```text
TODO
```

Fee recipient:

```text
TODO
```

## Live Services

Relayer URL:

```text
TODO
```

Demo app:

```text
TODO
```

## Fee Configuration

Settlement/relayer fee:

```text
1%
```

Sponsor service model:

```text
Paid in sBTC; exact mainnet atomic fee TODO after operating-cost review
```

Exact sponsor service fee:

```text
TODO
```

Maximum STX sponsor fee:

```text
TODO
```

## Deployment Verification

- [ ] mainnet build/config references no mock-token contract
- [ ] mainnet build/config references no testnet addresses
- [ ] M2 domain correct
- [ ] mainnet chain ID correct
- [ ] sBTC contract correct
- [ ] v2 sponsored-spend helper authoritative
- [ ] sponsor address matches policy
- [ ] fee recipient matches policy
- [ ] HTTPS relayer live
- [ ] relayer wallet funded
- [ ] sponsor wallet funded with STX
- [ ] small-value mainnet settlement succeeded
- [ ] stealth scan succeeded
- [ ] sponsored spend succeeded
- [ ] full withdrawal succeeded

## Launch Gates

Mainnet deployment must not begin until all of these are true:

- [ ] independent contract/security review is complete and findings are resolved
- [ ] `settings/Mainnet.toml` contains the intended mainnet deployer mnemonic locally
- [ ] `PRIVARA_DEPLOYER_ADDRESS` matches the address derived from that mnemonic
- [ ] deployer is funded with enough STX for all four deployments plus fee headroom
- [ ] a dedicated relayer/sponsor mainnet wallet is created and funded with STX
- [ ] treasury/fee-recipient address is selected and independently checked
- [ ] atomic sBTC sponsor fee, maximum sponsored STX fee, and transaction limits are approved
- [ ] Railway mainnet service has a persistent `/data` volume and secret variables
- [ ] a separate Vercel mainnet project has the public variables in `app/.env.mainnet.example`
- [ ] a small amount of real sBTC is reserved for the two-wallet acceptance test

## Preflight and Deployment Commands

Never paste a mnemonic or private key into chat, shell history, documentation, or a
Vercel public environment variable. Put the deployer mnemonic only in the gitignored
`settings/Mainnet.toml`, based on `settings/Mainnet.toml.example`.

After saving the mnemonic locally, derive only its public account-0 address, compare it
with the address shown by the source wallet, then set it as the required guard:

```bash
MAINNET_DEPLOYER=$(npm run --silent mainnet:deployer-address)
echo "$MAINNET_DEPLOYER"
export PRIVARA_DEPLOYER_ADDRESS="$MAINNET_DEPLOYER"
```

Inspect every dry run:

```bash
DRY_RUN=1 npm run deploy:sip010-trait:mainnet
DRY_RUN=1 npm run deploy:stealth-registry:mainnet
DRY_RUN=1 npm run deploy:router-m2-sbtc:mainnet
DRY_RUN=1 npm run deploy:sponsored-spend:mainnet
```

Each dry run checks the derived address, live nonce, balance, contract-name
availability, transaction construction, serialization, network, and asset binding.
Re-run immediately before each broadcast because the account nonce may have changed.

After review, broadcast one contract at a time in dependency order. Wait for each to
confirm before continuing:

```bash
export PRIVARA_MAINNET_CONFIRM=DEPLOY_PRIVARA_MAINNET

npm run deploy:sip010-trait:mainnet
npm run deploy:stealth-registry:mainnet
npm run deploy:router-m2-sbtc:mainnet
npm run deploy:sponsored-spend:mainnet

unset PRIVARA_MAINNET_CONFIRM
```

If an estimated fee needs adjustment, set `PRIVARA_DEPLOYMENT_FEE` to the reviewed
micro-STX amount for that one invocation. Never rerun blindly after an ambiguous
response: first check the explorer and contract interface for the prior transaction.

## Service Cutover

1. Deploy a new Railway mainnet service from `Dockerfile.relayer`; do not repurpose
   the testnet service or its persistent idempotency store.
2. Apply `relayer/.env.mainnet.example`, replacing every placeholder. Store private
   keys only as Railway secrets and mount a persistent volume at `/data`.
3. Confirm `/health` and `/v1/config`. The returned network, registry, router, asset,
   spend contract, relayer address, and fee policy must match this record.
4. Deploy a separate Vercel mainnet app using `app/.env.mainnet.example`. Replace the
   deployer and relayer placeholders; all `VITE_` values are public by design.
5. Complete a two-wallet, minimum-value flow: backup export and restore verification,
   registration, private payment, scan, partial sponsored spend, and full withdrawal.
6. Record every contract and acceptance transaction ID here before announcing launch.

## Current Blockers

- The local `settings/Mainnet.toml` still contains a placeholder mnemonic.
- No mainnet deployer address or funding has been verified.
- No independent security review result is recorded in this repository.
- Production relayer/sponsor and treasury addresses are not selected.
- Mainnet fee caps and the exact atomic sBTC sponsor fee are not approved.
- No real-sBTC two-wallet acceptance test has been completed.
