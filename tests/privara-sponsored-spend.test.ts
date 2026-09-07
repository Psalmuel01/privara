import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

declare const simnet: import("@stacks/clarinet-sdk").Simnet;

const accounts = () => simnet.getAccounts();
const origin = () => accounts().get("wallet_1")!;
const destination = () => accounts().get("wallet_2")!;
const treasury = () => accounts().get("wallet_3")!;
const sponsor = () => accounts().get("wallet_4")!;
const token = () => Cl.contractPrincipal(accounts().get("deployer")!, "mock-token");

function mint(amount = 100_000n) {
  return simnet.callPublicFn(
    "mock-token",
    "mint",
    [Cl.uint(amount), Cl.principal(origin())],
    origin()
  );
}

function balance(who: string) {
  return simnet.callReadOnlyFn("mock-token", "get-balance", [Cl.principal(who)], who).result;
}

function spend(
  payment = 40_000n,
  fee = 100n,
  paymentDestination = destination(),
  feeRecipient = treasury()
) {
  return simnet.callPublicFn(
    "privara-sponsored-spend-v2",
    "sponsored-spend",
    [
      token(),
      Cl.principal(paymentDestination),
      Cl.uint(payment),
      Cl.principal(feeRecipient),
      Cl.uint(fee),
      Cl.principal(sponsor()),
    ],
    origin()
  );
}

describe("privara-sponsored-spend", () => {
  it("atomically pays the destination and separate fee treasury from tx-sender", () => {
    expect(mint().result).toBeOk(Cl.uint(100_000));
    expect(spend().result).toBeOk(Cl.uint(40_100));
    expect(balance(origin())).toBeOk(Cl.uint(59_900));
    expect(balance(destination())).toBeOk(Cl.uint(40_000));
    expect(balance(treasury())).toBeOk(Cl.uint(100));
  });

  it("supports a full-balance withdrawal net of the sponsor fee", () => {
    mint();
    expect(spend(99_900n, 100n).result).toBeOk(Cl.uint(100_000));
    expect(balance(origin())).toBeOk(Cl.uint(0));
    expect(balance(destination())).toBeOk(Cl.uint(99_900));
    expect(balance(treasury())).toBeOk(Cl.uint(100));
  });

  it("rolls back the payment when the fee transfer cannot be funded", () => {
    mint(40_000n);
    expect(spend(40_000n, 100n).result).toBeErr(Cl.uint(1));
    expect(balance(origin())).toBeOk(Cl.uint(40_000));
    expect(balance(destination())).toBeOk(Cl.uint(0));
    expect(balance(treasury())).toBeOk(Cl.uint(0));
  });

  it("rejects zero payment or fee", () => {
    mint();
    expect(spend(0n, 100n).result).toBeErr(Cl.uint(400));
    expect(spend(100n, 0n).result).toBeErr(Cl.uint(401));
  });

  it("rejects self-payment and invalid fee destinations", () => {
    mint();
    expect(spend(100n, 10n, origin()).result).toBeErr(Cl.uint(402));
    expect(spend(100n, 10n, destination(), origin()).result).toBeErr(Cl.uint(403));
    expect(spend(100n, 10n, destination(), destination()).result).toBeErr(Cl.uint(403));
  });
});
