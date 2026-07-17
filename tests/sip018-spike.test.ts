import { describe, expect, it } from "vitest";
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

// Any valid secp256k1 key works: the contract recovers the principal from the
// signature alone, and we derive the expected address from the same key in TS.
// This is Clarinet's documented wallet_1 key.
const SIGNER_KEY =
  "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801";

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
const caller = () => simnet.getAccounts().get("wallet_1")!;

function chainIdFromContract(): bigint {
  const { result } = simnet.callReadOnlyFn("sip018-spike", "get-chain-id", [], caller());
  if (result.type !== ClarityType.UInt) throw new Error(`unexpected: ${result.type}`);
  return BigInt(result.value);
}

function domainHashFromContract(): string {
  const { result } = simnet.callReadOnlyFn("sip018-spike", "get-domain-hash", [], caller());
  if (result.type !== ClarityType.Buffer) throw new Error(`unexpected: ${result.type}`);
  return normHex(result.value);
}

// Mirrors the contract's domain constant.
const domainCV = (chainId: bigint) =>
  Cl.tuple({
    name: Cl.stringAscii("privara"),
    version: Cl.stringAscii("1"),
    "chain-id": Cl.uint(chainId),
  });

// A representative intent-shaped message (the real field set the router will use).
function intentCV(amount: bigint) {
  const accounts = simnet.getAccounts();
  return Cl.tuple({
    asset: Cl.principal(`${simnet.deployer}.sip010-ft-trait`),
    amount: Cl.uint(amount),
    recipient: Cl.principal(accounts.get("wallet_2")!),
    relayer: Cl.principal(accounts.get("wallet_3")!),
    "relayer-fee": Cl.uint(1000n),
    nonce: Cl.uint(0n),
    expiry: Cl.uint(100n),
  });
}

const structuredDataHash = (cv: Parameters<typeof serializeCVBytes>[0]) =>
  sha256(serializeCVBytes(cv));

const messageDigest = (domainHash: Uint8Array, dataHash: Uint8Array) =>
  sha256(concatBytes(PREFIX, domainHash, dataHash));

describe("sip018-spike", () => {
  it("simnet chain-id is a known SIP-018 chain id", () => {
    const chainId = chainIdFromContract();
    // mainnet = 1, testnet = 2147483648 (0x80000000) per SIP-018
    expect([1n, 2147483648n]).toContain(chainId);
  });

  it("domain hash computed in TypeScript matches the contract", () => {
    const chainId = chainIdFromContract();
    const tsDomainHash = bytesToHex(structuredDataHash(domainCV(chainId)));
    expect(tsDomainHash).toBe(domainHashFromContract());
  });

  it("full SIP-018 message digest matches the contract construction", () => {
    const domainHash = hexToBytes(domainHashFromContract());
    const dataHash = structuredDataHash(intentCV(1_000_000n));
    const tsDigest = bytesToHex(messageDigest(domainHash, dataHash));

    const { result } = simnet.callReadOnlyFn(
      "sip018-spike",
      "message-digest",
      [Cl.buffer(dataHash)],
      caller()
    );
    if (result.type !== ClarityType.Buffer) throw new Error(`unexpected: ${result.type}`);
    expect(tsDigest).toBe(normHex(result.value));
  });

  it("signature produced in TypeScript recovers the signer principal on-chain", () => {
    const domainHash = hexToBytes(domainHashFromContract());
    const dataHash = structuredDataHash(intentCV(1_000_000n));
    const digest = messageDigest(domainHash, dataHash);

    const signature = signMessageHashRsv({
      messageHash: bytesToHex(digest),
      privateKey: SIGNER_KEY,
    });
    expect(hexToBytes(signature).length).toBe(65);

    const expectedSigner = getAddressFromPrivateKey(SIGNER_KEY, "testnet");
    const { result } = simnet.callReadOnlyFn(
      "sip018-spike",
      "recover-signer",
      [Cl.buffer(dataHash), Cl.buffer(hexToBytes(signature))],
      caller()
    );
    expect(result).toBeOk(Cl.principal(expectedSigner));
  });

  it("tampering with a signed field no longer recovers the signer", () => {
    const domainHash = hexToBytes(domainHashFromContract());
    const dataHash = structuredDataHash(intentCV(1_000_000n));
    const digest = messageDigest(domainHash, dataHash);

    const signature = signMessageHashRsv({
      messageHash: bytesToHex(digest),
      privateKey: SIGNER_KEY,
    });

    // Same signature, but the relayer claims a different amount.
    const tamperedHash = structuredDataHash(intentCV(9_999_999n));
    const expectedSigner = getAddressFromPrivateKey(SIGNER_KEY, "testnet");
    const { result } = simnet.callReadOnlyFn(
      "sip018-spike",
      "recover-signer",
      [Cl.buffer(tamperedHash), Cl.buffer(hexToBytes(signature))],
      caller()
    );

    // Recovery either fails outright or yields a different (harmless) principal.
    if (result.type === ClarityType.ResponseOk) {
      expect(result).not.toBeOk(Cl.principal(expectedSigner));
    } else {
      expect(result.type).toBe(ClarityType.ResponseErr);
    }
  });
});
