// Deploy only the M2 stealth registry to Stacks testnet. Existing M1 contracts are left
// untouched. Uses the same Stacks.js path as the confirmed M1 deployment and never logs
// the mnemonic or private key.

import { readFileSync } from "node:fs";
import { generateNewAccount, generateWallet } from "@stacks/wallet-sdk";
import {
  ClarityVersion,
  broadcastTransaction,
  deserializeTransaction,
  getAddressFromPrivateKey,
  makeContractDeploy,
  serializeTransactionBytes,
} from "@stacks/transactions";
import {
  explorerTxUrl,
  network,
  stacksNetwork,
  STEALTH_REGISTRY_NAME,
} from "./_config";

const CONTRACT_PATH = "contracts/privara-stealth-registry.clar";
const DEPLOYMENT_FEE = 60_000n;
const ACCOUNT_INDEX = Number(process.env.DEPLOYER_ACCOUNT_INDEX ?? "0");
const DRY_RUN = process.env.DRY_RUN === "1";

function readMnemonic(): string {
  const config = readFileSync("settings/Testnet.toml", "utf8");
  const match = config.match(/^mnemonic\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("settings/Testnet.toml has no active deployer mnemonic");
  return match[1];
}

async function main() {
  if (network() !== "testnet") {
    throw new Error("deploy-stealth-registry is testnet-only");
  }
  let wallet = await generateWallet({ secretKey: readMnemonic(), password: "" });
  while (wallet.accounts.length <= ACCOUNT_INDEX) wallet = generateNewAccount(wallet);
  const senderKey = wallet.accounts[ACCOUNT_INDEX].stxPrivateKey;
  const deployer = getAddressFromPrivateKey(senderKey, "testnet");
  const expected = process.env.PRIVARA_DEPLOYER_ADDRESS;
  if (expected && deployer !== expected) {
    throw new Error(`configured deployer ${deployer} does not match ${expected}`);
  }

  const apiBase = stacksNetwork().client.baseUrl;
  const existing = await fetch(
    `${apiBase}/v2/contracts/interface/${deployer}/${STEALTH_REGISTRY_NAME}`
  );
  if (existing.ok) {
    throw new Error(`${deployer}.${STEALTH_REGISTRY_NAME} is already deployed`);
  }
  if (existing.status !== 404) {
    throw new Error(`unable to verify contract availability: HTTP ${existing.status}`);
  }

  const accountResponse = await fetch(`${apiBase}/v2/accounts/${deployer}?proof=0`);
  if (!accountResponse.ok) throw new Error(`unable to fetch deployer nonce: HTTP ${accountResponse.status}`);
  const account = (await accountResponse.json()) as { nonce: number; balance: string };
  if (BigInt(account.balance) < DEPLOYMENT_FEE) {
    throw new Error(`deployer has insufficient STX for the ${DEPLOYMENT_FEE} micro-STX fee`);
  }

  const transaction = await makeContractDeploy({
    contractName: STEALTH_REGISTRY_NAME,
    codeBody: readFileSync(CONTRACT_PATH, "utf8"),
    senderKey,
    network: stacksNetwork(),
    clarityVersion: ClarityVersion.Clarity4,
    fee: DEPLOYMENT_FEE,
    nonce: BigInt(account.nonce),
    postConditionMode: "allow",
  });
  deserializeTransaction(serializeTransactionBytes(transaction));

  if (DRY_RUN) {
    console.log(
      `ready: ${deployer}.${STEALTH_REGISTRY_NAME}, nonce ${account.nonce}, fee ${DEPLOYMENT_FEE} micro-STX`
    );
    return;
  }

  const result = await broadcastTransaction({ transaction, network: stacksNetwork() });
  if ("error" in result) {
    throw new Error(`${result.error} ${result.reason ?? ""}`.trim());
  }
  console.log(`${STEALTH_REGISTRY_NAME}: ${result.txid}`);
  console.log(explorerTxUrl(result.txid));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
