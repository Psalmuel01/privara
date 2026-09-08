import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createRelayerHttpServer } from "../relayer/src/server";
import { PrivaraRelayerService, type RelayerConfig } from "../relayer/src/service";

const CORE = "ST000000000000000000002AMW42H";
const ROUTER = `${CORE}.privara-router-m2-sbtc`;
const KEY = "530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101";
const config: RelayerConfig = {
  network: "testnet",
  coreAddress: CORE,
  routerContract: ROUTER,
  relayerPrivateKey: KEY,
  sponsorPrivateKey: KEY,
  assetContract: `${CORE}.mock-token`,
  tokenName: "mock",
  spendContract: `${CORE}.privara-sponsored-spend-v2`,
  feeRecipient: "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG",
  exactTokenSponsorFee: 100n,
  maxIntentAmount: 1_000_000n,
  maxRelayerFeeBps: 100,
  maxSweepAmount: 1_000_000n,
  maxSponsorFee: 10_000n,
  maxTransactionBytes: 4_096,
  sponsorshipsPerWindow: 10,
  sponsorshipWindowMs: 60_000,
};

const servers: ReturnType<typeof createRelayerHttpServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function endpoint() {
  const server = createRelayerHttpServer(new PrivaraRelayerService(config), {
    allowedOrigins: ["https://app.privara.test"],
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("relayer HTTP production adapter", () => {
  it("publishes browser-safe public configuration with explicit CORS", async () => {
    const base = await endpoint();
    const response = await fetch(`${base}/v1/config`, {
      headers: { origin: "https://app.privara.test" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.privara.test");
    await expect(response.json()).resolves.toMatchObject({
      version: 1,
      network: "testnet",
      router: ROUTER,
      settlementFeeBps: 100,
      sponsorFee: "100",
    });
  });

  it("handles preflight and rejects unapproved browser origins", async () => {
    const base = await endpoint();
    const preflight = await fetch(`${base}/v1/intents/settle`, {
      method: "OPTIONS",
      headers: { origin: "https://app.privara.test" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    const rejected = await fetch(`${base}/health`, {
      headers: { origin: "https://evil.test" },
    });
    expect(rejected.status).toBe(403);
  });
});
