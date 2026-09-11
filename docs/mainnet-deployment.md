# Privara Mainnet Deployment Record

Status: contracts, services, and small-value end-to-end sBTC acceptance confirmed on mainnet

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

- [x] active production relayer config references no mock-token contract
- [x] active production relayer config references no testnet addresses
- [x] M2 domain correct
- [x] mainnet chain ID correct
- [x] sBTC contract correct
- [x] v2 sponsored-spend helper authoritative
- [x] sponsor address matches policy
- [x] fee recipient matches policy
- [x] HTTPS relayer live
- [x] relayer wallet funded
- [x] sponsor wallet funded with STX
- [x] small-value mainnet settlement succeeded
- [x] stealth scan succeeded
- [x] sponsored spend succeeded
- [x] full withdrawal succeeded

## Production Acceptance Gates

Contracts and services are deployed. The unchecked items below still gate a claim of
complete production acceptance:

- [x] attributable external technical review is recorded and reported blockers are resolved
- [ ] independent security audit is complete and findings are resolved
- [x] `settings/Mainnet.toml` contains the intended mainnet deployer mnemonic locally
- [x] `PRIVARA_DEPLOYER_ADDRESS` matches the address derived from that mnemonic
- [x] deployer was funded with enough STX for all four deployments plus fee headroom
- [x] relayer and sponsor mainnet wallets are funded with STX
- [x] treasury/fee-recipient address is selected and independently checked
- [x] atomic sBTC sponsor fee, maximum sponsored STX fee, and transaction limits are approved
- [x] Railway mainnet service has a persistent `/data` volume and secret variables
- [x] the existing Vercel project has all production variables from `app/.env.mainnet.example`
- [x] small real-sBTC amounts were used for two-wallet mainnet acceptance

## Confirmed Mainnet Acceptance

Two private settlements have confirmed through the production relayer. The second was
detected in the production application and fully withdrawn through the sponsored-spend
helper.

| Action | Account or result | Confirmed transaction |
| --- | --- | --- |
| Recipient 1 P/V registration | `SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE` | [f0680666…f3fc](https://explorer.hiro.so/txid/0xf0680666bf6435fa98c42177e174940f8c9a3c62ae697ce544e9b8a92891f3fc?chain=mainnet) |
| First sender router deposit | 657 sats from `SPXB1Y…P3K8V` | [63be0570…1104](https://explorer.hiro.so/txid/0x63be0570ac290285534c005887cca542d87bd4a0870f08b4667a01532a5e1104?chain=mainnet) |
| First private settlement | 650 sats to `SP3RWH…VBD1S`; 7-sat fee | [fe5e5184…ca10](https://explorer.hiro.so/txid/0xfe5e518482c218ccd2f526909eb11e9a77647219aff339084b2b8d9c4f9eca10?chain=mainnet) |
| Recipient 2 P/V registration | `SPXB1YYJ4253QA0N20F12ZEQVX02HN7QRZPP3K8V` | [678d4d7a…6e56](https://explorer.hiro.so/txid/0x678d4d7a5d72046be0590f0cd4142def0641400eeac528b401bf45cd5aef6e56?chain=mainnet) |
| Second sender router deposit | 6,462 sats from `SP1H7G…K7AE` | [4a0facb0…3bb7](https://explorer.hiro.so/txid/0x4a0facb05c34a1c1c79515b1b799f82ba4c9fa84eb8afe18afe9b6ecaf233bb7?chain=mainnet) |
| Second private settlement | 6,398 sats to `SP2K34…NZ0Q1`; 64-sat fee | [39ebb986…c5f3](https://explorer.hiro.so/txid/0x39ebb9869d9e04977541b3f0c81ff810efb418544a8df2da525f9becfd67c5f3?chain=mainnet) |
| Full sponsored withdrawal | 5,198 sats to `SP13J1…WK3ZJ`; 1,200-sat sponsor fee | [ed0c361c…3b53](https://explorer.hiro.so/txid/0xed0c361c7959acac3e1fceb9fc52816cbd2749a6ffb2f04a490b378ac1ca3b53?chain=mainnet) |

The full withdrawal originated from `SP2K341QTGZ5JJ87FA1SDK1C38KSRJDV3X6ANZ0Q1`,
which held zero STX. The sponsor `SP2EN3…JRMXX` paid the 474-micro-STX network fee.

## Subsequent Mainnet Adoption Evidence

The following confirmed transactions bring the recorded total to five settlements
across four participating wallets, including two non-team wallets and one
contributor-payout flow:

| Evidence | Confirmed transaction |
| --- | --- |
| Contributor payout funding | [11edfac9…8ee1](https://explorer.hiro.so/txid/0x11edfac9b7dd5bf27ee5cec41fa0a9e208975e1fc477b466185b55db12e68ee1?chain=mainnet) |
| Contributor payout · recipient 1 | [ea6a3a85…cd5a](https://explorer.hiro.so/txid/0xea6a3a858cf3f456ce6a9127431c6fd2876368290fbfb3b4082ff1c735e6cd5a?chain=mainnet) |
| Contributor payout · recipient 2 | [2caa9b9e…102c](https://explorer.hiro.so/txid/0x2caa9b9ed0d3e9cd5539c0a62c1a9d0a3ec71969426dc699049930da8d96102c?chain=mainnet) |
| Non-team recipient registration | [ac62517c…46c2](https://explorer.hiro.so/txid/0xac62517c03a1e9092d5f292ddc30bba134a826570545216bffcbb8bf279446c2?chain=mainnet) |
| Non-team sender funding | [25056a1c…18b4](https://explorer.hiro.so/txid/0x25056a1cbe24e7ba79935f4ddc949be23ba3096df3bfa6921afed47884e518b4?chain=mainnet) |
| Non-team private settlement | [d7e06b67…bcf2](https://explorer.hiro.so/txid/0xd7e06b676fbd936d96f61fbadd7f9c490f0339fba1788901e6bd905e4a2bbcf2?chain=mainnet) |

See [usage-metrics.md](./usage-metrics.md) for the complete target ledger.

## Confirmed Mainnet Accounts

| Address | Role | Explorer-verified state after the recorded flow |
| --- | --- | --- |
| `SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE` | Deployer, sender, registered recipient | 0.740115 STX; 3,538 sats |
| `SPXB1YYJ4253QA0N20F12ZEQVX02HN7QRZPP3K8V` | Sender and registered recipient | 0.692348 STX; 1,343 sats |
| `SP25K47CGNDNT2KYNS1WB10ZFFRQBY0KDSV11PNW9` | Relayer | 0.998802 STX; 71 sats in settlement fees |
| `SP2EN3FBV0VY4SMYH0JXE3N6QE9ASAHGD2YNJRMXX` | Sponsor and fee recipient | 0.999526 STX; 1,200 sats in sponsor fees |
| `SP3RWHTD1VZQKTRSHNYGKX63PC63GMR0EXQXVBD1S` | First one-time address | 0 STX; 650 sats unspent |
| `SP2K341QTGZ5JJ87FA1SDK1C38KSRJDV3X6ANZ0Q1` | Second one-time address | 0 STX; 0 sats after full withdrawal |

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

- An independent security audit has not been completed. The recorded Leather Support
  feedback is external technical review, not an audit or mainnet signoff.
- The remaining grant adoption targets are 20 additional successful intents, one
  additional distinct wallet, a public write-up, and one independent reproduction.
- The sponsor-fee policy has passed the recorded small-value flow but still needs
  monitoring against observed mainnet STX fees before larger-value use.
