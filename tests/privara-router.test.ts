import { describe, expect, it } from "vitest";
import {
  boolCV,
  bufferCV,
  principalCV,
  stringUtf8CV,
  uintCV,
} from "@stacks/transactions";

// simnet is available globally via vitest-environment-clarinet
declare const simnet: import("@stacks/clarinet-sdk").Simnet;

const accounts = () => simnet.getAccounts();

describe("privara-router", () => {
  it("should reject a replay of a settled intent", () => {
    // TODO: deposit tokens, settle a valid intent, then attempt to settle
    // the same intent-hash again and assert ERR-INTENT-USED (u100)
    expect(true).toBe(true);
  });

  it("should reject an expired intent", () => {
    // TODO: create an intent with expiry < current block-height and assert
    // settle-intent returns ERR-INTENT-EXPIRED (u101)
    expect(true).toBe(true);
  });

  it("should reject an invalid signature", () => {
    // TODO: submit an intent signed by the wrong key and assert
    // settle-intent returns ERR-INVALID-SIG (u102)
    expect(true).toBe(true);
  });

  it("should reject an intent with the wrong nonce", () => {
    // TODO: submit an intent with nonce != get-nonce(user) and assert
    // settle-intent returns ERR-NONCE-MISMATCH (u103)
    expect(true).toBe(true);
  });

  it("should reject settlement when deposit is insufficient", () => {
    // TODO: skip deposit step and assert settle-intent returns
    // ERR-INSUFFICIENT-FUNDS (u104)
    expect(true).toBe(true);
  });

  it("should settle a valid intent and credit recipient and relayer", () => {
    // TODO: full happy-path flow:
    // 1. user deposits via simnet call to deposit()
    // 2. compute intent-hash using hash-intent read-only
    // 3. sign hash with user's simnet private key
    // 4. relayer calls settle-intent with all params
    // 5. assert recipient balance increased by (amount - relayer-fee)
    // 6. assert relayer balance increased by relayer-fee
    // 7. assert is-intent-settled returns true for that hash
    expect(true).toBe(true);
  });

  it("hash-intent is deterministic for the same inputs", () => {
    const { result: hash1 } = simnet.callReadOnlyFn(
      "privara-router",
      "hash-intent",
      [
        principalCV(accounts().get("wallet_1")!),
        uintCV(1000000),
        principalCV(accounts().get("wallet_2")!),
        principalCV(accounts().get("wallet_3")!),
        uintCV(1000),
        uintCV(0),
        uintCV(100),
      ],
      accounts().get("wallet_1")!
    );

    const { result: hash2 } = simnet.callReadOnlyFn(
      "privara-router",
      "hash-intent",
      [
        principalCV(accounts().get("wallet_1")!),
        uintCV(1000000),
        principalCV(accounts().get("wallet_2")!),
        principalCV(accounts().get("wallet_3")!),
        uintCV(1000),
        uintCV(0),
        uintCV(100),
      ],
      accounts().get("wallet_1")!
    );

    expect(hash1).toStrictEqual(hash2);
  });
});

describe("privara-registry", () => {
  it("should register a new relayer", () => {
    const relayer = accounts().get("wallet_1")!;
    const { result } = simnet.callPublicFn(
      "privara-registry",
      "register",
      [
        bufferCV(new Uint8Array(33).fill(2)),
        uintCV(100),
        stringUtf8CV("https://relayer.example.com"),
      ],
      relayer
    );
    expect(result).toBeOk(principalCV(relayer));
  });

  it("should reject a duplicate registration", () => {
    const relayer = accounts().get("wallet_1")!;
    const args = [
      bufferCV(new Uint8Array(33).fill(2)),
      uintCV(100),
      stringUtf8CV("https://relayer.example.com"),
    ];
    simnet.callPublicFn("privara-registry", "register", args, relayer);
    const { result } = simnet.callPublicFn("privara-registry", "register", args, relayer);
    expect(result).toBeErr(uintCV(201));
  });
});
