# Privara Mainnet Deployment Record

Status: contracts deployed and relayer configured; production acceptance pending

## Deployment Summary

Network:

```text
Stacks Mainnet
```

Deployer principal:

```text
SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE
```

## Required M2 Contracts

SIP-010 Trait:

```text
SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.sip010-ft-trait
tx: 0x90b1df8a600c1e5f50ba4f7cdb0a765622ac7129861fe57ee12a1f4acbd7ed74
```

M2 sBTC Router:

```text
SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-router-m2-sbtc
tx: 0xbf1cd24d6d34351538b81bdf17b33eebb85cf8a1dd27728d0833e90e9f431f95
```

Stealth Registry:

```text
SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-stealth-registry
tx: 0x07f086b0bdea659b22bd0c875535442c6bd76323db74fe98abef629a76c482f9
```

Sponsored Spend Helper:

```text
SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-sponsored-spend-v2
tx: 0xa78ee87585e1fdbf1ed35f36a04e7c970d6806729244080be7ffc19aea3f70eb
```

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
SP25K47CGNDNT2KYNS1WB10ZFFRQBY0KDSV11PNW9
```

Sponsor address:

```text
SP2EN3FBV0VY4SMYH0JXE3N6QE9ASAHGD2YNJRMXX
```

Fee recipient:

```text
SP2EN3FBV0VY4SMYH0JXE3N6QE9ASAHGD2YNJRMXX
```

## Live Services

Relayer URL:

```text
https://privara-production.up.railway.app
```

Demo app:

```text
https://privara-sbtc.vercel.app
```

## Fee Configuration

Settlement/relayer fee:

```text
1%
```

Sponsor service model:

```text
Paid in sBTC at the user-approved quoted amount; relayer pays the STX network fee
```

Exact sponsor service fee:

```text
1,200 sats (0.00001200 sBTC)
```

Maximum STX sponsor fee:

```text
10,000 micro-STX (0.01 STX)
```

## Deployment Verification

- [ ] mainnet build/config references no mock-token contract
- [ ] mainnet build/config references no testnet addresses
- [x] M2 domain correct
- [x] mainnet chain ID correct
- [x] sBTC contract correct
- [x] v2 sponsored-spend helper authoritative
- [x] sponsor address matches policy
- [x] fee recipient matches policy
- [x] HTTPS relayer live
- [ ] relayer wallet funded
- [ ] sponsor wallet funded with STX
- [ ] small-value mainnet settlement succeeded
- [ ] stealth scan succeeded
- [ ] sponsored spend succeeded
- [ ] full withdrawal succeeded

## Launch Gates

Mainnet deployment must not begin until all of these are true:

- [ ] independent contract/security review is complete and findings are resolved
- [x] `settings/Mainnet.toml` contains the intended mainnet deployer mnemonic locally
- [x] `PRIVARA_DEPLOYER_ADDRESS` matches the address derived from that mnemonic
- [x] deployer was funded with enough STX for all four deployments plus fee headroom
- [ ] relayer and sponsor mainnet wallets are funded with STX
- [x] treasury/fee-recipient address is selected and independently checked
- [x] atomic sBTC sponsor fee, maximum sponsored STX fee, and transaction limits are approved
- [x] Railway mainnet service has a persistent `/data` volume and secret variables
- [ ] the existing Vercel project has all production variables from `app/.env.mainnet.example`
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
