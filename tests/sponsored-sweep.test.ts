import { afterEach, describe, expect, it, vi } from "vitest";
import { utils } from "@noble/secp256k1";
import {
  AuthType,
  Cl,
  PostConditionMode,
  deserializeTransaction,
  getAddressFromPrivateKey,
  makeContractCall,
  serializeTransaction,
  sponsorTransaction,
} from "@stacks/transactions";
import { bytesToHex } from "@stacks/common";
import { buildSponsoredSweep, validateSponsoredSweep } from "../sdk/src";

const ASSET = "ST000000000000000000002AMW42H.mock-token";
const DESTINATION = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const SPONSOR_KEY =
  "530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101";
const AMOUNT = 99_000n;
const ORIGIN_KEY = bytesToHex(new Uint8Array(32).fill(1));
const policy = {
  network: "testnet" as const,
  assetContract: ASSET,
  tokenName: "mock",
  maxAmount: 1_000_000n,
  maxTransactionBytes: 4_096,
};

async function validTransaction() {
  return buildSponsoredSweep({
    assetContract: ASSET,
    tokenName: "mock",
    destination: DESTINATION,
    amount: AMOUNT,
    stealthPrivateKey: ORIGIN_KEY,
    network: "testnet",
    nonce: 0n,
  });
}

describe("sponsored stealth sweep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the origin nonce when the caller omits it", async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: async () => ({ possible_next_nonce: "0" }),
    });
    vi.stubGlobal("fetch", fetch);

    const transaction = await buildSponsoredSweep({
      assetContract: ASSET,
      tokenName: "mock",
      destination: DESTINATION,
      amount: AMOUNT,
      stealthPrivateKey: ORIGIN_KEY,
      network: "testnet",
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0][0])).toContain("/nonces");
    expect(validateSponsoredSweep(transaction, policy).amount).toBe(AMOUNT);
  });

  it("builds a valid origin-signed sponsored SIP-010 transfer", async () => {
    const transaction = await validTransaction();
    expect(transaction.auth.authType).toBe(AuthType.Sponsored);
    const validated = validateSponsoredSweep(transaction, policy);
    expect(validated.amount).toBe(AMOUNT);
    expect(validated.destination).toBe(DESTINATION);
    expect(validated.origin).toBe(
      getAddressFromPrivateKey(ORIGIN_KEY, "testnet")
    );
  });

  it("survives serialization and accepts a separate sponsor signature", async () => {
    const originSigned = await validTransaction();
    const transported = deserializeTransaction(serializeTransaction(originSigned));
    const validated = validateSponsoredSweep(transported, policy);
    const sponsored = await sponsorTransaction({
      transaction: transported,
      sponsorPrivateKey: SPONSOR_KEY,
      sponsorNonce: 7n,
      fee: 1_000n,
      network: "testnet",
    });
    expect(sponsored.auth.authType).toBe(AuthType.Sponsored);
    expect(sponsored.verifyOrigin()).toBeTruthy();
    expect(validated.amount).toBe(AMOUNT);
  });

  it("rejects excessive amounts", async () => {
    const transaction = await validTransaction();
    expect(() =>
      validateSponsoredSweep(transaction, { ...policy, maxAmount: AMOUNT - 1n })
    ).toThrow("exceeds sponsor policy");
  });

  it("rejects a different token contract or method", async () => {
    const key = bytesToHex(utils.randomPrivateKey());
    const origin = getAddressFromPrivateKey(key, "testnet");
    const transaction = await makeContractCall({
      contractAddress: "ST000000000000000000002AMW42H",
      contractName: "other-token",
      functionName: "mint",
      functionArgs: [Cl.uint(AMOUNT), Cl.principal(origin)],
      senderKey: key,
      sponsored: true,
      fee: 0n,
      nonce: 0n,
      network: "testnet",
      postConditionMode: "deny",
    });
    expect(() => validateSponsoredSweep(transaction, policy)).toThrow("disallowed");
  });

  it("rejects allow mode or missing exact post-condition", async () => {
    const transaction = await validTransaction();
    transaction.postConditionMode = PostConditionMode.Allow;
    expect(() => validateSponsoredSweep(transaction, policy)).toThrow("deny post-condition");

    const second = await validTransaction();
    second.postConditions.values.length = 0;
    expect(() => validateSponsoredSweep(second, policy)).toThrow("exactly one post-condition");
  });
});
