import { beforeEach, describe, expect, it } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";
import { bytesToHex, hexToBytes } from "@stacks/common";

import {
  createIntent,
  signIntent,
  buildSettlementArgs,
  hashIntent,
  domainHash,
  messageDigest,
  type Intent,
  type SignedIntent,
} from "../sdk/src";

// simnet is available globally via vitest-environment-clarinet
declare const simnet: import("@stacks/clarinet-sdk").Simnet;

// Clarinet's documented wallet_1 key; simnet reports the testnet chain-id.
const USER_KEY =
  "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801";
const NETWORK = "testnet" as const;

const normHex = (s: string) => s.replace(/^0x/, "");
const accounts = () => simnet.getAccounts();
const deployer = () => simnet.deployer;
const mockToken = () => `${deployer()}.mock-token`;
const recipient = () => accounts().get("wallet_2")!;
const relayer = () => accounts().get("wallet_3")!;

// A realistic intent, built through the SDK's own constructor.
function baseIntent(): Intent {
  return createIntent({
    asset: mockToken(),
    amount: 100_000n,
    recipient: recipient(),
    relayer: relayer(),
    relayerFee: 1_000n,
    nonce: 0n,
    expiry: 1000n,
  });
}

// Positional settle-intent args from a SignedIntent, matching the contract signature.
function settleArgs(si: SignedIntent) {
  const a = buildSettlementArgs(si);
  return [
    Cl.principal(a.asset),
    Cl.uint(a.amount),
    Cl.principal(a.recipient),
    Cl.principal(a.relayer),
    Cl.uint(a.relayerFee),
    Cl.uint(a.nonce),
    Cl.uint(a.expiry),
    Cl.principal(a.user),
    Cl.buffer(a.userSig),
  ];
}

function mint(to: string, amount: bigint) {
  simnet.callPublicFn("mock-token", "mint", [Cl.uint(amount), Cl.principal(to)], deployer());
}

function deposit(from: string, amount: bigint) {
  simnet.callPublicFn(
    "privara-router",
    "deposit",
    [Cl.principal(mockToken()), Cl.uint(amount)],
    from
  );
}

describe("SDK <-> contract parity", () => {
  it("SDK hashIntent equals the contract's hash-intent", () => {
    const i = baseIntent();
    const { result } = simnet.callReadOnlyFn(
      "privara-router",
      "hash-intent",
      [
        Cl.principal(i.asset),
        Cl.uint(i.amount),
        Cl.principal(i.recipient),
        Cl.principal(i.relayer),
        Cl.uint(i.relayerFee),
        Cl.uint(i.nonce),
        Cl.uint(i.expiry),
      ],
      deployer()
    );
    if (result.type !== ClarityType.ResponseOk) throw new Error("hash-intent failed");
    expect(normHex((result.value as { value: string }).value)).toBe(
      bytesToHex(hashIntent(i))
    );
  });

  it("SDK domainHash equals the contract's MESSAGE_DOMAIN_HASH", () => {
    const { result } = simnet.callReadOnlyFn(
      "privara-router",
      "get-domain-hash",
      [],
      deployer()
    );
    if (result.type !== ClarityType.Buffer) throw new Error("bad domain hash");
    expect(normHex(result.value)).toBe(bytesToHex(domainHash(NETWORK)));
  });

  it("SDK messageDigest equals the contract's message-digest", () => {
    const i = baseIntent();
    const dataHash = hashIntent(i);
    const { result } = simnet.callReadOnlyFn(
      "privara-router",
      "message-digest",
      [Cl.buffer(dataHash)],
      deployer()
    );
    if (result.type !== ClarityType.Buffer) throw new Error("bad digest");
    expect(normHex(result.value)).toBe(bytesToHex(messageDigest(i, NETWORK)));
  });
});

describe("SDK end-to-end: sign then settle on simnet", () => {
  const DEPOSIT = 1_000_000n;

  beforeEach(() => {
    const si = signIntent(baseIntent(), USER_KEY, NETWORK);
    mint(si.user, DEPOSIT);
    deposit(si.user, DEPOSIT);
  });

  it("a relayer settles an intent the SDK signed", () => {
    const si = signIntent(baseIntent(), USER_KEY, NETWORK);
    expect(si.userSig.length).toBe(65);
    expect(si.digest.length).toBe(32);

    const { result } = simnet.callPublicFn(
      "privara-router",
      "settle-intent",
      settleArgs(si),
      relayer()
    );
    expect(result.type).toBe(ClarityType.ResponseOk);
  });

  it("the digest signed offline matches what the contract records as settled", () => {
    const si = signIntent(baseIntent(), USER_KEY, NETWORK);
    simnet.callPublicFn("privara-router", "settle-intent", settleArgs(si), relayer());

    const { result } = simnet.callReadOnlyFn(
      "privara-router",
      "is-intent-settled",
      [Cl.buffer(si.digest)],
      relayer()
    );
    expect(result).toBeBool(true);
  });
});
