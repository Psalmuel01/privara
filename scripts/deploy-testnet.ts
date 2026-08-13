// Deploy the Milestone 1 contracts to Stacks testnet using Stacks.js.
//
// Clarinet 3.23.1 currently produces a transaction body that the public testnet
// endpoint rejects with `unrecognized auth flags 189`. This script uses the same
// account and fees from the deployment plan, but serializes and broadcasts with
// @stacks/transactions. It never prints the mnemonic or derived private key.

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
import { explorerTxUrl, stacksNetwork } from "./_config";

const DEPLOYER_ACCOUNT_INDEX = Number(process.env.DEPLOYER_ACCOUNT_INDEX ?? "0");
const EXPECTED_DEPLOYER = process.env.PRIVARA_DEPLOYER_ADDRESS;

const contracts = [
  {
    name: "sip010-ft-trait",
    path: "contracts/traits/sip010-ft-trait.clar",
    fee: 4_390n,
  },
  {
    name: "mock-token",
    path: "contracts/tokens/mock-token.clar",
    fee: 19_180n,
  },
  {
    name: "privara-registry",
    path: "contracts/privara-registry.clar",
    fee: 24_540n,
  },
  {
    name: "privara-router",
    path: "contracts/privara-router.clar",
    fee: 132_290n,
  },
] as const;

function readTestnetMnemonic(): string {
  const config = readFileSync("settings/Testnet.toml", "utf8");
  const match = config.match(/^mnemonic\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("settings/Testnet.toml has no active deployer mnemonic");
  return match[1];
}

async function main() {
  let wallet = await generateWallet({
    secretKey: readTestnetMnemonic(),
    password: "",
  });
  while (wallet.accounts.length <= DEPLOYER_ACCOUNT_INDEX) {
    wallet = generateNewAccount(wallet);
  }
  const senderKey = wallet.accounts[DEPLOYER_ACCOUNT_INDEX].stxPrivateKey;
  const deployer = getAddressFromPrivateKey(senderKey, "testnet");

  if (EXPECTED_DEPLOYER && deployer !== EXPECTED_DEPLOYER) {
    throw new Error(
      `configured deployer ${deployer} does not match planned deployer ${EXPECTED_DEPLOYER}`
    );
  }

  const apiBase = stacksNetwork().client.baseUrl;
  for (const contract of contracts) {
    const interfaceResponse = await fetch(
      `${apiBase}/v2/contracts/interface/${deployer}/${contract.name}`
    );
    if (interfaceResponse.ok) {
      throw new Error(
        `${deployer}.${contract.name} is already deployed; refusing to reuse its name`
      );
    }
    if (interfaceResponse.status !== 404) {
      throw new Error(
        `unable to verify ${contract.name} availability: HTTP ${interfaceResponse.status}`
      );
    }
  }

  const accountResponse = await fetch(
    `${apiBase}/v2/accounts/${deployer}?proof=0`
  );
  if (!accountResponse.ok) {
    throw new Error(`unable to fetch deployer nonce: HTTP ${accountResponse.status}`);
  }
  const account = (await accountResponse.json()) as { nonce: number };
  let nonce = BigInt(account.nonce);

  console.log(`Deploying from ${deployer}, starting nonce ${nonce}`);

  for (const contract of contracts) {
    const transaction = await makeContractDeploy({
      contractName: contract.name,
      codeBody: readFileSync(contract.path, "utf8"),
      senderKey,
      network: stacksNetwork(),
      clarityVersion: ClarityVersion.Clarity4,
      fee: contract.fee,
      nonce,
      postConditionMode: "allow",
    });

    // Refuse to broadcast bytes our installed library cannot deserialize itself.
    deserializeTransaction(serializeTransactionBytes(transaction));

    const result = await broadcastTransaction({
      transaction,
      network: stacksNetwork(),
    });
    if ("error" in result) {
      throw new Error(
        `${contract.name} rejected: ${result.error} ${result.reason ?? ""}`.trim()
      );
    }

    console.log(`${contract.name}: ${result.txid}`);
    console.log(explorerTxUrl(result.txid));
    nonce += 1n;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
