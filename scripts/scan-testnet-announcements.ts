// Load the recipient's encrypted recovery root, fetch public M2 events, scan locally,
// and prove that each detected one-time principal has derivable spending authority.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bytesToHex } from "@stacks/common";
import {
  fetchAnnouncementPage,
  fetchStealthKeys,
  identityFromSeed,
  importPrivacySeed,
  scanAnnouncements,
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

const ROUTER = `${CORE}.privara-router-m2`;
const REGISTRY = `${CORE}.privara-stealth-registry`;

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
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
  throw new Error("announcement history exceeded the 100-page scan safety limit");
}

async function main() {
  const backupPath = resolve(
    process.env.PRIVARA_PRIVACY_BACKUP_PATH ??
      `.privara/stealth-testnet-${RECIPIENT}.json`
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
    throw new Error("encrypted privacy backup does not match the live P,V record");
  }

  const indexed = await fetchAll();
  const candidates = indexed.map((record) => ({
    stealthPrincipal: record.stealthPrincipal,
    ephemeralPublicKey: record.ephemeralPublicKey,
    note: {
      version: record.version,
      nonce: record.nonce,
      ciphertext: record.ciphertext,
    },
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

  console.log(`Indexed candidates: ${indexed.length}`);
  console.log(`Payments detected: ${detected.length}`);
  for (const payment of detected) {
    if (!payment.stealthPrivateKey) throw new Error("detected payment lacks spending authority");
    const source = indexed.find((record) => record.stealthPrincipal === payment.stealthPrincipal);
    console.log(`- ${payment.stealthPrincipal}`);
    console.log(`  tx: ${source?.transactionId ?? "unknown"}`);
    console.log(`  note: ${new TextDecoder().decode(payment.plaintext)}`);
    console.log(`  spend-key-derived: ${bytesToHex(payment.stealthPrivateKey).length === 64}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
