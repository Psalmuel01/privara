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

export function relayerConfigFromEnv(): RelayerConfig {
  const network = process.env.PRIVARA_NETWORK ?? "testnet";
  if (network !== "testnet" && network !== "mainnet") {
    throw new Error('PRIVARA_NETWORK must be "testnet" or "mainnet"');
  }
  const coreAddress = required("PRIVARA_CORE_ADDRESS");
  return {
    network,
    coreAddress,
    relayerPrivateKey: required("RELAYER_KEY"),
    sponsorPrivateKey: required("SPONSOR_KEY"),
    assetContract: process.env.PRIVARA_ASSET ?? `${coreAddress}.mock-token`,
    tokenName: process.env.PRIVARA_TOKEN_NAME ?? "mock",
    spendContract:
      process.env.PRIVARA_SPEND_CONTRACT ?? `${coreAddress}.privara-sponsored-spend-v2`,
    // The token-fee treasury is intentionally configured separately from the private
    // sponsor key that pays STX; production deployments can isolate those roles.
    feeRecipient: required("PRIVARA_SPONSOR_FEE_RECIPIENT"),
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
