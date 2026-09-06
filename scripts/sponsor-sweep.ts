// Relayer half of a sponsored sweep. This process receives only the origin-signed
// transaction, applies strict policy, signs the sponsor section, and broadcasts.

import { readFileSync } from "node:fs";
import { generateNewAccount, generateWallet } from "@stacks/wallet-sdk";
import { PrivaraRelayerService } from "../relayer/src/service";
import { explorerTxUrl, stacksNetwork } from "./_config";

const CORE = process.env.PRIVARA_CORE_ADDRESS ?? "";
if (!CORE) throw new Error("PRIVARA_CORE_ADDRESS is required");
const MAX_FEE = BigInt(process.env.PRIVARA_MAX_SPONSOR_FEE ?? "10000");

interface SweepEnvelope {
  originSignedTransaction: string;
}

function mnemonic(): string {
  const config = readFileSync("settings/Testnet.toml", "utf8");
  const match = config.match(/^mnemonic\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("settings/Testnet.toml has no active deployer mnemonic");
  return match[1];
}

async function main() {
  const path = process.argv[2] ?? "sponsored-sweep.json";
  const envelope = JSON.parse(readFileSync(path, "utf8")) as SweepEnvelope;
  let wallet = await generateWallet({ secretKey: mnemonic(), password: "" });
  while (wallet.accounts.length < 3) wallet = generateNewAccount(wallet);
  const sponsorPrivateKey = wallet.accounts[2].stxPrivateKey;
  const result = await new PrivaraRelayerService({
    network: "testnet",
    coreAddress: CORE,
    relayerPrivateKey: sponsorPrivateKey,
    sponsorPrivateKey,
    assetContract: `${CORE}.mock-token`,
    tokenName: "mock",
    maxIntentAmount: 100_000_000n,
    maxRelayerFeeBps: 100,
    maxSweepAmount: BigInt(process.env.PRIVARA_MAX_SWEEP_AMOUNT ?? "1000000"),
    maxSponsorFee: MAX_FEE,
    maxTransactionBytes: Number(process.env.PRIVARA_MAX_SPONSOR_TX_BYTES ?? "4096"),
    sponsorshipsPerWindow: 10,
    sponsorshipWindowMs: 60_000,
    stacksApiUrl: stacksNetwork().client.baseUrl,
  }).sponsorSweep(envelope);

  console.log(`Policy accepted: ${result.amount} MOCK`);
  console.log(`Origin: ${result.origin}`);
  console.log(`Destination: ${result.destination}`);
  console.log(`Sponsor fee: ${result.sponsorFee} micro-STX`);
  console.log(`Broadcast: ${result.txid}`);
  console.log(explorerTxUrl(result.txid));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
