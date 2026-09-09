// Deploy the SIP-010 trait used by the router and sponsored-spend helper.
// Mainnet requires the expected public deployer address plus an explicit broadcast guard.

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
  SIP010_TRAIT_NAME,
  assertDeploymentAuthorized,
  assertExpectedDeployer,
  deploymentFee,
  deploymentSettingsPath,
  explorerTxUrl,
  network,
  stacksNetwork,
} from "./_config";

const CONTRACT_PATH = "contracts/traits/sip010-ft-trait.clar";
const DEPLOYMENT_FEE = deploymentFee(60_000n);
const ACCOUNT_INDEX = Number(process.env.DEPLOYER_ACCOUNT_INDEX ?? "0");
const DRY_RUN = process.env.DRY_RUN === "1";

function readMnemonic(): string {
  const path = deploymentSettingsPath();
  const config = readFileSync(path, "utf8");
  const match = config.match(/^mnemonic\s*=\s*"([^"]+)"/m);
  if (!match || match[1].startsWith("<")) throw new Error(`${path} has no active deployer mnemonic`);
  return match[1];
}

async function main() {
  assertDeploymentAuthorized(DRY_RUN);
  let wallet = await generateWallet({ secretKey: readMnemonic(), password: "" });
  while (wallet.accounts.length <= ACCOUNT_INDEX) wallet = generateNewAccount(wallet);
  const senderKey = wallet.accounts[ACCOUNT_INDEX].stxPrivateKey;
  const deployer = getAddressFromPrivateKey(senderKey, network());
  assertExpectedDeployer(deployer);

  const apiBase = stacksNetwork().client.baseUrl;
  const existing = await fetch(`${apiBase}/v2/contracts/interface/${deployer}/${SIP010_TRAIT_NAME}`);
  if (existing.ok) throw new Error(`${deployer}.${SIP010_TRAIT_NAME} is already deployed`);
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
    contractName: SIP010_TRAIT_NAME,
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
    console.log(`ready: ${deployer}.${SIP010_TRAIT_NAME}, nonce ${account.nonce}, fee ${DEPLOYMENT_FEE} micro-STX`);
    return;
  }
  const result = await broadcastTransaction({ transaction, network: stacksNetwork() });
  if ("error" in result) throw new Error(`${result.error} ${result.reason ?? ""}`.trim());
  console.log(`${SIP010_TRAIT_NAME}: ${result.txid}`);
  console.log(explorerTxUrl(result.txid));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
