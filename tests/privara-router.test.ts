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

// settle-intent argument list for a given intent + signature. The payer is not an
// argument -- the contract recovers it from the signature.
function settleArgs(i: Intent, sig: Uint8Array) {
  return [
    Cl.principal(mockToken()),
    Cl.uint(i.amount),
    Cl.principal(recipient()),
    Cl.principal(relayer()),
    Cl.uint(i.relayerFee),
    Cl.uint(i.nonce),
    Cl.uint(i.expiry),
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

function settle(i: Intent, opts: { key?: string } = {}) {
  const sig = signIntent(i, opts.key ?? USER_KEY);
  return simnet.callPublicFn(
    "privara-router",
    "settle-intent",
    settleArgs(i, sig),
    relayer()
  );
}

// cancel-intent takes the identical argument shape as settle-intent. It must be called
// by the signer, so `caller` defaults to the user (the USER_KEY principal). `signKey`
// lets a test sign with a different key to exercise the non-signer rejection.
function cancel(i: Intent, opts: { caller?: string; signKey?: string } = {}) {
  const sig = signIntent(i, opts.signKey ?? USER_KEY);
  return simnet.callPublicFn(
    "privara-router",
    "cancel-intent",
    settleArgs(i, sig),
    opts.caller ?? user()
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

  it("settles a valid intent: credits recipient and relayer, debits deposit, marks settled", () => {
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

    // intent recorded as settled (digest-based replay protection).
    const { result: settled } = simnet.callReadOnlyFn(
      "privara-router",
      "is-intent-settled",
      [Cl.buffer(digestFor(baseIntent))],
      user()
    );
    expect(settled).toBeBool(true);
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

  it("rejects a signature from the wrong key (recovers a signer with no deposit -> ERR_NO_DEPOSIT u110)", () => {
    // The payer is whoever the signature recovers to. Signing with OTHER_KEY makes
    // the recovered signer OTHER_KEY's principal, which never deposited, so it fails
    // the no-deposit guard. (Pre-obfuscation this was ERR_INVALID_SIG via a
    // supplied-user mismatch; with `user` removed, the no-deposit path is the guard,
    // kept distinct from u104 so a genuine short depositor is still reported clearly.)
    const { result } = settle(baseIntent, { key: OTHER_KEY });
    expect(result).toBeErr(Cl.uint(110));
  });

  it("rejects a tampered amount: valid sig over a different amount recovers a signer with no deposit -> ERR_NO_DEPOSIT u110", () => {
    // The relayer submits amount+5 but the signature is over `amount`. The contract
    // recomputes the digest from the submitted args, so recovery yields a principal
    // unrelated to the real signer -- one with no deposit. The tamper cannot settle.
    const sig = signIntent(baseIntent, USER_KEY);
    const tampered: Intent = { ...baseIntent, amount: AMOUNT + 5n };
    const { result } = simnet.callPublicFn(
      "privara-router",
      "settle-intent",
      settleArgs(tampered, sig),
      relayer()
    );
    expect(result).toBeErr(Cl.uint(110));
  });

  it("accepts any nonce -- intents are unordered (no sequential counter)", () => {
    // A large, arbitrary nonce settles fine: the nonce is a uniqueness salt, not a
    // counter, so there is no "expected next nonce" to match.
    const arbitrary: Intent = { ...baseIntent, nonce: 987654321n };
    const { result } = settle(arbitrary);
    expect(result.type).toBe(ClarityType.ResponseOk);
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

  it("settles two intents with distinct nonces in any order; a repeated nonce is a replay", () => {
    // Distinct nonces => distinct digests => both settle, order irrelevant. Here the
    // higher nonce settles FIRST, proving there is no head-of-line ordering.
    expect(settle({ ...baseIntent, nonce: 2n }).result.type).toBe(ClarityType.ResponseOk);
    expect(settle({ ...baseIntent, nonce: 1n }).result.type).toBe(ClarityType.ResponseOk);

    // Reusing a nonce reproduces an already-settled digest -> ERR_INTENT_USED.
    const { result } = settle({ ...baseIntent, nonce: 2n });
    expect(result).toBeErr(Cl.uint(100));
  });
});

describe("privara-router cancel-intent", () => {
  beforeEach(() => {
    // Fund fully so a post-cancel settle failure is attributable to the cancel, not to
    // an empty deposit.
    mint(user(), DEPOSIT);
    deposit(DEPOSIT);
  });

  it("the signer cancels an intent, and settlement then fails with ERR_INTENT_USED", () => {
    expect(cancel(baseIntent).result.type).toBe(ClarityType.ResponseOk);
    // The deposit is untouched (cancel moves no funds).
    const { result: dep } = simnet.callReadOnlyFn(
      "privara-router",
      "get-deposit",
      [Cl.principal(user()), Cl.principal(mockToken())],
      user()
    );
    expect(dep).toBeUint(DEPOSIT);
    // A relayer can no longer settle the cancelled intent.
    expect(settle(baseIntent).result).toBeErr(Cl.uint(100));
  });

  it("a non-signer cannot cancel someone else's intent (ERR_NOT_SIGNER u111)", () => {
    // An attacker submits the USER-signed intent while being tx-sender. The contract
    // recovers the real signer (USER) from the signature; USER != tx-sender, so the
    // cancel is rejected and the intent is NOT burned.
    const attacker = accounts().get("wallet_4")!;
    const { result } = simnet.callPublicFn(
      "privara-router",
      "cancel-intent",
      settleArgs(baseIntent, signIntent(baseIntent, USER_KEY)),
      attacker
    );
    expect(result).toBeErr(Cl.uint(111));
    // The intent is still settleable, proving the failed cancel did not burn it.
    expect(settle(baseIntent).result.type).toBe(ClarityType.ResponseOk);
  });

  it("cancelling an already-settled intent is an idempotent no-op success", () => {
    expect(settle(baseIntent).result.type).toBe(ClarityType.ResponseOk);
    expect(cancel(baseIntent).result.type).toBe(ClarityType.ResponseOk);
  });

  it("cancelling twice is idempotent", () => {
    expect(cancel(baseIntent).result.type).toBe(ClarityType.ResponseOk);
    expect(cancel(baseIntent).result.type).toBe(ClarityType.ResponseOk);
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
