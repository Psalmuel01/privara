import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  Cl,
  ClarityType,
  serializeCVBytes,
  signMessageHashRsv,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { bytesToHex, hexToBytes } from "@stacks/common";

// simnet is available globally via vitest-environment-clarinet
declare const simnet: import("@stacks/clarinet-sdk").Simnet;

// Clarinet's documented wallet_1 key. The router recovers the signer from the
// signature, so the user who signs an intent must be the address this key derives.
const USER_KEY =
  "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801";
// wallet_2 key — used only to sign a forged intent (wrong signer) test.
const OTHER_KEY =
  "530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101";

const PREFIX = hexToBytes("534950303138"); // "SIP018"

const sha256 = (data: Uint8Array) =>
  new Uint8Array(createHash("sha256").update(data).digest());

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

const normHex = (s: string) => s.replace(/^0x/, "");
const accounts = () => simnet.getAccounts();
const deployer = () => simnet.deployer;
const mockToken = () => `${deployer()}.mock-token`;

// Addresses (simnet uses testnet-form ST... principals).
const user = () => getAddressFromPrivateKey(USER_KEY, "testnet");
const recipient = () => accounts().get("wallet_2")!;
const relayer = () => accounts().get("wallet_3")!;

interface Intent {
  amount: bigint;
  relayerFee: bigint;
  nonce: bigint;
  expiry: bigint;
}

// Mirror the contract's intent tuple exactly (field set + order). serializeCVBytes
// matches to-consensus-buff? byte-for-byte.
function intentCV(i: Intent) {
  return Cl.tuple({
    asset: Cl.principal(mockToken()),
    amount: Cl.uint(i.amount),
    recipient: Cl.principal(recipient()),
    relayer: Cl.principal(relayer()),
    "relayer-fee": Cl.uint(i.relayerFee),
    nonce: Cl.uint(i.nonce),
    expiry: Cl.uint(i.expiry),
  });
}

function domainHashFromContract(): Uint8Array {
  const { result } = simnet.callReadOnlyFn(
    "privara-router",
    "get-domain-hash",
    [],
    user()
  );
  if (result.type !== ClarityType.Buffer) throw new Error("bad domain hash");
  return hexToBytes(normHex(result.value));
}

// The full SIP-018 digest the user signs.
function digestFor(i: Intent): Uint8Array {
  const dataHash = sha256(serializeCVBytes(intentCV(i)));
  return sha256(concatBytes(PREFIX, domainHashFromContract(), dataHash));
}

function signIntent(i: Intent, key: string): Uint8Array {
  const sig = signMessageHashRsv({
    messageHash: bytesToHex(digestFor(i)),
    privateKey: key,
  });
  return hexToBytes(sig);
}

// settle-intent argument list for a given intent + signature.
function settleArgs(i: Intent, sig: Uint8Array, signer = user()) {
  return [
    Cl.principal(mockToken()),
    Cl.uint(i.amount),
    Cl.principal(recipient()),
    Cl.principal(relayer()),
    Cl.uint(i.relayerFee),
    Cl.uint(i.nonce),
    Cl.uint(i.expiry),
    Cl.principal(signer),
    Cl.buffer(sig),
  ];
}

function mint(to: string, amount: bigint) {
  simnet.callPublicFn("mock-token", "mint", [Cl.uint(amount), Cl.principal(to)], user());
}

function deposit(amount: bigint) {
  return simnet.callPublicFn(
    "privara-router",
    "deposit",
    [Cl.principal(mockToken()), Cl.uint(amount)],
    user()
  );
}

function settle(i: Intent, opts: { key?: string; signer?: string } = {}) {
  const sig = signIntent(i, opts.key ?? USER_KEY);
  return simnet.callPublicFn(
    "privara-router",
    "settle-intent",
    settleArgs(i, sig, opts.signer ?? user()),
    relayer()
  );
}

function balance(who: string): bigint {
  const { result } = simnet.callReadOnlyFn(
    "mock-token",
    "get-balance",
    [Cl.principal(who)],
    user()
  );
  if (result.type !== ClarityType.ResponseOk) throw new Error("bad balance");
  return BigInt((result.value as { value: bigint }).value);
}

const DEPOSIT = 1_000_000n;
const AMOUNT = 100_000n;
const FEE = 1_000n;
const baseIntent: Intent = { amount: AMOUNT, relayerFee: FEE, nonce: 0n, expiry: 1000n };

describe("privara-router settle-intent", () => {
  beforeEach(() => {
    // Fund and deposit before each test so state starts clean.
    mint(user(), DEPOSIT);
    deposit(DEPOSIT);
  });

  it("settles a valid intent: credits recipient and relayer, debits deposit, marks settled, bumps nonce", () => {
    const recipBefore = balance(recipient());
    const relayerBefore = balance(relayer());

    const { result } = settle(baseIntent);
    expect(result.type).toBe(ClarityType.ResponseOk);

    // recipient gets amount - fee, relayer gets fee.
    expect(balance(recipient())).toBe(recipBefore + (AMOUNT - FEE));
    expect(balance(relayer())).toBe(relayerBefore + FEE);

    // deposit debited by the full amount.
    const { result: dep } = simnet.callReadOnlyFn(
      "privara-router",
      "get-deposit",
      [Cl.principal(user()), Cl.principal(mockToken())],
      user()
    );
    expect(dep).toBeUint(DEPOSIT - AMOUNT);

    // nonce incremented.
    const { result: nonce } = simnet.callReadOnlyFn(
      "privara-router",
      "get-nonce",
      [Cl.principal(user())],
      user()
    );
    expect(nonce).toBeUint(1n);
  });

  it("rejects a replay of a settled intent (ERR_INTENT_USED u100)", () => {
    settle(baseIntent);
    const { result } = settle(baseIntent);
    expect(result).toBeErr(Cl.uint(100));
  });

  it("rejects an expired intent (ERR_INTENT_EXPIRED u101)", () => {
    const expired: Intent = { ...baseIntent, expiry: 2n };
    simnet.mineEmptyBlocks(5);
    const { result } = settle(expired);
    expect(result).toBeErr(Cl.uint(101));
  });

  it("rejects a signature from the wrong key (ERR_INVALID_SIG u102)", () => {
    // Signed by OTHER_KEY but the named user is still wallet_1 -> recovered signer mismatches.
    const { result } = settle(baseIntent, { key: OTHER_KEY });
    expect(result).toBeErr(Cl.uint(102));
  });

  it("rejects a tampered amount: valid sig but relayer submits a different amount (ERR_INVALID_SIG u102)", () => {
    const sig = signIntent(baseIntent, USER_KEY);
    const tampered: Intent = { ...baseIntent, amount: AMOUNT + 5n };
    const { result } = simnet.callPublicFn(
      "privara-router",
      "settle-intent",
      settleArgs(tampered, sig),
      relayer()
    );
    expect(result).toBeErr(Cl.uint(102));
  });

  it("rejects a wrong nonce (ERR_NONCE_MISMATCH u103)", () => {
    const future: Intent = { ...baseIntent, nonce: 5n };
    const { result } = settle(future);
    expect(result).toBeErr(Cl.uint(103));
  });

  it("rejects settlement exceeding the deposit (ERR_INSUFFICIENT_FUNDS u104)", () => {
    const tooBig: Intent = { ...baseIntent, amount: DEPOSIT + 1n };
    const { result } = settle(tooBig);
    expect(result).toBeErr(Cl.uint(104));
  });

  it("rejects fee >= amount (ERR_AMOUNT_TOO_LOW u105)", () => {
    const badFee: Intent = { ...baseIntent, relayerFee: AMOUNT };
    const { result } = settle(badFee);
    expect(result).toBeErr(Cl.uint(105));
  });

  it("settles with zero fee and makes no relayer transfer", () => {
    const relayerBefore = balance(relayer());
    const noFee: Intent = { ...baseIntent, relayerFee: 0n };
    const { result } = settle(noFee);
    expect(result.type).toBe(ClarityType.ResponseOk);
    expect(balance(relayer())).toBe(relayerBefore); // unchanged
  });

  it("settles sequential intents at nonce 0 then nonce 1", () => {
    expect(settle({ ...baseIntent, nonce: 0n }).result.type).toBe(ClarityType.ResponseOk);
    expect(settle({ ...baseIntent, nonce: 1n }).result.type).toBe(ClarityType.ResponseOk);
  });
});

describe("privara-router deposit + withdraw", () => {
  it("rejects a zero-amount deposit (ERR_AMOUNT_TOO_LOW u105)", () => {
    mint(user(), DEPOSIT);
    const { result } = deposit(0n);
    expect(result).toBeErr(Cl.uint(105));
  });

  it("accumulates balance across deposits", () => {
    mint(user(), DEPOSIT * 2n);
    deposit(DEPOSIT);
    deposit(DEPOSIT);
    const { result } = simnet.callReadOnlyFn(
      "privara-router",
      "get-deposit",
      [Cl.principal(user()), Cl.principal(mockToken())],
      user()
    );
    expect(result).toBeUint(DEPOSIT * 2n);
  });

  it("withdraws unspent deposit back to the owner", () => {
    mint(user(), DEPOSIT);
    deposit(DEPOSIT);
    const before = balance(user());
    const { result } = simnet.callPublicFn(
      "privara-router",
      "withdraw",
      [Cl.principal(mockToken()), Cl.uint(DEPOSIT)],
      user()
    );
    expect(result).toBeOk(Cl.uint(DEPOSIT));
    expect(balance(user())).toBe(before + DEPOSIT);
  });

  it("rejects an over-withdraw (ERR_INSUFFICIENT_FUNDS u104)", () => {
    mint(user(), DEPOSIT);
    deposit(DEPOSIT);
    const { result } = simnet.callPublicFn(
      "privara-router",
      "withdraw",
      [Cl.principal(mockToken()), Cl.uint(DEPOSIT + 1n)],
      user()
    );
    expect(result).toBeErr(Cl.uint(104));
  });
});

describe("privara-router asset whitelist (ERR_ASSET_NOT_WHITELISTED u108)", () => {
  const otherToken = () => `${deployer()}.other-token`;

  it("rejects a deposit of a non-whitelisted asset", () => {
    simnet.callPublicFn(
      "other-token",
      "mint",
      [Cl.uint(DEPOSIT), Cl.principal(user())],
      user()
    );
    const { result } = simnet.callPublicFn(
      "privara-router",
      "deposit",
      [Cl.principal(otherToken()), Cl.uint(DEPOSIT)],
      user()
    );
    expect(result).toBeErr(Cl.uint(108));
  });

  it("rejects a withdraw of a non-whitelisted asset", () => {
    const { result } = simnet.callPublicFn(
      "privara-router",
      "withdraw",
      [Cl.principal(otherToken()), Cl.uint(1n)],
      user()
    );
    expect(result).toBeErr(Cl.uint(108));
  });

  it("rejects settling an intent denominated in a non-whitelisted asset", () => {
    // Build an intent whose asset is other-token. The digest binds that asset, so
    // the signature is valid for it; the whitelist check must still reject it.
    const otherIntentCV = Cl.tuple({
      asset: Cl.principal(otherToken()),
      amount: Cl.uint(AMOUNT),
      recipient: Cl.principal(recipient()),
      relayer: Cl.principal(relayer()),
      "relayer-fee": Cl.uint(FEE),
      nonce: Cl.uint(0n),
      expiry: Cl.uint(1000n),
    });
    const dataHash = sha256(serializeCVBytes(otherIntentCV));
    const digest = sha256(concatBytes(PREFIX, domainHashFromContract(), dataHash));
    const sig = hexToBytes(
      signMessageHashRsv({ messageHash: bytesToHex(digest), privateKey: USER_KEY })
    );
    const { result } = simnet.callPublicFn(
      "privara-router",
      "settle-intent",
      [
        Cl.principal(otherToken()),
        Cl.uint(AMOUNT),
        Cl.principal(recipient()),
        Cl.principal(relayer()),
        Cl.uint(FEE),
        Cl.uint(0n),
        Cl.uint(1000n),
        Cl.principal(user()),
        Cl.buffer(sig),
      ],
      relayer()
    );
    expect(result).toBeErr(Cl.uint(108));
  });
});

describe("privara-router SDK<->contract digest parity", () => {
  it("hash-intent matches serializeCVBytes(tupleCV(...)) in TypeScript", () => {
    const { result } = simnet.callReadOnlyFn(
      "privara-router",
      "hash-intent",
      [
        Cl.principal(mockToken()),
        Cl.uint(AMOUNT),
        Cl.principal(recipient()),
        Cl.principal(relayer()),
        Cl.uint(FEE),
        Cl.uint(0n),
        Cl.uint(1000n),
      ],
      user()
    );
    if (result.type !== ClarityType.ResponseOk) throw new Error("hash-intent failed");
    const tsDataHash = bytesToHex(sha256(serializeCVBytes(intentCV(baseIntent))));
    expect(normHex((result.value as { value: string }).value)).toBe(tsDataHash);
  });
});
