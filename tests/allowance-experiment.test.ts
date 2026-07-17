import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

// THROWAWAY: resolves the R1 question — does a with-ft allowance list accept a
// DYNAMIC (trait-parameter) contract principal at runtime, or only literals?
// A/B/C control: same transfer to a distinct recipient three ways, only the
// allowance form differs. (Recipient must not equal sender: ft-transfer? returns
// (err u2) on a self-transfer, which would mask the allowance outcome.)
declare const simnet: import("@stacks/clarinet-sdk").Simnet;

const deployer = () => simnet.deployer;
const wallet1 = () => simnet.getAccounts().get("wallet_1")!;
const wallet2 = () => simnet.getAccounts().get("wallet_2")!;
const mockToken = () => `${deployer()}.mock-token`;

// Fund the experiment contract fresh before each call so the as-contract?
// transfer always has balance to move.
function fund(amount: bigint) {
  const experiment = `${deployer()}.allowance-experiment`;
  simnet.callPublicFn(
    "mock-token",
    "mint",
    [Cl.uint(amount), Cl.principal(experiment)],
    wallet1()
  );
}

function run(fn: string, amount: bigint) {
  fund(1_000_000n);
  const { result } = simnet.callPublicFn(
    "allowance-experiment",
    fn,
    [Cl.principal(mockToken()), Cl.uint(amount), Cl.principal(wallet2())],
    wallet1()
  );
  return result;
}

describe("allowance-experiment: dynamic vs literal principal in with-ft", () => {
  it("baseline: with-all-assets-unsafe transfer succeeds (mechanics work)", () => {
    expect(run("try-unsafe", 1000n)).toBeOk(Cl.bool(true));
  });

  it("control: with-ft keyed on a LITERAL principal succeeds", () => {
    expect(run("try-literal-principal", 1000n)).toBeOk(Cl.bool(true));
  });

  it("subject: with-ft keyed on a DYNAMIC trait-parameter principal succeeds", () => {
    // The result of THIS test is the R1 answer: if this is (ok true), a dynamic
    // (contract-of asset) principal IS honored by the allowance list at runtime,
    // so settle-intent can drop with-all-assets-unsafe for a scoped with-ft.
    expect(run("try-dynamic-principal", 1000n)).toBeOk(Cl.bool(true));
  });
});
