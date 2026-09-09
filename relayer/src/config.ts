import type { RelayerConfig } from "./service";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(name: string, fallback: string): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

function positiveBigInt(name: string, fallback: string): bigint {
  const value = BigInt(process.env[name] ?? fallback);
  if (value <= 0n) throw new Error(`${name} must be positive`);
  return value;
}

function principalForNetwork(name: string, value: string, network: "testnet" | "mainnet"): string {
  const address = value.split(".", 1)[0];
  const valid = network === "mainnet"
    ? address.startsWith("SP") || address.startsWith("SM")
    : address.startsWith("ST") || address.startsWith("SN");
  if (!valid) throw new Error(`${name} is not a Stacks ${network} principal`);
  return value;
}

export function relayerConfigFromEnv(): RelayerConfig {
  const network = process.env.PRIVARA_NETWORK ?? "testnet";
  if (network !== "testnet" && network !== "mainnet") {
    throw new Error('PRIVARA_NETWORK must be "testnet" or "mainnet"');
  }
  const coreAddress = principalForNetwork("PRIVARA_CORE_ADDRESS", required("PRIVARA_CORE_ADDRESS"), network);
  const routerContract = principalForNetwork(
    "PRIVARA_ROUTER",
    process.env.PRIVARA_ROUTER ?? `${coreAddress}.privara-router-m2`,
    network
  );
  const assetContract = principalForNetwork(
    "PRIVARA_ASSET",
    process.env.PRIVARA_ASSET ?? `${coreAddress}.mock-token`,
    network
  );
  const spendContract = principalForNetwork(
    "PRIVARA_SPEND_CONTRACT",
    process.env.PRIVARA_SPEND_CONTRACT ?? `${coreAddress}.privara-sponsored-spend-v2`,
    network
  );
  return {
    network,
    coreAddress,
    routerContract,
    relayerPrivateKey: required("RELAYER_KEY"),
    sponsorPrivateKey: required("SPONSOR_KEY"),
    assetContract,
    tokenName: process.env.PRIVARA_TOKEN_NAME ?? "mock",
    spendContract,
    // The token-fee treasury is intentionally configured separately from the private
    // sponsor key that pays STX; production deployments can isolate those roles.
    feeRecipient: principalForNetwork(
      "PRIVARA_SPONSOR_FEE_RECIPIENT",
      required("PRIVARA_SPONSOR_FEE_RECIPIENT"),
      network
    ),
    exactTokenSponsorFee: positiveBigInt("PRIVARA_TOKEN_SPONSOR_FEE", "100"),
    maxIntentAmount: positiveBigInt("PRIVARA_MAX_INTENT_AMOUNT", "100000000"),
    maxRelayerFeeBps: positiveInteger("PRIVARA_MAX_RELAYER_FEE_BPS", "100"),
    maxSweepAmount: positiveBigInt("PRIVARA_MAX_SWEEP_AMOUNT", "100000000"),
    maxSponsorFee: positiveBigInt("PRIVARA_MAX_SPONSOR_FEE", "10000"),
    maxTransactionBytes: positiveInteger("PRIVARA_MAX_SPONSOR_TX_BYTES", "4096"),
    sponsorshipsPerWindow: positiveInteger("PRIVARA_SPONSOR_RATE_LIMIT", "10"),
    sponsorshipWindowMs: positiveInteger("PRIVARA_SPONSOR_RATE_WINDOW_MS", "60000"),
    stacksApiUrl: process.env.STACKS_API_URL,
  };
}
