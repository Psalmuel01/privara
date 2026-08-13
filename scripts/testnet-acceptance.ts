// Execute and verify the complete Milestone 1 mock-token acceptance flow.
// Keys are derived in memory from the gitignored testnet-only mnemonic and are
// never printed. The deployed contract address must be supplied explicitly.

import { readFileSync, writeFileSync } from "node:fs";
import { hexToBytes } from "@stacks/common";
import { generateNewAccount, generateWallet } from "@stacks/wallet-sdk";
import {
  broadcastTransaction,
  bufferCV,
  compressPublicKey,
  cvToValue,
  fetchCallReadOnlyFunction,
  getAddressFromPrivateKey,
  makeContractCall,
  principalCV,
  privateKeyToPublic,
  stringUtf8CV,
  uintCV,
} from "@stacks/transactions";
import { bytesToHex } from "@stacks/common";
import { createIntent, randomNonce, signIntent } from "../sdk/src";
import { explorerTxUrl, stacksNetwork } from "./_config";

const configuredCore = process.env.PRIVARA_CORE_ADDRESS;
if (!configuredCore) throw new Error("PRIVARA_CORE_ADDRESS is required");
const CORE: string = configuredCore;

const ASSET = `${CORE}.mock-token`;
const ROUTER = `${CORE}.privara-router`;
const REGISTRY = `${CORE}.privara-registry`;
const MINT_AMOUNT = 1_000_000n;
const INTENT_AMOUNT = 100_000n;
const RELAYER_FEE = 1_000n;

interface TxInfo {
  tx_status: string;
  tx_result?: { repr?: string };
  block_height?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function writeEnvelope(path: string, signed: ReturnType<typeof signIntent>) {
  const envelope = {
    network: "testnet",
    asset: signed.asset,
    amount: signed.amount.toString(),
    recipient: signed.recipient,
    relayer: signed.relayer,
    relayerFee: signed.relayerFee.toString(),
    nonce: signed.nonce.toString(),
    expiry: signed.expiry,
    user: signed.user,
    intentHash: bytesToHex(signed.intentHash),
    digest: bytesToHex(signed.digest),
    userSig: bytesToHex(signed.userSig),
  };
  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
}

function mnemonic(): string {
  const config = readFileSync("settings/Testnet.toml", "utf8");
  const match = config.match(/^mnemonic\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("settings/Testnet.toml has no active deployer mnemonic");
  return match[1];
}

async function waitForTx(txid: string): Promise<TxInfo> {
  const deadline = Date.now() + 10 * 60_000;
  const base = stacksNetwork().client.baseUrl;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/extended/v1/tx/0x${txid.replace(/^0x/, "")}`);
    if (response.ok) {
      const info = (await response.json()) as TxInfo;
      if (info.tx_status !== "pending") return info;
    }
    process.stderr.write(".");
    await sleep(5_000);
  }
  throw new Error(`${txid} remained pending for more than 10 minutes`);
}

async function submit(label: string, transaction: Awaited<ReturnType<typeof makeContractCall>>) {
  const broadcast = await broadcastTransaction({
    transaction,
    network: stacksNetwork(),
  });
  if ("error" in broadcast) {
    throw new Error(`${label} broadcast rejected: ${broadcast.error} ${broadcast.reason ?? ""}`);
  }
  console.log(`${label}: ${broadcast.txid}`);
  console.log(explorerTxUrl(broadcast.txid));
  const result = await waitForTx(broadcast.txid);
  console.log(`  ${result.tx_status} ${result.tx_result?.repr ?? ""}`.trimEnd());
  return { txid: broadcast.txid, ...result };
}

async function main() {
  let wallet = await generateWallet({ secretKey: mnemonic(), password: "" });
  while (wallet.accounts.length < 5) wallet = generateNewAccount(wallet);

  const userKey = wallet.accounts[1].stxPrivateKey;
  const relayerKey = wallet.accounts[2].stxPrivateKey;
  const user = getAddressFromPrivateKey(userKey, "testnet");
  const relayer = getAddressFromPrivateKey(relayerKey, "testnet");
  const recipient = getAddressFromPrivateKey(wallet.accounts[4].stxPrivateKey, "testnet");

  console.log(`Core: ${CORE}`);
  console.log(`User: ${user}`);
  console.log(`Relayer: ${relayer}`);
  console.log(`Recipient: ${recipient}`);

  const results: Record<string, string> = {};

  const registration = await submit(
    "register-relayer",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "privara-registry",
      functionName: "register",
      functionArgs: [
        bufferCV(hexToBytes(compressPublicKey(privateKeyToPublic(relayerKey)))),
        uintCV(100n),
        stringUtf8CV("https://testnet.invalid/privara-relayer"),
      ],
      senderKey: relayerKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  if (registration.tx_status !== "success") throw new Error("relayer registration failed");
  results.registration = registration.txid;

  const mint = await submit(
    "mint",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "mock-token",
      functionName: "mint",
      functionArgs: [uintCV(MINT_AMOUNT), principalCV(user)],
      senderKey: userKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  if (mint.tx_status !== "success") throw new Error("mint failed");
  results.mint = mint.txid;

  const deposit = await submit(
    "deposit",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "privara-router",
      functionName: "deposit",
      functionArgs: [principalCV(ASSET), uintCV(MINT_AMOUNT)],
      senderKey: userKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  if (deposit.tx_status !== "success") throw new Error("deposit failed");
  results.deposit = deposit.txid;

  const infoResponse = await fetch(`${stacksNetwork().client.baseUrl}/v2/info`);
  if (!infoResponse.ok) throw new Error(`unable to fetch chain tip: HTTP ${infoResponse.status}`);
  const info = (await infoResponse.json()) as { stacks_tip_height: number };

  const signed = signIntent(
    createIntent({
      asset: ASSET,
      amount: INTENT_AMOUNT,
      recipient,
      relayer,
      relayerFee: RELAYER_FEE,
      nonce: randomNonce(),
      expiry: info.stacks_tip_height + 200,
    }),
    userKey,
    "testnet",
    ROUTER
  );

  const settlementArgs = [
    principalCV(signed.asset),
    uintCV(signed.amount),
    principalCV(signed.recipient),
    principalCV(signed.relayer),
    uintCV(signed.relayerFee),
    uintCV(signed.nonce),
    uintCV(BigInt(signed.expiry)),
    bufferCV(signed.userSig),
  ];

  writeEnvelope("intent.json", signed);
  console.log(`Intent digest: ${bytesToHex(signed.digest)}`);
  const settle = await submit(
    "settle",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "privara-router",
      functionName: "settle-intent",
      functionArgs: settlementArgs,
      senderKey: relayerKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  if (settle.tx_status !== "success") throw new Error("settlement failed");
  results.settle = settle.txid;

  const replay = await submit(
    "replay-rejection",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "privara-router",
      functionName: "settle-intent",
      functionArgs: settlementArgs,
      senderKey: relayerKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  if (replay.tx_result?.repr !== "(err u100)") {
    throw new Error(`expected replay (err u100), received ${replay.tx_result?.repr}`);
  }
  results.replay = replay.txid;

  const expired = signIntent(
    createIntent({
      asset: ASSET,
      amount: INTENT_AMOUNT,
      recipient,
      relayer,
      relayerFee: RELAYER_FEE,
      nonce: randomNonce(),
      expiry: 1,
    }),
    userKey,
    "testnet",
    ROUTER
  );
  writeEnvelope("expired.json", expired);
  const expiry = await submit(
    "expiry-rejection",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "privara-router",
      functionName: "settle-intent",
      functionArgs: [
        principalCV(expired.asset),
        uintCV(expired.amount),
        principalCV(expired.recipient),
        principalCV(expired.relayer),
        uintCV(expired.relayerFee),
        uintCV(expired.nonce),
        uintCV(BigInt(expired.expiry)),
        bufferCV(expired.userSig),
      ],
      senderKey: relayerKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  if (expiry.tx_result?.repr !== "(err u101)") {
    throw new Error(`expected expiry (err u101), received ${expiry.tx_result?.repr}`);
  }
  results.expiry = expiry.txid;

  const readOnly = async (contractName: string, functionName: string, args: any[]) =>
    cvToValue(
      await fetchCallReadOnlyFunction({
        contractAddress: CORE,
        contractName,
        functionName,
        functionArgs: args,
        senderAddress: user,
        network: "testnet",
      })
    );

  const depositBalance = await readOnly("privara-router", "get-deposit", [
    principalCV(user),
    principalCV(ASSET),
  ]);
  const recipientBalance = await readOnly("mock-token", "get-balance", [principalCV(recipient)]);
  const relayerBalance = await readOnly("mock-token", "get-balance", [principalCV(relayer)]);

  const unwrapResponse = (value: any) =>
    typeof value === "object" && value !== null && "value" in value ? value.value : value;

  console.log("\nVerified final state");
  console.log(`  router deposit: ${depositBalance}`);
  console.log(`  recipient MOCK: ${unwrapResponse(recipientBalance)}`);
  console.log(`  relayer MOCK: ${unwrapResponse(relayerBalance)}`);
  console.log("\nTransaction summary");
  console.log(JSON.stringify(results, null, 2));
  console.log(`Registry: ${REGISTRY}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
