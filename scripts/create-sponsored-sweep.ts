// Recipient/client half of a sponsored sweep. Private material is used only here.
// Output is an origin-signed sponsored transaction that contains no p, v, p', seed,
// backup password, or plaintext note.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bytesToHex } from "@stacks/common";
import {
  Cl,
  ClarityType,
  fetchCallReadOnlyFunction,
  serializeTransaction,
} from "@stacks/transactions";
import {
  buildSponsoredSweep,
  fetchAnnouncementPage,
  fetchStealthKeys,
  identityFromSeed,
  importPrivacySeed,
  scanAnnouncements,
  validateSponsoredSweep,
  type EncryptedPrivacySeedBackup,
  type IndexedStealthAnnouncement,
} from "../sdk/src";
import { stacksNetwork } from "./_config";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const CORE = requiredEnv("PRIVARA_CORE_ADDRESS");
const RECIPIENT = requiredEnv("PRIVARA_RECIPIENT_ADDRESS");
const PASSWORD = requiredEnv("PRIVARA_PRIVACY_PASSWORD");
const DESTINATION = requiredEnv("SWEEP_DESTINATION");
const ROUTER = `${CORE}.privara-router-m2`;
const REGISTRY = `${CORE}.privara-stealth-registry`;
const ASSET = `${CORE}.mock-token`;

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function sameTx(left: string, right: string): boolean {
  return left.replace(/^0x/, "").toLowerCase() === right.replace(/^0x/, "").toLowerCase();
}

async function fetchAll(): Promise<IndexedStealthAnnouncement[]> {
  const records: IndexedStealthAnnouncement[] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await fetchAnnouncementPage({
      apiUrl: stacksNetwork().client.baseUrl,
      router: ROUTER,
      cursor,
      limit: 100,
    });
    records.push(...page.announcements);
    if (!page.nextCursor) return records;
    cursor = page.nextCursor;
  }
  throw new Error("announcement history exceeded the 100-page safety limit");
}

async function tokenBalance(principal: string): Promise<bigint> {
  const result = await fetchCallReadOnlyFunction({
    contractAddress: CORE,
    contractName: "mock-token",
    functionName: "get-balance",
    functionArgs: [Cl.principal(principal)],
    senderAddress: principal,
    network: stacksNetwork(),
  });
  if (result.type !== ClarityType.ResponseOk || result.value.type !== ClarityType.UInt) {
    throw new Error("unable to read stealth MOCK balance");
  }
  return BigInt(result.value.value);
}

async function main() {
  const backupPath = resolve(
    process.env.PRIVARA_PRIVACY_BACKUP_PATH ?? `.privara/stealth-testnet-${RECIPIENT}.json`
  );
  if (!existsSync(backupPath)) throw new Error(`privacy backup not found: ${backupPath}`);
  const backup = JSON.parse(readFileSync(backupPath, "utf8")) as EncryptedPrivacySeedBackup;
  const identity = identityFromSeed(await importPrivacySeed(backup, PASSWORD));
  const registered = await fetchStealthKeys({
    registry: REGISTRY,
    user: RECIPIENT,
    network: stacksNetwork(),
  });
  if (!registered) throw new Error("recipient has no live stealth registry record");
  if (
    !sameBytes(identity.spendingPublicKey, registered.spendingPublicKey) ||
    !sameBytes(identity.viewingPublicKey, registered.viewingPublicKey)
  ) {
    throw new Error("privacy backup does not match the live P,V record");
  }

  const indexed = await fetchAll();
  const requestedTx = process.env.STEALTH_SETTLEMENT_TXID;
  const eligible = requestedTx
    ? indexed.filter((record) => sameTx(record.transactionId, requestedTx))
    : indexed;
  if (eligible.length === 0) throw new Error("requested indexed settlement was not found");
  const candidates = eligible.map((record) => ({
    stealthPrincipal: record.stealthPrincipal,
    ephemeralPublicKey: record.ephemeralPublicKey,
    note: { version: record.version, nonce: record.nonce, ciphertext: record.ciphertext },
    context: {
      network: "testnet" as const,
      router: ROUTER,
      stealthPrincipal: record.stealthPrincipal,
      asset: record.asset,
      registryEpoch: record.registryEpoch,
      protocolVersion: record.version,
    },
  }));
  const detected = await scanAnnouncements(
    candidates,
    identity.viewingPrivateKey,
    identity.spendingPublicKey,
    "testnet",
    identity.spendingPrivateKey
  );
  const payment = detected[0];
  if (!payment?.stealthPrivateKey) throw new Error("no spendable indexed payment was detected");
  const available = await tokenBalance(payment.stealthPrincipal);
  const amount = process.env.SWEEP_AMOUNT ? BigInt(process.env.SWEEP_AMOUNT) : available;
  if (amount <= 0n || amount > available) {
    throw new Error(`SWEEP_AMOUNT must be between 1 and the available ${available}`);
  }

  const transaction = await buildSponsoredSweep({
    assetContract: ASSET,
    tokenName: "mock",
    destination: DESTINATION,
    amount,
    stealthPrivateKey: payment.stealthPrivateKey,
    network: "testnet",
  });
  const validated = validateSponsoredSweep(transaction, {
    network: "testnet",
    assetContract: ASSET,
    tokenName: "mock",
    maxAmount: 1_000_000n,
    maxTransactionBytes: 4_096,
  });
  const output = {
    version: 1,
    network: "testnet",
    origin: validated.origin,
    destination: validated.destination,
    asset: `${ASSET}::mock`,
    amount: validated.amount.toString(),
    originSignedTransaction: serializeTransaction(transaction),
  };
  writeFileSync("sponsored-sweep.json", `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  payment.stealthPrivateKey.fill(0);
  identity.spendingPrivateKey.fill(0);
  identity.viewingPrivateKey.fill(0);
  identity.privacySeed.fill(0);

  console.log(`Origin: ${validated.origin}`);
  console.log(`Destination: ${validated.destination}`);
  console.log(`Amount: ${validated.amount} MOCK`);
  console.log(`Origin signature verified: true`);
  console.log(`Private p' exported: false`);
  console.log(`Wrote origin-signed request: sponsored-sweep.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
