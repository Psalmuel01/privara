import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import { bytesToHex } from "@stacks/common";
import { generateIdentity } from "../sdk/src/stealth/identity";
import {
  buildStealthKeyArgs,
  parseStealthKeysCV,
} from "../sdk/src/registry/stealth";

declare const simnet: import("@stacks/clarinet-sdk").Simnet;

const accounts = () => simnet.getAccounts();
const user = () => accounts().get("wallet_1")!;
const other = () => accounts().get("wallet_2")!;

function key(prefix: 2 | 3, fill: number) {
  const bytes = new Uint8Array(33).fill(fill);
  bytes[0] = prefix;
  return Cl.buffer(bytes);
}

const spendingKey = () => key(2, 0x11);
const viewingKey = () => key(3, 0x22);

function register(who = user(), spending = spendingKey(), viewing = viewingKey()) {
  return simnet.callPublicFn(
    "privara-stealth-registry",
    "register-stealth-keys",
    [spending, viewing],
    who
  );
}

describe("privara-stealth-registry registration", () => {
  it("registers keys at epoch one", () => {
    expect(register().result).toBeOk(Cl.uint(1));
    const lookup = simnet.callReadOnlyFn(
      "privara-stealth-registry",
      "get-stealth-keys",
      [Cl.principal(user())],
      other()
    );
    expect(lookup.result).toBeSome(
      Cl.tuple({
        "spending-key": spendingKey(),
        "viewing-key": viewingKey(),
        epoch: Cl.uint(1),
      })
    );
  });

  it("rejects duplicate registration", () => {
    register();
    expect(register().result).toBeErr(Cl.uint(301));
  });

  it("rejects short compressed-key buffers", () => {
    const short = new Uint8Array(32).fill(1);
    short[0] = 2;
    expect(register(user(), Cl.buffer(short), viewingKey()).result).toBeErr(Cl.uint(302));
  });

  it("rejects a non-compressed prefix", () => {
    expect(register(user(), key(2, 4), key(3, 4)).result).toBeOk(Cl.uint(1));
    const invalid = new Uint8Array(33).fill(4);
    expect(register(other(), Cl.buffer(invalid), viewingKey()).result).toBeErr(Cl.uint(302));
  });

  it("rejects identical spending and viewing keys", () => {
    const same = spendingKey();
    expect(register(user(), same, same).result).toBeErr(Cl.uint(303));
  });
});

describe("privara-stealth-registry rotation", () => {
  it("rotates only the caller's keys and increments the epoch", () => {
    register();
    const nextSpending = key(3, 0x33);
    const nextViewing = key(2, 0x44);
    const updated = simnet.callPublicFn(
      "privara-stealth-registry",
      "update-stealth-keys",
      [nextSpending, nextViewing],
      user()
    );
    expect(updated.result).toBeOk(Cl.uint(2));
    const lookup = simnet.callReadOnlyFn(
      "privara-stealth-registry",
      "get-stealth-keys",
      [Cl.principal(user())],
      user()
    );
    expect(lookup.result).toBeSome(
      Cl.tuple({
        "spending-key": nextSpending,
        "viewing-key": nextViewing,
        epoch: Cl.uint(2),
      })
    );
  });

  it("rejects an update from an unregistered caller", () => {
    register();
    const result = simnet.callPublicFn(
      "privara-stealth-registry",
      "update-stealth-keys",
      [key(2, 0x55), key(3, 0x66)],
      other()
    );
    expect(result.result).toBeErr(Cl.uint(300));
  });

  it("reports registration status", () => {
    register();
    expect(
      simnet.callReadOnlyFn(
        "privara-stealth-registry",
        "is-registered",
        [Cl.principal(user())],
        other()
      ).result
    ).toBeBool(true);
    expect(
      simnet.callReadOnlyFn(
        "privara-stealth-registry",
        "is-registered",
        [Cl.principal(other())],
        user()
      ).result
    ).toBeBool(false);
  });
});

describe("stealth registry SDK", () => {
  it("builds registration args from validated generated keys", () => {
    const identity = generateIdentity();
    const args = buildStealthKeyArgs(identity.spendingPublicKey, identity.viewingPublicKey);
    expect(args).toHaveLength(2);
  });

  it("parses a contract record into SDK bytes and epoch", () => {
    const identity = generateIdentity();
    const result = simnet.callPublicFn(
      "privara-stealth-registry",
      "register-stealth-keys",
      buildStealthKeyArgs(identity.spendingPublicKey, identity.viewingPublicKey),
      user()
    );
    expect(result.result).toBeOk(Cl.uint(1));
    const lookup = simnet.callReadOnlyFn(
      "privara-stealth-registry",
      "get-stealth-keys",
      [Cl.principal(user())],
      other()
    );
    const parsed = parseStealthKeysCV(lookup.result);
    expect(parsed?.epoch).toBe(1n);
    expect(bytesToHex(parsed!.spendingPublicKey)).toBe(bytesToHex(identity.spendingPublicKey));
    expect(bytesToHex(parsed!.viewingPublicKey)).toBe(bytesToHex(identity.viewingPublicKey));
  });

  it("returns null for an unregistered principal", () => {
    const lookup = simnet.callReadOnlyFn(
      "privara-stealth-registry",
      "get-stealth-keys",
      [Cl.principal(other())],
      user()
    );
    expect(parseStealthKeysCV(lookup.result)).toBeNull();
  });
});
