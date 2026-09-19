import { describe, expect, it, vi } from "vitest";
import {
  assertBnsResolutionUnchanged,
  isBnsName,
  resolveMainnetRecipient,
} from "../sdk/src";

const ADDRESS = "SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE";
const OTHER = "SP000000000000000000002Q6VF78";

describe("BNSv2 recipient resolution", () => {
  it("accepts a mainnet address without making a network request", async () => {
    const fetcher = vi.fn();
    await expect(resolveMainnetRecipient(ADDRESS, { fetcher })).resolves.toEqual({
      identifier: ADDRESS,
      address: ADDRESS,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves a BNS name and retains both the name and exact address", async () => {
    const fetcher = vi.fn(async () => Response.json({ owner: ADDRESS })) as typeof fetch;
    await expect(resolveMainnetRecipient("Samuel.BTC", { fetcher })).resolves.toEqual({
      identifier: "samuel.btc",
      bnsName: "samuel.btc",
      address: ADDRESS,
    });
    expect(isBnsName("samuel.btc")).toBe(true);
  });

  it("stops submission when a reviewed BNS name changes owners", async () => {
    await expect(assertBnsResolutionUnchanged(
      { identifier: "samuel.btc", bnsName: "samuel.btc", address: ADDRESS },
      { fetcher: vi.fn(async () => Response.json({ owner: OTHER })) as typeof fetch }
    )).rejects.toThrow("changed owners");
  });

  it("rejects malformed and non-mainnet lookup results", async () => {
    await expect(resolveMainnetRecipient("samuel.btc", {
      fetcher: vi.fn(async () => Response.json({ owner: "ST000000000000000000002AMW42H" })) as typeof fetch,
    })).rejects.toThrow("mainnet");
  });
});
