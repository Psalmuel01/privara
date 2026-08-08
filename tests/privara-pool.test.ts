import { describe, expect, it } from "vitest";
import { Cl, ClarityType, serializeCVBytes, signMessageHashRsv } from "@stacks/transactions";
import { bytesToHex, hexToBytes } from "@stacks/common";
import { sha256 } from "@noble/hashes/sha256";

// simnet is available globally via vitest-environment-clarinet
declare const simnet: import("@stacks/clarinet-sdk").Simnet;

const normHex = (s: string) => s.replace(/^0x/, "");
const accounts = () => simnet.getAccounts();
const deployer = () => simnet.deployer;
const mockToken = () => `${deployer()}.mock-token`;

// The coordinator key whose compressed pubkey is hardcoded as COORDINATOR_PUBKEY in
// the pool contract (Clarinet wallet_1). In production the coordinator blind-signs so it
// never sees the commitment in the clear; here we sign directly to exercise the on-chain
// verification path.
const COORDINATOR_KEY =
  "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801";

const payer = () => accounts().get("wallet_2")!;
const relayer = () => accounts().get("wallet_3")!;
const recipient = () => accounts().get("wallet_4")!;

const DENOMINATION = 100000n;

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// C = sha256(secret || amount) -- the payer's deposit commitment.
function commitmentFor(secret: Uint8Array, amount: bigint): Uint8Array {
  return sha256(concatBytes(secret, serializeCVBytes(Cl.uint(amount))));
}

// nullifier = sha256(secret).
function nullifierFor(secret: Uint8Array): Uint8Array {
  return sha256(secret);
}

// The coordinator signs sha256(commitment || consensus(recipient)); the contract
// recovers the signer from this exact message. consensus(principal) == serializeCVBytes.
function attest(commitment: Uint8Array, recipientPrincipal: string): Uint8Array {
  const msg = sha256(concatBytes(commitment, serializeCVBytes(Cl.principal(recipientPrincipal))));
  return hexToBytes(signMessageHashRsv({ messageHash: bytesToHex(msg), privateKey: COORDINATOR_KEY }));
}

function mint(to: string, amount: bigint) {
  simnet.callPublicFn("mock-token", "mint", [Cl.uint(amount), Cl.principal(to)], deployer());
}

function deposit(commitment: Uint8Array, from: string) {
  return simnet.callPublicFn(
    "privara-pool",
    "deposit",
    [Cl.principal(mockToken()), Cl.buffer(commitment), Cl.uint(DENOMINATION)],
    from
  );
}

function withdraw(
  commitment: Uint8Array,
  nullifier: Uint8Array,
  recipientPrincipal: string,
  attestation: Uint8Array,
  caller: string
) {
  return simnet.callPublicFn(
    "privara-pool",
    "withdraw",
    [
      Cl.principal(mockToken()),
      Cl.buffer(commitment),
      Cl.buffer(nullifier),
      Cl.principal(recipientPrincipal),
      Cl.buffer(attestation),
    ],
    caller
  );
}

const SECRET = hexToBytes("11".repeat(32));

describe("privara-pool: attested commitment/nullifier flow", () => {
  it("deposits a commitment for exactly the denomination", () => {
    const c = commitmentFor(SECRET, DENOMINATION);
    mint(payer(), DENOMINATION);
    const { result } = deposit(c, payer());
    expect(result.type).toBe(ClarityType.ResponseOk);

    const { result: exists } = simnet.callReadOnlyFn(
      "privara-pool", "commitment-exists", [Cl.buffer(c)], payer()
    );
    expect(exists).toStrictEqual(Cl.bool(true));
  });

  it("rejects a deposit that is not the exact denomination", () => {
    const c = commitmentFor(hexToBytes("22".repeat(32)), DENOMINATION);
    mint(payer(), DENOMINATION + 1n);
    const { result } = simnet.callPublicFn(
      "privara-pool", "deposit",
      [Cl.principal(mockToken()), Cl.buffer(c), Cl.uint(DENOMINATION + 1n)],
      payer()
    );
    expect(result).toStrictEqual(Cl.error(Cl.uint(208))); // ERR_WRONG_AMOUNT
  });

  it("withdraws to the attested recipient and burns the nullifier", () => {
    const c = commitmentFor(SECRET, DENOMINATION);
    const n = nullifierFor(SECRET);
    mint(payer(), DENOMINATION);
    deposit(c, payer());

    const att = attest(c, recipient());
    // The relayer (not the payer) submits the withdrawal -- payer identity is not present.
    const { result } = withdraw(c, n, recipient(), att, relayer());
    expect(result).toStrictEqual(Cl.ok(Cl.uint(DENOMINATION)));

    const { result: spent } = simnet.callReadOnlyFn(
      "privara-pool", "is-nullifier-spent", [Cl.buffer(n)], relayer()
    );
    expect(spent).toStrictEqual(Cl.bool(true));

    // Recipient actually received the denomination.
    const { result: bal } = simnet.callReadOnlyFn(
      "mock-token", "get-balance", [Cl.principal(recipient())], relayer()
    );
    expect(bal).toStrictEqual(Cl.ok(Cl.uint(DENOMINATION)));
  });

  it("rejects a replayed nullifier (double-spend)", () => {
    const c = commitmentFor(SECRET, DENOMINATION);
    const n = nullifierFor(SECRET);
    mint(payer(), DENOMINATION);
    deposit(c, payer());
    const att = attest(c, recipient());
    withdraw(c, n, recipient(), att, relayer());

    const { result } = withdraw(c, n, recipient(), att, relayer());
    expect(result).toStrictEqual(Cl.error(Cl.uint(203))); // ERR_NULLIFIER_USED
  });

  it("rejects a forged attestation (not from the coordinator)", () => {
    const c = commitmentFor(SECRET, DENOMINATION);
    const n = nullifierFor(SECRET);
    mint(payer(), DENOMINATION);
    deposit(c, payer());

    // Sign with a non-coordinator key -> recovers a different pubkey.
    const forgedMsg = sha256(concatBytes(c, serializeCVBytes(Cl.principal(recipient()))));
    const forged = hexToBytes(signMessageHashRsv({
      messageHash: bytesToHex(forgedMsg),
      privateKey: "a5".repeat(31) + "01",
    }));
    const { result } = withdraw(c, n, recipient(), forged, relayer());
    expect(result).toStrictEqual(Cl.error(Cl.uint(204))); // ERR_BAD_ATTESTATION
  });

  it("rejects an attestation aimed at a different recipient (relayer can't redirect)", () => {
    const c = commitmentFor(SECRET, DENOMINATION);
    const n = nullifierFor(SECRET);
    mint(payer(), DENOMINATION);
    deposit(c, payer());

    // Coordinator attested `recipient()`, but the relayer tries to pay itself.
    const att = attest(c, recipient());
    const { result } = withdraw(c, n, relayer(), att, relayer());
    expect(result).toStrictEqual(Cl.error(Cl.uint(204))); // ERR_BAD_ATTESTATION
  });

  it("rejects withdrawal for an unknown commitment", () => {
    const c = commitmentFor(SECRET, DENOMINATION);
    const n = nullifierFor(SECRET);
    // No deposit made.
    const att = attest(c, recipient());
    const { result } = withdraw(c, n, recipient(), att, relayer());
    expect(result).toStrictEqual(Cl.error(Cl.uint(202))); // ERR_UNKNOWN_COMMITMENT
  });
});
