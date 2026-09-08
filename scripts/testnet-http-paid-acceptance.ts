// Fresh M2 acceptance flow using the real HTTP routes:
// backup/export/restore -> register P/V -> mint/deposit -> private payment -> indexed
// scan -> explicitly quoted and approved sponsored withdrawal. No private key is logged.

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { bytesToHex } from "@stacks/common";
import { generateNewAccount, generateWallet } from "@stacks/wallet-sdk";
import {
  broadcastTransaction,
  getAddressFromPrivateKey,
  makeContractCall,
  makeSTXTokenTransfer,
  principalCV,
  type StacksTransactionWire,
  uintCV,
} from "@stacks/transactions";
import {
  buildStealthKeyArgs,
  createPrivateIntent,
  fetchAnnouncementPage,
  fetchSip010Balance,
  fetchStealthKeys,
  exportPrivacySeed,
  generateIdentity,
  identityFromSeed,
  importPrivacySeed,
  prepareSponsoredSpend,
  privateIntentEnvelope,
  scanAnnouncements,
  submitPreparedSponsoredSpend,
  type SponsoredSpendResult,
} from "../sdk/src";
import { PrivaraRelayerService, type RelayerConfig } from "../relayer/src/service";
import { createRelayerHttpServer } from "../relayer/src/server";
import { explorerTxUrl, stacksNetwork } from "./_config";

const CORE = "STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0";
const ASSET = `${CORE}.mock-token`;
const ROUTER = `${CORE}.privara-router-m2`;
const REGISTRY = `${CORE}.privara-stealth-registry`;
const SPEND_CONTRACT = `${CORE}.privara-sponsored-spend-v2`;
const ENTERED_RECIPIENT_AMOUNT = 99_000n;
const SETTLEMENT_FEE_BPS = 100n;
const TOKEN_SPONSOR_FEE = 100n;
const DEPOSIT_AMOUNT = 120_000n;

interface TxInfo {
  tx_status: string;
  tx_result?: { repr?: string };
  block_height?: number;
}

const sleep = (milliseconds: number) =>
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

function deploymentMnemonic(): string {
  const match = readFileSync("settings/Testnet.toml", "utf8").match(
    /^mnemonic\s*=\s*"([^"]+)"/m
  );
  if (!match) throw new Error("settings/Testnet.toml has no active deployer mnemonic");
  return match[1];
}

async function waitForTx(txid: string): Promise<TxInfo> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${stacksNetwork().client.baseUrl}/extended/v1/tx/0x${txid.replace(/^0x/, "")}`
    );
    if (response.ok) {
      const info = (await response.json()) as TxInfo;
      // Some API edge responses are HTTP 200 before the indexed transaction shape is
      // complete. Only return once an explicit terminal Stacks status is present.
      if (
        info.tx_status === "success" ||
        info.tx_status?.startsWith("abort_")
      ) {
        return info;
      }
    }
    process.stderr.write(".");
    await sleep(5_000);
  }
  throw new Error(`${txid} remained pending for more than 10 minutes`);
}

async function submitDirect(
  label: string,
  transaction: StacksTransactionWire
) {
  const result = await broadcastTransaction({ transaction, network: stacksNetwork() });
  if ("error" in result) {
    throw new Error(`${label} broadcast rejected: ${result.error} ${result.reason ?? ""}`);
  }
  console.log(`${label}: ${result.txid}`);
  const confirmed = await waitForTx(result.txid);
  if (confirmed.tx_status !== "success") {
    throw new Error(`${label} ended with ${confirmed.tx_status}: ${confirmed.tx_result?.repr ?? ""}`);
  }
  return { txid: result.txid, blockHeight: confirmed.block_height };
}

async function postJson<T>(endpoint: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(result.message ?? `HTTP ${response.status}`);
  return result;
}

async function waitForIndexedSettlement(txid: string) {
  const deadline = Date.now() + 5 * 60_000;
  const expected = txid.replace(/^0x/, "").toLowerCase();
  while (Date.now() < deadline) {
    const page = await fetchAnnouncementPage({
      apiUrl: stacksNetwork().client.baseUrl,
      router: ROUTER,
      limit: 100,
    });
    const found = page.announcements.find(
      (record) => record.transactionId.replace(/^0x/, "").toLowerCase() === expected
    );
    if (found) return found;
    await sleep(5_000);
  }
  throw new Error("confirmed settlement was not indexed within five minutes");
}

async function main() {
  let wallet = await generateWallet({ secretKey: deploymentMnemonic(), password: "" });
  while (wallet.accounts.length < 4) wallet = generateNewAccount(wallet);
  const payerKey = wallet.accounts[0].stxPrivateKey;
  const relayerKey = wallet.accounts[2].stxPrivateKey;
  // Account 3 is isolated acceptance-only state, so account 1's real registered backup
  // is never rotated or overwritten by this repeatable test.
  const recipientKey = wallet.accounts[3].stxPrivateKey;
  const payer = getAddressFromPrivateKey(payerKey, "testnet");
  const recipient = getAddressFromPrivateKey(recipientKey, "testnet");
  const sponsor = getAddressFromPrivateKey(relayerKey, "testnet");
  // Prove recoverability before any public keys are registered. The generated secret is
  // cleared and every later action uses only the identity restored from encrypted bytes.
  const generatedIdentity = generateIdentity();
  const generatedSpendingPublicKey = generatedIdentity.spendingPublicKey.slice();
  const generatedViewingPublicKey = generatedIdentity.viewingPublicKey.slice();
  const backupPassword = randomBytes(24).toString("hex");
  const encryptedBackup = await exportPrivacySeed(generatedIdentity.privacySeed, backupPassword);
  generatedIdentity.privacySeed.fill(0);
  generatedIdentity.spendingPrivateKey.fill(0);
  generatedIdentity.viewingPrivateKey.fill(0);
  const restoredSeed = await importPrivacySeed(encryptedBackup, backupPassword);
  const identity = identityFromSeed(restoredSeed);
  restoredSeed.fill(0);
  if (
    bytesToHex(identity.spendingPublicKey) !== bytesToHex(generatedSpendingPublicKey) ||
    bytesToHex(identity.viewingPublicKey) !== bytesToHex(generatedViewingPublicKey)
  ) {
    throw new Error("encrypted privacy backup did not restore the original public identity");
  }
  console.log("Privacy backup export/restore verification: passed");
  const transactions: Record<string, string> = {};

  const balancesResponse = await fetch(
    `${stacksNetwork().client.baseUrl}/extended/v1/address/${recipient}/balances`
  );
  if (!balancesResponse.ok) throw new Error("unable to read acceptance recipient STX balance");
  const balances = (await balancesResponse.json()) as { stx?: { balance?: string } };
  if (BigInt(balances.stx?.balance ?? "0") < 100_000n) {
    transactions.fundRecipientStx = (
      await submitDirect(
        "fund acceptance recipient STX",
        await makeSTXTokenTransfer({
          recipient,
          amount: 250_000n,
          senderKey: payerKey,
          network: "testnet",
        })
      )
    ).txid;
  }

  const existingKeys = await fetchStealthKeys({ registry: REGISTRY, user: recipient, network: "testnet" });
  const [spendingKey, viewingKey] = buildStealthKeyArgs(
    identity.spendingPublicKey,
    identity.viewingPublicKey
  );
  const registration = await submitDirect(
    existingKeys ? "update acceptance P/V" : "register acceptance P/V",
    await makeContractCall({
      contractAddress: CORE,
      contractName: "privara-stealth-registry",
      functionName: existingKeys ? "update-stealth-keys" : "register-stealth-keys",
      functionArgs: [spendingKey, viewingKey],
      senderKey: recipientKey,
      network: "testnet",
      postConditionMode: "allow",
    })
  );
  transactions.registry = registration.txid;

  transactions.mint = (
    await submitDirect(
      "mint MOCK",
      await makeContractCall({
        contractAddress: CORE,
        contractName: "mock-token",
        functionName: "mint",
        functionArgs: [uintCV(DEPOSIT_AMOUNT), principalCV(payer)],
        senderKey: payerKey,
        network: "testnet",
        postConditionMode: "allow",
      })
    )
  ).txid;
  transactions.deposit = (
    await submitDirect(
      "deposit M2",
      await makeContractCall({
        contractAddress: CORE,
        contractName: "privara-router-m2",
        functionName: "deposit",
        functionArgs: [principalCV(ASSET), uintCV(DEPOSIT_AMOUNT)],
        senderKey: payerKey,
        network: "testnet",
        postConditionMode: "allow",
      })
    )
  ).txid;

  const config: RelayerConfig = {
    network: "testnet",
    coreAddress: CORE,
    relayerPrivateKey: relayerKey,
    sponsorPrivateKey: relayerKey,
    assetContract: ASSET,
    tokenName: "mock",
    spendContract: SPEND_CONTRACT,
    feeRecipient: payer,
    exactTokenSponsorFee: TOKEN_SPONSOR_FEE,
    maxIntentAmount: 1_000_000n,
    maxRelayerFeeBps: 100,
    maxSweepAmount: 1_000_000n,
    maxSponsorFee: 10_000n,
    maxTransactionBytes: 4_096,
    sponsorshipsPerWindow: 10,
    sponsorshipWindowMs: 60_000,
  };
  const server = createRelayerHttpServer(new PrivaraRelayerService(config));
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const info = (await fetch(`${stacksNetwork().client.baseUrl}/v2/info`).then((r) => r.json())) as {
      stacks_tip_height: number;
    };
    const created = await createPrivateIntent({
      registry: REGISTRY,
      recipient,
      network: "testnet",
      router: ROUTER,
      asset: ASSET,
      relayer: sponsor,
      enteredAmount: ENTERED_RECIPIENT_AMOUNT,
      settlementFeeBps: SETTLEMENT_FEE_BPS,
      feeMode: "added",
      expiry: info.stacks_tip_height + 200,
      payerPrivateKey: payerKey,
    });
    console.log(
      `Fee-added quote: recipient ${created.quote.recipientAmount}, fee ${created.quote.settlementFee}, total ${created.quote.totalAmount}`
    );
    const settlement = await postJson<{ txid: string }>(
      endpoint,
      "/v1/intents/settle",
      privateIntentEnvelope(created, "testnet")
    );
    transactions.settlement = settlement.txid;
    console.log(`HTTP settlement: ${settlement.txid}`);
    const settled = await waitForTx(settlement.txid);
    if (settled.tx_status !== "success") throw new Error("HTTP M2 settlement failed");

    const indexed = await waitForIndexedSettlement(settlement.txid);
    const detected = await scanAnnouncements(
      [
        {
          stealthPrincipal: indexed.stealthPrincipal,
          ephemeralPublicKey: indexed.ephemeralPublicKey,
          note: { version: indexed.version, nonce: indexed.nonce, ciphertext: indexed.ciphertext },
          context: {
            network: "testnet",
            router: ROUTER,
            stealthPrincipal: indexed.stealthPrincipal,
            asset: indexed.asset,
            registryEpoch: indexed.registryEpoch,
            protocolVersion: indexed.version,
          },
        },
      ],
      identity.viewingPrivateKey,
      identity.spendingPublicKey,
      "testnet",
      identity.spendingPrivateKey
    );
    const payment = detected[0];
    if (!payment?.stealthPrivateKey) throw new Error("indexed payment was not spendable");
    if (payment.stealthPrincipal !== created.intent.recipient) {
      throw new Error("scanner derived a different one-time address");
    }

    const destinationBefore = await fetchSip010Balance({
      assetContract: ASSET,
      principal: recipient,
      network: "testnet",
    });
    const treasuryBefore = await fetchSip010Balance({
      assetContract: ASSET,
      principal: payer,
      network: "testnet",
    });
    const spendOptions = {
      endpoint,
      network: "testnet",
      spendContract: SPEND_CONTRACT,
      assetContract: ASSET,
      tokenName: "mock",
      destination: recipient,
      stealthPrivateKey: payment.stealthPrivateKey,
    } as const;
    const approvedSponsorQuote = await prepareSponsoredSpend({
      ...spendOptions,
      fullBalance: true,
    });
    console.log(
      `Approved sponsor quote: payment ${approvedSponsorQuote.paymentAmount}, fee ${approvedSponsorQuote.sponsorFee}, total ${approvedSponsorQuote.totalAmount}`
    );
    const sweep: SponsoredSpendResult = await submitPreparedSponsoredSpend(
      spendOptions,
      approvedSponsorQuote
    );
    transactions.sponsoredSpend = sweep.txid;
    console.log(`HTTP paid sponsored spend: ${sweep.txid}`);
    const swept = await waitForTx(sweep.txid);
    if (swept.tx_status !== "success") {
      throw new Error(
        `paid sponsored spend ended with ${swept.tx_status}: ${swept.tx_result?.repr ?? ""}`
      );
    }

    const originAfter = await fetchSip010Balance({
      assetContract: ASSET,
      principal: payment.stealthPrincipal,
      network: "testnet",
    });
    const destinationAfter = await fetchSip010Balance({
      assetContract: ASSET,
      principal: recipient,
      network: "testnet",
    });
    const treasuryAfter = await fetchSip010Balance({
      assetContract: ASSET,
      principal: payer,
      network: "testnet",
    });
    if (originAfter !== 0n) throw new Error(`full withdrawal left ${originAfter} MOCK`);
    if (destinationAfter - destinationBefore !== ENTERED_RECIPIENT_AMOUNT - TOKEN_SPONSOR_FEE) {
      throw new Error("destination balance delta does not equal net sponsored withdrawal");
    }
    if (treasuryAfter - treasuryBefore !== TOKEN_SPONSOR_FEE) {
      throw new Error("treasury did not receive the exact sponsor fee");
    }

    const evidence = {
      version: 1,
      network: "testnet",
      core: CORE,
      normalRecipient: recipient,
      stealthOrigin: payment.stealthPrincipal,
      withdrawalDestination: recipient,
      tokenFeeTreasury: payer,
      stacksSponsor: sponsor,
      settlement: {
        enteredRecipientAmount: ENTERED_RECIPIENT_AMOUNT.toString(),
        recipientAmount: created.quote.recipientAmount.toString(),
        fee: created.quote.settlementFee.toString(),
        total: created.quote.totalAmount.toString(),
        announcementHash: bytesToHex(created.intent.announcementHash),
      },
      sponsoredSpend: {
        paymentAmount: sweep.paymentAmount,
        tokenSponsorFee: sweep.tokenSponsorFee,
        networkFeePaid: sweep.networkFeePaid,
      },
      transactions,
    };
    mkdirSync(".privara", { recursive: true, mode: 0o700 });
    writeFileSync(".privara/http-paid-acceptance.json", `${JSON.stringify(evidence, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(`Settlement explorer: ${explorerTxUrl(transactions.settlement)}`);
    console.log(`Sponsored spend explorer: ${explorerTxUrl(transactions.sponsoredSpend)}`);
    console.log("Phase 4/5 HTTP paid acceptance verified.");
    payment.stealthPrivateKey.fill(0);
  } finally {
    identity.privacySeed.fill(0);
    identity.spendingPrivateKey.fill(0);
    identity.viewingPrivateKey.fill(0);
    await new Promise<void>((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose()))
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
