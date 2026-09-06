// Execute the public half of the M2 testnet flow:
// resolve recipient P,V -> derive one-time S -> encrypt announcement -> mint/deposit
// MOCK -> sign version-2 intent -> settle -> retrieve and authenticate indexed event.
// Recipient decryption is a separate command because this runner never receives the
// privacy-backup password or private p/v keys.

import { readFileSync, writeFileSync } from "node:fs";
import { bytesToHex } from "@stacks/common";
import { utils } from "@noble/secp256k1";
import { generateNewAccount, generateWallet } from "@stacks/wallet-sdk";
import {
  broadcastTransaction,
  bufferCV,
  getAddressFromPrivateKey,
  makeContractCall,
  principalCV,
  uintCV,
} from "@stacks/transactions";
import {
  buildStealthSettlementArgs,
  createStealthIntent,
  deriveStealthForSender,
  encryptStealthNote,
  fetchAnnouncementPage,
  fetchStealthKeys,
  randomNonce,
  signStealthIntent,
  stealthPublicKeyToAddress,
  type StealthAnnouncementPayload,
} from "../sdk/src";
import { explorerTxUrl, stacksNetwork } from "./_config";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const CORE = requiredEnv("PRIVARA_CORE_ADDRESS");

const ASSET = `${CORE}.mock-token`;
const ROUTER = `${CORE}.privara-router-m2`;
const STEALTH_REGISTRY = `${CORE}.privara-stealth-registry`;
const MINT_AMOUNT = 1_000_000n;
const INTENT_AMOUNT = 100_000n;
const RELAYER_FEE = 1_000n;

interface TxInfo {
  tx_status: string;
  tx_result?: { repr?: string };
  block_height?: number;
}

const sleep = (milliseconds: number) =>
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

function mnemonic(): string {
  const config = readFileSync("settings/Testnet.toml", "utf8");
  const match = config.match(/^mnemonic\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("settings/Testnet.toml has no active deployer mnemonic");
  return match[1];
}

async function waitForTx(txid: string): Promise<TxInfo> {
  const deadline = Date.now() + 10 * 60_000;
  const apiBase = stacksNetwork().client.baseUrl;
  while (Date.now() < deadline) {
    const response = await fetch(`${apiBase}/extended/v1/tx/0x${txid.replace(/^0x/, "")}`);
    if (response.ok) {
      const info = (await response.json()) as TxInfo;
      if (info.tx_status !== "pending") return info;
    }
    process.stderr.write(".");
    await sleep(5_000);
  }
  throw new Error(`${txid} remained pending for more than 10 minutes`);
}

async function submit(
  label: string,
  transaction: Awaited<ReturnType<typeof makeContractCall>>
) {
  const broadcast = await broadcastTransaction({ transaction, network: stacksNetwork() });
  if ("error" in broadcast) {
    throw new Error(`${label} broadcast rejected: ${broadcast.error} ${broadcast.reason ?? ""}`);
  }
  console.log(`${label}: ${broadcast.txid}`);
  console.log(explorerTxUrl(broadcast.txid));
  const result = await waitForTx(broadcast.txid);
  console.log(`  ${result.tx_status} ${result.tx_result?.repr ?? ""}`.trimEnd());
  return { txid: broadcast.txid, ...result };
}

function sameTx(left: string, right: string): boolean {
  return left.replace(/^0x/, "").toLowerCase() === right.replace(/^0x/, "").toLowerCase();
}

async function waitForIndexedSettlement(txid: string) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const page = await fetchAnnouncementPage({
      apiUrl: stacksNetwork().client.baseUrl,
      router: ROUTER,
      limit: 50,
    });
    const record = page.announcements.find((item) => sameTx(item.transactionId, txid));
    if (record) return record;
    await sleep(5_000);
  }
  throw new Error("settlement confirmed but its announcement was not indexed within 5 minutes");
}

async function main() {
  let wallet = await generateWallet({ secretKey: mnemonic(), password: "" });
  while (wallet.accounts.length < 3) wallet = generateNewAccount(wallet);

  // Separate public roles: deployer/account 0 pays, registered account 1 receives,
  // and account 2 broadcasts. Private keys never leave this process.
  const payerKey = wallet.accounts[0].stxPrivateKey;
  const recipient = getAddressFromPrivateKey(wallet.accounts[1].stxPrivateKey, "testnet");
  const relayerKey = wallet.accounts[2].stxPrivateKey;
  const payer = getAddressFromPrivateKey(payerKey, "testnet");
  const relayer = getAddressFromPrivateKey(relayerKey, "testnet");

  const registered = await fetchStealthKeys({
    registry: STEALTH_REGISTRY,
    user: recipient,
    network: stacksNetwork(),
  });
  if (!registered) throw new Error(`${recipient} has no registered stealth keys`);

  const ephemeralPrivateKey = utils.randomPrivateKey();
  const derived = deriveStealthForSender(
    registered.spendingPublicKey,
    registered.viewingPublicKey,
    ephemeralPrivateKey
  );
  const stealthPrincipal = stealthPublicKeyToAddress(derived.stealthPublicKey, "testnet");
  const context = {
    network: "testnet" as const,
    router: ROUTER,
    stealthPrincipal,
    asset: ASSET,
    registryEpoch: registered.epoch,
  };
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ protocol: "privara", version: 1, type: "stealth-payment" })
  );
  const note = await encryptStealthNote(
    plaintext,
    registered.viewingPublicKey,
    ephemeralPrivateKey,
    context
  );
  const announcement: StealthAnnouncementPayload = {
    version: 1,
    stealthPrincipal,
    ephemeralPublicKey: derived.ephemeralPublicKey,
    nonce: note.nonce,
    ciphertext: note.ciphertext,
    asset: ASSET,
    registryEpoch: registered.epoch,
  };

  const infoResponse = await fetch(`${stacksNetwork().client.baseUrl}/v2/info`);
  if (!infoResponse.ok) throw new Error(`unable to fetch chain tip: HTTP ${infoResponse.status}`);
  const info = (await infoResponse.json()) as { stacks_tip_height: number };
  const signed = signStealthIntent(
    createStealthIntent(
      {
        asset: ASSET,
        amount: INTENT_AMOUNT,
        recipient: stealthPrincipal,
        relayer,
        relayerFee: RELAYER_FEE,
        nonce: randomNonce(),
        expiry: info.stacks_tip_height + 200,
      },
      announcement
    ),
    payerKey,
    "testnet",
    ROUTER
  );

  console.log(`Payer: ${payer}`);
  console.log(`Recipient registry identity: ${recipient}`);
  console.log(`One-time recipient S: ${stealthPrincipal}`);
  console.log(`Relayer: ${relayer}`);
  console.log(`Announcement hash: ${bytesToHex(signed.announcementHash)}`);
  console.log(`Intent digest: ${bytesToHex(signed.digest)}`);

  const results: Record<string, string> = {};
  const mint = await submit(
    "mint",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "mock-token",
      functionName: "mint",
      functionArgs: [uintCV(MINT_AMOUNT), principalCV(payer)],
      senderKey: payerKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  if (mint.tx_status !== "success") throw new Error("mint failed");
  results.mint = mint.txid;

  const deposit = await submit(
    "deposit-m2",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "privara-router-m2",
      functionName: "deposit",
      functionArgs: [principalCV(ASSET), uintCV(MINT_AMOUNT)],
      senderKey: payerKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  if (deposit.tx_status !== "success") throw new Error("M2 deposit failed");
  results.deposit = deposit.txid;

  const args = buildStealthSettlementArgs(signed, announcement);
  const settlement = await submit(
    "settle-stealth",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "privara-router-m2",
      functionName: "settle-intent",
      functionArgs: [
        principalCV(args.asset),
        uintCV(args.amount),
        principalCV(args.recipient),
        principalCV(args.relayer),
        uintCV(args.relayerFee),
        uintCV(args.nonce),
        uintCV(args.expiry),
        bufferCV(args.announcementHash),
        uintCV(args.version),
        bufferCV(args.ephemeralPublicKey),
        bufferCV(args.announcementNonce),
        bufferCV(args.ciphertext),
        uintCV(args.registryEpoch),
        bufferCV(args.userSig),
      ],
      senderKey: relayerKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  if (settlement.tx_status !== "success") throw new Error("stealth settlement failed");
  results.settlement = settlement.txid;

  const indexed = await waitForIndexedSettlement(settlement.txid);
  if (bytesToHex(indexed.announcementHash) !== bytesToHex(signed.announcementHash)) {
    throw new Error("indexed announcement commitment differs from the signed intent");
  }
  console.log(`Indexed event verified: ${indexed.transactionId}:${indexed.eventIndex}`);

  const envelope = {
    network: "testnet",
    router: ROUTER,
    asset: ASSET,
    amount: signed.amount.toString(),
    recipient: signed.recipient,
    relayer: signed.relayer,
    relayerFee: signed.relayerFee.toString(),
    nonce: signed.nonce.toString(),
    expiry: signed.expiry,
    payer: signed.user,
    intentHash: bytesToHex(signed.intentHash),
    digest: bytesToHex(signed.digest),
    userSig: bytesToHex(signed.userSig),
    announcement: {
      version: announcement.version,
      stealthPrincipal: announcement.stealthPrincipal,
      ephemeralPublicKey: bytesToHex(announcement.ephemeralPublicKey),
      nonce: bytesToHex(announcement.nonce),
      ciphertext: bytesToHex(announcement.ciphertext),
      asset: announcement.asset,
      registryEpoch: announcement.registryEpoch.toString(),
      hash: bytesToHex(signed.announcementHash),
    },
    transactions: results,
  };
  writeFileSync("stealth-intent.json", `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
  console.log("Public acceptance evidence written to stealth-intent.json");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
