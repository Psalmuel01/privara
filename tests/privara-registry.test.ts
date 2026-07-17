import { describe, expect, it } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";

// simnet is available globally via vitest-environment-clarinet
declare const simnet: import("@stacks/clarinet-sdk").Simnet;

const accounts = () => simnet.getAccounts();
const relayer = () => accounts().get("wallet_1")!;
const other = () => accounts().get("wallet_2")!;

// A valid compressed secp256k1 pubkey starts with 0x02 or 0x03.
const validPubkey = () => Cl.buffer(new Uint8Array(33).fill(2));
const ENDPOINT = "https://relayer.example.com";

function register(
  who: string,
  pubkey = validPubkey(),
  feeRate = 100n,
  endpoint = ENDPOINT
) {
  return simnet.callPublicFn(
    "privara-registry",
    "register",
    [pubkey, Cl.uint(feeRate), Cl.stringUtf8(endpoint)],
    who
  );
}

describe("privara-registry register", () => {
  it("registers a new relayer", () => {
    const { result } = register(relayer());
    expect(result).toBeOk(Cl.principal(relayer()));
  });

  it("increments the relayer count", () => {
    register(relayer());
    register(other());
    const { result } = simnet.callReadOnlyFn(
      "privara-registry",
      "get-relayer-count",
      [],
      relayer()
    );
    expect(result).toBeUint(2n);
  });

  it("rejects a duplicate registration (ERR_ALREADY_REGISTERED u201)", () => {
    register(relayer());
    const { result } = register(relayer());
    expect(result).toBeErr(Cl.uint(201));
  });

  it("rejects a pubkey with a bad prefix (ERR_INVALID_PUBKEY u202)", () => {
    // 0x04 is an uncompressed-key prefix, not valid for a 33-byte compressed key.
    const badPubkey = Cl.buffer(new Uint8Array(33).fill(4));
    const { result } = register(relayer(), badPubkey);
    expect(result).toBeErr(Cl.uint(202));
  });

  it("rejects a fee rate above MAX_FEE_RATE (ERR_FEE_TOO_HIGH u203)", () => {
    const { result } = register(relayer(), validPubkey(), 10001n);
    expect(result).toBeErr(Cl.uint(203));
  });

  it("rejects an empty endpoint (ERR_EMPTY_ENDPOINT u204)", () => {
    const { result } = register(relayer(), validPubkey(), 100n, "");
    expect(result).toBeErr(Cl.uint(204));
  });
});

describe("privara-registry lookups", () => {
  it("reports registration status", () => {
    register(relayer());
    const registered = simnet.callReadOnlyFn(
      "privara-registry",
      "is-registered",
      [Cl.principal(relayer())],
      relayer()
    );
    expect(registered.result).toBeBool(true);

    const unregistered = simnet.callReadOnlyFn(
      "privara-registry",
      "is-registered",
      [Cl.principal(other())],
      relayer()
    );
    expect(unregistered.result).toBeBool(false);
  });

  it("returns relayer metadata", () => {
    register(relayer());
    const { result } = simnet.callReadOnlyFn(
      "privara-registry",
      "get-relayer",
      [Cl.principal(relayer())],
      relayer()
    );
    // (some { pubkey, fee-rate, endpoint, active })
    expect(result.type).toBe(ClarityType.OptionalSome);
  });
});

describe("privara-registry update-endpoint + deactivate", () => {
  it("updates the endpoint of a registered relayer", () => {
    register(relayer());
    const { result } = simnet.callPublicFn(
      "privara-registry",
      "update-endpoint",
      [Cl.stringUtf8("https://new.example.com")],
      relayer()
    );
    expect(result).toBeOk(Cl.bool(true));
  });

  it("rejects update-endpoint from an unregistered caller (ERR_NOT_REGISTERED u200)", () => {
    const { result } = simnet.callPublicFn(
      "privara-registry",
      "update-endpoint",
      [Cl.stringUtf8("https://new.example.com")],
      other()
    );
    expect(result).toBeErr(Cl.uint(200));
  });

  it("deactivates a registered relayer", () => {
    register(relayer());
    const { result } = simnet.callPublicFn(
      "privara-registry",
      "deactivate",
      [],
      relayer()
    );
    expect(result).toBeOk(Cl.bool(true));
  });

  it("rejects deactivate from an unregistered caller (ERR_NOT_REGISTERED u200)", () => {
    const { result } = simnet.callPublicFn(
      "privara-registry",
      "deactivate",
      [],
      other()
    );
    expect(result).toBeErr(Cl.uint(200));
  });
});
