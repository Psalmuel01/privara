// Print only the public deployer address derived from the chain-specific settings file.
// The mnemonic and private key are never logged.

import { readFileSync } from "node:fs";
import { generateNewAccount, generateWallet } from "@stacks/wallet-sdk";
import { getAddressFromPrivateKey } from "@stacks/transactions";
import { deploymentSettingsPath, network } from "./_config";

async function main() {
  const path = deploymentSettingsPath();
  const config = readFileSync(path, "utf8");
  const match = config.match(/^mnemonic\s*=\s*"([^"]+)"/m);
  if (!match || match[1].startsWith("<")) throw new Error(`${path} has no active deployer mnemonic`);
  const accountIndex = Number(process.env.DEPLOYER_ACCOUNT_INDEX ?? "0");
  let wallet = await generateWallet({ secretKey: match[1], password: "" });
  while (wallet.accounts.length <= accountIndex) wallet = generateNewAccount(wallet);
  console.log(getAddressFromPrivateKey(wallet.accounts[accountIndex].stxPrivateKey, network()));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
