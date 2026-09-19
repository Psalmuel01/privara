import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@stacks/common";
import { Cl, ClarityType, getAddressFromPrivateKey, type ClarityValue } from "@stacks/transactions";
import { Point } from "@noble/secp256k1";
import {
  buildStealthSettlementArgs,
  createStealthIntent,
  hashStealthAnnouncement,
  signStealthIntent,
  stealthDomainHash,
  type StealthAnnouncementPayload,
} from "../sdk/src";

declare const simnet: import("@stacks/clarinet-sdk").Simnet;

const USER_KEY = "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801";
const payer = () => getAddressFromPrivateKey(USER_KEY, "testnet");
const recipient = () => simnet.getAccounts().get("wallet_2")!;
const relayer = () => simnet.getAccounts().get("wallet_3")!;
const contract = () => `${simnet.deployer}.privara-stx-router-v1`;

function announcement(): StealthAnnouncementPayload {
  return {
      version: 1,
      stealthPrincipal: recipient(),
      ephemeralPublicKey: Point.BASE.multiply(23n).toRawBytes(true),
      nonce: new Uint8Array(12).fill(0x11),
      ciphertext: new Uint8Array(24).fill(0x22),
      asset: contract(),
      registryEpoch: 2n,
  };
}

function signed() {
  const payload = announcement();
  return { payload, intent: signStealthIntent(createStealthIntent({ asset: contract(), amount: 101_000n, recipient: recipient(), relayer: relayer(), relayerFee: 1_000n, nonce: 42n, expiry: 1000 }, payload), USER_KEY, "testnet", contract()) };
}

function settlementArgs() {
  const { payload, intent } = signed();
  const args = buildStealthSettlementArgs(intent, payload);
  return [Cl.principal(args.asset), Cl.uint(args.amount), Cl.principal(args.recipient), Cl.principal(args.relayer), Cl.uint(args.relayerFee), Cl.uint(args.nonce), Cl.uint(args.expiry), Cl.buffer(args.announcementHash), Cl.uint(args.version), Cl.buffer(args.ephemeralPublicKey), Cl.buffer(args.announcementNonce), Cl.buffer(args.ciphertext), Cl.uint(args.registryEpoch), Cl.buffer(args.userSig)];
}

function okBuffer(result: ClarityValue): Uint8Array {
  if (result.type !== ClarityType.ResponseOk || result.value.type !== ClarityType.Buffer) {
    throw new Error("expected ok buffer");
  }
  return hexToBytes(result.value.value.replace(/^0x/, ""));
}

describe("native STX router", () => {
  it("matches the SDK domain and canonical announcement hash", () => {
    const payload = announcement();
    const domain = simnet.callReadOnlyFn("privara-stx-router-v1", "get-domain-hash", [], payer());
    expect(domain.result).toBeBuff(stealthDomainHash("testnet", contract()));
    const hash = simnet.callReadOnlyFn(
      "privara-stx-router-v1",
      "hash-announcement",
      [Cl.principal(payload.asset), Cl.principal(payload.stealthPrincipal), Cl.uint(payload.version), Cl.buffer(payload.ephemeralPublicKey), Cl.buffer(payload.nonce), Cl.buffer(payload.ciphertext), Cl.uint(payload.registryEpoch)],
      payer()
    );
    expect(bytesToHex(okBuffer(hash.result))).toBe(bytesToHex(hashStealthAnnouncement(payload)));
  });

  it("separates deposit from relayer settlement and debits only the signed amount", () => {
    expect(simnet.callPublicFn("privara-stx-router-v1", "deposit", [Cl.uint(500_000)], payer()).result).toBeOk(Cl.uint(500_000));
    const call = simnet.callPublicFn("privara-stx-router-v1", "settle-intent", settlementArgs(), relayer());
    expect(call.result.type).toBe(ClarityType.ResponseOk);
    expect(simnet.callReadOnlyFn("privara-stx-router-v1", "get-deposit", [Cl.principal(payer())], payer()).result).toBeUint(399_000);
    const printed = call.events.find((event) => event.event === "print_event");
    expect(printed).toBeDefined();
    if (printed?.data.value.type !== ClarityType.Tuple) return;
    expect(printed.data.value.value.event).toBeAscii("stealth-stx-settlement");
    expect(printed.data.value.value.amount).toBeUint(101_000);
    expect(printed.data.value.value["relayer-fee"]).toBeUint(1_000);
  });

  it("rejects settlement without the signer's router deposit", () => {
    expect(simnet.callPublicFn("privara-stx-router-v1", "settle-intent", settlementArgs(), relayer()).result).toBeErr(Cl.uint(304));
  });

  it("lets the payer recover unused router funds", () => {
    simnet.callPublicFn("privara-stx-router-v1", "deposit", [Cl.uint(500_000)], payer());
    expect(simnet.callPublicFn("privara-stx-router-v1", "withdraw", [Cl.uint(125_000)], payer()).result).toBeOk(Cl.uint(125_000));
    expect(simnet.callReadOnlyFn("privara-stx-router-v1", "get-deposit", [Cl.principal(payer())], payer()).result).toBeUint(375_000);
  });
});
