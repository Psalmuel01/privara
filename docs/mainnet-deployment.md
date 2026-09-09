# Privara Mainnet Deployment Record

Status: blocked by independent security review; no mainnet deployment attempted

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

## Contracts

M1 Router:

```text
TODO.privara-router
```

M2 Router:

```text
TODO.privara-router-m2
```

Stealth Registry:

```text
TODO.privara-stealth-registry
```

Sponsored Spend Helper:

```text
TODO.privara-sponsored-spend-v2
```

Relayer Registry:

```text
TODO.privara-registry
```

Add deployment tx IDs beside each before submission.

## Supported Asset

Primary asset:

```text
sBTC
```

Mainnet token contract:

```text
TODO
```

Token name:

```text
TODO
```

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
- [ ] M1 domain correct
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
