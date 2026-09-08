// Deploy an M2 router variant without changing any confirmed deployment.
// Both the SIP-010 asset and router principal are compile-time constants, so this
// script rewrites the audited base source and verifies every expected replacement.

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
} from "./_config";

const CONTRACT_PATH = "contracts/privara-router-m2.clar";
const BASE_ROUTER_NAME = "privara-router-m2";
const CONTRACT_NAME = process.env.PRIVARA_ROUTER_NAME ?? BASE_ROUTER_NAME;
const ASSET_CONTRACT = process.env.PRIVARA_ASSET;
const DEPLOYMENT_FEE = 100_000n;
const ACCOUNT_INDEX = Number(process.env.DEPLOYER_ACCOUNT_INDEX ?? "0");
const DRY_RUN = process.env.DRY_RUN === "1";

function readMnemonic(): string {
  const config = readFileSync("settings/Testnet.toml", "utf8");
  const match = config.match(/^mnemonic\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("settings/Testnet.toml has no active deployer mnemonic");
  return match[1];
}

async function main() {
  if (network() !== "testnet") throw new Error("deploy-router-m2 is testnet-only");

  let wallet = await generateWallet({ secretKey: readMnemonic(), password: "" });
  while (wallet.accounts.length <= ACCOUNT_INDEX) wallet = generateNewAccount(wallet);
  const senderKey = wallet.accounts[ACCOUNT_INDEX].stxPrivateKey;
  const deployer = getAddressFromPrivateKey(senderKey, "testnet");
  const expected = process.env.PRIVARA_DEPLOYER_ADDRESS;
  if (expected && deployer !== expected) {
    throw new Error(`configured deployer ${deployer} does not match ${expected}`);
  }

  const apiBase = stacksNetwork().client.baseUrl;
  const existing = await fetch(`${apiBase}/v2/contracts/interface/${deployer}/${CONTRACT_NAME}`);
  if (existing.ok) throw new Error(`${deployer}.${CONTRACT_NAME} is already deployed`);
  if (existing.status !== 404) {
    throw new Error(`unable to verify contract availability: HTTP ${existing.status}`);
  }

  const accountResponse = await fetch(`${apiBase}/v2/accounts/${deployer}?proof=0`);
  if (!accountResponse.ok) throw new Error(`unable to fetch deployer nonce: HTTP ${accountResponse.status}`);
  const account = (await accountResponse.json()) as { nonce: number; balance: string };
  if (BigInt(account.balance) < DEPLOYMENT_FEE) {
    throw new Error(`deployer has insufficient STX for the ${DEPLOYMENT_FEE} micro-STX fee`);
  }

  let codeBody = readFileSync(CONTRACT_PATH, "utf8");
  if (CONTRACT_NAME !== BASE_ROUTER_NAME) {
    codeBody = codeBody.replaceAll(`.${BASE_ROUTER_NAME}`, `.${CONTRACT_NAME}`);
  }
  if (ASSET_CONTRACT) {
    if (!/^[A-Z0-9]+\.[a-zA-Z0-9_-]+$/.test(ASSET_CONTRACT)) {
      throw new Error("PRIVARA_ASSET must be a contract principal");
    }
    const marker = "(define-constant SBTC .mock-token)";
    if (!codeBody.includes(marker)) throw new Error("base router asset marker was not found");
    codeBody = codeBody.replace(marker, `(define-constant SBTC '${ASSET_CONTRACT})`);
  }
  if (!codeBody.includes(`router: .${CONTRACT_NAME}`)) {
    throw new Error("router signing domain was not rebound to the deployment name");
  }

  const transaction = await makeContractDeploy({
    contractName: CONTRACT_NAME,
    codeBody,
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
      `ready: ${deployer}.${CONTRACT_NAME}, asset ${ASSET_CONTRACT ?? `${deployer}.mock-token`}, nonce ${account.nonce}, fee ${DEPLOYMENT_FEE} micro-STX`
    );
    return;
  }

  const result = await broadcastTransaction({ transaction, network: stacksNetwork() });
  if ("error" in result) throw new Error(`${result.error} ${result.reason ?? ""}`.trim());
  console.log(`${CONTRACT_NAME}: ${result.txid}`);
  console.log(explorerTxUrl(result.txid));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
