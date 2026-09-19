import { afterEach, describe, expect, it, vi } from "vitest";
import { relayerConfigFromEnv } from "../relayer/src/config";

const MAINNET_CORE = "SP000000000000000000002Q6VF78";

function mainnetEnv() {
  vi.stubEnv("PRIVARA_NETWORK", "mainnet");
  vi.stubEnv("PRIVARA_CORE_ADDRESS", MAINNET_CORE);
  vi.stubEnv("PRIVARA_ROUTER", `${MAINNET_CORE}.privara-router-m2-sbtc`);
  vi.stubEnv("PRIVARA_ASSET", "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token");
  vi.stubEnv("PRIVARA_SPEND_CONTRACT", `${MAINNET_CORE}.privara-sponsored-spend-v2`);
  vi.stubEnv("PRIVARA_SPONSOR_FEE_RECIPIENT", MAINNET_CORE);
  vi.stubEnv("RELAYER_KEY", "relayer-secret-placeholder");
  vi.stubEnv("SPONSOR_KEY", "sponsor-secret-placeholder");
}

afterEach(() => vi.unstubAllEnvs());

describe("relayer network isolation", () => {
  it("accepts an internally consistent mainnet configuration", () => {
    mainnetEnv();
    const config = relayerConfigFromEnv();
    expect(config.network).toBe("mainnet");
    expect(config.assetContract).toBe(
      "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token"
    );
  });

  it("rejects a testnet contract in a mainnet service", () => {
    mainnetEnv();
    vi.stubEnv("PRIVARA_ASSET", "ST000000000000000000002AMW42H.mock-token");
    expect(() => relayerConfigFromEnv()).toThrow("not a Stacks mainnet principal");
  });

  it("enables canonical USDCx only when its dedicated router is configured", () => {
    mainnetEnv();
    expect(relayerConfigFromEnv().additionalSip010Assets).toEqual([]);
    vi.stubEnv("PRIVARA_USDCX_ROUTER", `${MAINNET_CORE}.privara-router-m2-usdcx`);
    const [usdcx] = relayerConfigFromEnv().additionalSip010Assets!;
    expect(usdcx).toMatchObject({
      id: "usdcx",
      routerContract: `${MAINNET_CORE}.privara-router-m2-usdcx`,
      assetContract: "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx",
      tokenName: "usdcx-token",
      decimals: 6,
      exactTokenSponsorFee: 200_000n,
    });
  });
});
