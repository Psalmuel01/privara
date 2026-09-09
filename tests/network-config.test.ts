import { describe, expect, it } from "vitest";
import {
  defaultStacksApiUrl,
  explorerTransactionUrl,
  parsePrivaraNetwork,
  stacksAddressPrefix,
} from "../app/src/config/network";

describe("app network configuration", () => {
  it("keeps testnet as the explicit development default", () => {
    expect(parsePrivaraNetwork(undefined)).toBe("testnet");
    expect(stacksAddressPrefix("testnet")).toBe("ST");
    expect(defaultStacksApiUrl("testnet")).toBe("https://api.testnet.hiro.so");
  });

  it("selects only mainnet addresses, API, and explorer links on mainnet", () => {
    expect(parsePrivaraNetwork("mainnet")).toBe("mainnet");
    expect(stacksAddressPrefix("mainnet")).toBe("SP");
    expect(defaultStacksApiUrl("mainnet")).toBe("https://api.hiro.so");
    expect(explorerTransactionUrl("mainnet", "0xabc")).toBe(
      "https://explorer.hiro.so/txid/0xabc?chain=mainnet"
    );
  });

  it("rejects unknown network names instead of silently falling back", () => {
    expect(() => parsePrivaraNetwork("main-net")).toThrow(/must be/);
  });
});
