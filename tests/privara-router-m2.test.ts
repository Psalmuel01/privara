import { beforeEach, describe, expect, it } from "vitest";
import {
  Cl,
  ClarityType,
  getAddressFromPrivateKey,
  type ClarityValue,
} from "@stacks/transactions";
import { bytesToHex, hexToBytes } from "@stacks/common";
import { Point } from "@noble/secp256k1";
import {
  buildStealthSettlementArgs,
  createStealthIntent,
  hashStealthAnnouncement,
  hashStealthIntent,
  signStealthIntent,
  stealthDomainHash,
  type Intent,
  type SignedStealthIntent,
  type StealthAnnouncementPayload,
} from "../sdk/src";

declare const simnet: import("@stacks/clarinet-sdk").Simnet;

const USER_KEY =
  "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801";
const OTHER_KEY =
  "530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101";
const DEPOSIT = 1_000_000n;
const AMOUNT = 100_000n;
const FEE = 1_000n;

const accounts = () => simnet.getAccounts();
const deployer = () => simnet.deployer;
const user = () => getAddressFromPrivateKey(USER_KEY, "testnet");
const recipient = () => accounts().get("wallet_2")!;
const relayer = () => accounts().get("wallet_3")!;
const mockToken = () => `${deployer()}.mock-token`;
const router = () => `${deployer()}.privara-router-m2`;

function announcement(
  overrides: Partial<StealthAnnouncementPayload> = {}
): StealthAnnouncementPayload {
  return {
    version: 1,
    stealthPrincipal: recipient(),
    ephemeralPublicKey: Point.BASE.multiply(7n).toRawBytes(true),
    nonce: new Uint8Array(12).fill(0xa1),
    ciphertext: new Uint8Array(32).fill(0xc3),
    asset: mockToken(),
    registryEpoch: 1n,
    ...overrides,
  };
}

function baseIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    asset: mockToken(),
    amount: AMOUNT,
    recipient: recipient(),
    relayer: relayer(),
    relayerFee: FEE,
    nonce: 991n,
    expiry: 1000,
    ...overrides,
  };
}

function signed(
  intent = baseIntent(),
  payload = announcement(),
  key = USER_KEY
): SignedStealthIntent {
  return signStealthIntent(
    createStealthIntent(intent, payload),
    key,
    "testnet",
    router()
  );
}

function settlementCVs(si: SignedStealthIntent, payload: StealthAnnouncementPayload) {
  const args = buildStealthSettlementArgs(si, payload);
  return [
    Cl.principal(args.asset),
    Cl.uint(args.amount),
    Cl.principal(args.recipient),
    Cl.principal(args.relayer),
    Cl.uint(args.relayerFee),
    Cl.uint(args.nonce),
    Cl.uint(args.expiry),
    Cl.buffer(args.announcementHash),
    Cl.uint(args.version),
    Cl.buffer(args.ephemeralPublicKey),
    Cl.buffer(args.announcementNonce),
    Cl.buffer(args.ciphertext),
    Cl.uint(args.registryEpoch),
    Cl.buffer(args.userSig),
  ];
}

function settle(si = signed(), payload = announcement()) {
  return simnet.callPublicFn(
    "privara-router-m2",
    "settle-intent",
    settlementCVs(si, payload),
    relayer()
  );
}

function mintAndDeposit() {
  simnet.callPublicFn(
    "mock-token",
    "mint",
    [Cl.uint(DEPOSIT), Cl.principal(user())],
    user()
  );
  return simnet.callPublicFn(
    "privara-router-m2",
    "deposit",
    [Cl.principal(mockToken()), Cl.uint(DEPOSIT)],
    user()
  );
}

function balance(who: string): bigint {
  const { result } = simnet.callReadOnlyFn(
    "mock-token",
    "get-balance",
    [Cl.principal(who)],
    user()
  );
  if (result.type !== ClarityType.ResponseOk) throw new Error("bad token balance");
  return BigInt(result.value.value);
}

function responseBuffer(result: ClarityValue): Uint8Array {
  if (result.type !== ClarityType.ResponseOk || result.value.type !== ClarityType.Buffer) {
    throw new Error("expected response buffer");
  }
  return hexToBytes(result.value.value.replace(/^0x/, ""));
}

describe("privara-router-m2 protocol parity", () => {
  it("matches the SDK's version-2 domain hash", () => {
    const { result } = simnet.callReadOnlyFn(
      "privara-router-m2",
      "get-domain-hash",
      [],
      user()
    );
    expect(result.type).toBe(ClarityType.Buffer);
    if (result.type !== ClarityType.Buffer) return;
    expect(result.value.replace(/^0x/, "")).toBe(
      bytesToHex(stealthDomainHash("testnet", router()))
    );
  });

  it("matches canonical announcement and intent hashes byte-for-byte", () => {
    const payload = announcement();
    const intent = createStealthIntent(baseIntent(), payload);
    const { result: announcementResult } = simnet.callReadOnlyFn(
      "privara-router-m2",
      "hash-announcement",
      [
        Cl.principal(payload.asset),
        Cl.principal(payload.stealthPrincipal),
        Cl.uint(payload.version),
        Cl.buffer(payload.ephemeralPublicKey),
        Cl.buffer(payload.nonce),
        Cl.buffer(payload.ciphertext),
        Cl.uint(payload.registryEpoch),
      ],
      user()
    );
    expect(bytesToHex(responseBuffer(announcementResult))).toBe(
      bytesToHex(hashStealthAnnouncement(payload))
    );

    const { result: intentResult } = simnet.callReadOnlyFn(
      "privara-router-m2",
      "hash-intent",
      [
        Cl.principal(intent.asset),
        Cl.uint(intent.amount),
        Cl.principal(intent.recipient),
        Cl.principal(intent.relayer),
        Cl.uint(intent.relayerFee),
        Cl.uint(intent.nonce),
        Cl.uint(intent.expiry),
        Cl.buffer(intent.announcementHash),
      ],
      user()
    );
    expect(bytesToHex(responseBuffer(intentResult))).toBe(bytesToHex(hashStealthIntent(intent)));
  });
});

describe("privara-router-m2 atomic stealth settlement", () => {
  beforeEach(() => {
    mintAndDeposit();
  });

  it("settles, debits custody, and emits the complete bound announcement", () => {
    const payload = announcement();
    const si = signed(baseIntent(), payload);
    const recipientBefore = balance(recipient());
    const relayerBefore = balance(relayer());
    const call = settle(si, payload);

    expect(call.result).toBeOk(Cl.buffer(si.digest));
    expect(balance(recipient())).toBe(recipientBefore + AMOUNT - FEE);
    expect(balance(relayer())).toBe(relayerBefore + FEE);

    const { result: deposit } = simnet.callReadOnlyFn(
      "privara-router-m2",
      "get-deposit",
      [Cl.principal(user()), Cl.principal(mockToken())],
      user()
    );
    expect(deposit).toBeUint(DEPOSIT - AMOUNT);

    const printEvent = call.events.find((event) => event.event === "print_event");
    expect(printEvent).toBeDefined();
    const value = printEvent?.data.value;
    expect(value?.type).toBe(ClarityType.Tuple);
    if (!value || value.type !== ClarityType.Tuple) return;
    expect(value.value.event).toBeAscii("stealth-settlement");
    expect(value.value["intent-hash"]).toBeBuff(si.digest);
    expect(value.value["announcement-hash"]).toBeBuff(si.announcementHash);
    expect(value.value["stealth-principal"]).toBePrincipal(payload.stealthPrincipal);
    expect(value.value["ephemeral-key"]).toBeBuff(payload.ephemeralPublicKey);
    expect(value.value.nonce).toBeBuff(payload.nonce);
    expect(value.value.ciphertext).toBeBuff(payload.ciphertext);
    expect(value.value["registry-epoch"]).toBeUint(payload.registryEpoch);
  });

  it("rejects a changed payload and rolls back all effects (u111)", () => {
    const payload = announcement();
    const si = signed(baseIntent(), payload);
    const changed = announcement({ ciphertext: new Uint8Array(32).fill(0xd4) });
    const before = balance(recipient());

    // Build the positional call manually because the SDK correctly refuses an
    // unbound payload before it reaches the chain.
    const args = settlementCVs(si, payload);
    args[11] = Cl.buffer(changed.ciphertext);
    const call = simnet.callPublicFn("privara-router-m2", "settle-intent", args, relayer());
    expect(call.result).toBeErr(Cl.uint(111));
    expect(balance(recipient())).toBe(before);
    expect(call.events.find((event) => event.event === "print_event")).toBeUndefined();
  });

  it("rejects a different re-signed announcement commitment (u111)", () => {
    const payload = announcement();
    const intent = createStealthIntent(baseIntent(), payload);
    const altered = {
      ...intent,
      announcementHash: new Uint8Array(32).fill(0x55),
    };
    const si = signStealthIntent(altered, USER_KEY, "testnet", router());
    const args = settlementCVs(signed(baseIntent(), payload), payload);
    args[7] = Cl.buffer(si.announcementHash);
    args[13] = Cl.buffer(si.userSig);
    const call = simnet.callPublicFn("privara-router-m2", "settle-intent", args, relayer());
    expect(call.result).toBeErr(Cl.uint(111));
  });

  it("rejects unsupported version, malformed key/nonce, and short ciphertext", () => {
    const payload = announcement();
    const si = signed(baseIntent(), payload);

    const badVersion = settlementCVs(si, payload);
    badVersion[8] = Cl.uint(2);
    expect(
      simnet.callPublicFn("privara-router-m2", "settle-intent", badVersion, relayer()).result
    ).toBeErr(Cl.uint(112));

    const badKey = settlementCVs(si, payload);
    badKey[9] = Cl.buffer(new Uint8Array(33));
    expect(
      simnet.callPublicFn("privara-router-m2", "settle-intent", badKey, relayer()).result
    ).toBeErr(Cl.uint(113));

    const badNonce = settlementCVs(si, payload);
    badNonce[10] = Cl.buffer(new Uint8Array(11));
    expect(
      simnet.callPublicFn("privara-router-m2", "settle-intent", badNonce, relayer()).result
    ).toBeErr(Cl.uint(114));

    const shortCiphertext = settlementCVs(si, payload);
    shortCiphertext[11] = Cl.buffer(new Uint8Array(15));
    expect(
      simnet.callPublicFn("privara-router-m2", "settle-intent", shortCiphertext, relayer()).result
    ).toBeErr(Cl.uint(115));
  });

  it("rejects replay, expiry, and a signature from an unfunded signer", () => {
    const payload = announcement();
    const si = signed(baseIntent(), payload);
    expect(settle(si, payload).result.type).toBe(ClarityType.ResponseOk);
    expect(settle(si, payload).result).toBeErr(Cl.uint(100));

    const expiredIntent = baseIntent({ nonce: 992n, expiry: 2 });
    const expired = signed(expiredIntent, payload);
    simnet.mineEmptyBlocks(5);
    expect(settle(expired, payload).result).toBeErr(Cl.uint(101));

    const forgedIntent = baseIntent({ nonce: 993n });
    const forged = signed(forgedIntent, payload, OTHER_KEY);
    expect(settle(forged, payload).result).toBeErr(Cl.uint(110));
  });

  it("accepts arbitrary unordered nonces and binds cancellation to the same hash", () => {
    const payload = announcement();
    const intent = baseIntent({ nonce: 9_876_543_210n });
    const si = signed(intent, payload);
    const cancelArgs = [
      Cl.principal(si.asset),
      Cl.uint(si.amount),
      Cl.principal(si.recipient),
      Cl.principal(si.relayer),
      Cl.uint(si.relayerFee),
      Cl.uint(si.nonce),
      Cl.uint(si.expiry),
      Cl.buffer(si.announcementHash),
      Cl.buffer(si.userSig),
    ];
    expect(
      simnet.callPublicFn("privara-router-m2", "cancel-intent", cancelArgs, user()).result
    ).toBeOk(Cl.bool(true));
    expect(settle(si, payload).result).toBeErr(Cl.uint(100));
  });

  it("the SDK refuses an announcement that is not bound to the signed intent", () => {
    const payload = announcement();
    const si = signed(baseIntent(), payload);
    const changed = announcement({ registryEpoch: 2n });
    expect(() => buildStealthSettlementArgs(si, changed)).toThrow(
      "does not match the signed announcement hash"
    );
  });
});
