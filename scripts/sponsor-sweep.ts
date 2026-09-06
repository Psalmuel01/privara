// Relayer half of a sponsored sweep. This process receives only the origin-signed
// transaction, applies strict policy, signs the sponsor section, and broadcasts.

import { readFileSync } from "node:fs";
import { generateNewAccount, generateWallet } from "@stacks/wallet-sdk";
import {
  AuthType,
  broadcastTransaction,
  deserializeTransaction,
  sponsorTransaction,
} from "@stacks/transactions";
import { validateSponsoredSweep } from "../sdk/src";
import { explorerTxUrl, stacksNetwork } from "./_config";

const CORE = process.env.PRIVARA_CORE_ADDRESS;
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
  const transaction = deserializeTransaction(envelope.originSignedTransaction);
  const validated = validateSponsoredSweep(transaction, {
    network: "testnet",
    assetContract: `${CORE}.mock-token`,
    tokenName: "mock",
    maxAmount: BigInt(process.env.PRIVARA_MAX_SWEEP_AMOUNT ?? "1000000"),
    maxTransactionBytes: Number(process.env.PRIVARA_MAX_SPONSOR_TX_BYTES ?? "4096"),
  });

  let wallet = await generateWallet({ secretKey: mnemonic(), password: "" });
  while (wallet.accounts.length < 3) wallet = generateNewAccount(wallet);
  const sponsorPrivateKey = wallet.accounts[2].stxPrivateKey;
  const sponsored = await sponsorTransaction({
    transaction,
    sponsorPrivateKey,
    network: stacksNetwork(),
  });
  if (sponsored.auth.authType !== AuthType.Sponsored) {
    throw new Error("Stacks.js did not produce sponsored authorization");
  }
  const fee = sponsored.auth.sponsorSpendingCondition.fee;
  if (fee > MAX_FEE) throw new Error(`estimated sponsor fee ${fee} exceeds maximum ${MAX_FEE}`);

  console.log(`Policy accepted: ${validated.amount} MOCK`);
  console.log(`Origin: ${validated.origin}`);
  console.log(`Destination: ${validated.destination}`);
  console.log(`Sponsor fee: ${fee} micro-STX`);
  const result = await broadcastTransaction({ transaction: sponsored, network: stacksNetwork() });
  if ("error" in result) {
    throw new Error(`broadcast failed: ${result.error} ${result.reason ?? ""}`.trim());
  }
  console.log(`Broadcast: ${result.txid}`);
  console.log(explorerTxUrl(result.txid));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
