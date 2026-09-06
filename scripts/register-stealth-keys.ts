// Create or load an encrypted M2 privacy-seed backup, register its public stealth
// keys for USER_KEY, wait for confirmation, then verify the record through the SDK.
// The privacy seed and derived private keys are never printed or transmitted.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { bytesToHex } from "@stacks/common";
import {
  broadcastTransaction,
  getAddressFromPrivateKey,
  makeContractCall,
} from "@stacks/transactions";
import {
  buildStealthKeyArgs,
  exportPrivacySeed,
  fetchStealthKeys,
  generateIdentity,
  identityFromSeed,
  importPrivacySeed,
  type EncryptedPrivacySeedBackup,
  type PrivacyIdentity,
} from "../sdk/src";
import {
  coreAddress,
  explorerTxUrl,
  networkName,
  requireKey,
  stacksNetwork,
  STEALTH_REGISTRY_NAME,
  stealthRegistryId,
} from "./_config";

const CONFIRMATION_ATTEMPTS = 60;
const CONFIRMATION_INTERVAL_MS = 10_000;

function requirePassword(): string {
  const password = process.env.PRIVARA_PRIVACY_PASSWORD;
  if (!password) {
    throw new Error(
      "PRIVARA_PRIVACY_PASSWORD is required (at least 12 characters; do not put it in source files)"
    );
  }
  return password;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function recordMatches(identity: PrivacyIdentity, record: Awaited<ReturnType<typeof fetchStealthKeys>>): boolean {
  return Boolean(
    record &&
      sameBytes(identity.spendingPublicKey, record.spendingPublicKey) &&
      sameBytes(identity.viewingPublicKey, record.viewingPublicKey)
  );
}

async function loadOrCreateIdentity(path: string, password: string): Promise<PrivacyIdentity> {
  if (existsSync(path)) {
    const backup = JSON.parse(readFileSync(path, "utf8")) as EncryptedPrivacySeedBackup;
    const seed = await importPrivacySeed(backup, password);
    console.log(`Loaded encrypted privacy backup: ${path}`);
    return identityFromSeed(seed);
  }

  const identity = generateIdentity();
  const backup = await exportPrivacySeed(identity.privacySeed, password);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(backup, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log(`Created encrypted privacy backup: ${path}`);
  console.log("Copy this file to a second secure location before receiving real funds.");
  return identity;
}

async function waitForSuccess(txid: string): Promise<void> {
  const apiBase = stacksNetwork().client.baseUrl;
  for (let attempt = 0; attempt < CONFIRMATION_ATTEMPTS; attempt++) {
    const response = await fetch(`${apiBase}/extended/v1/tx/${txid}`);
    if (response.ok) {
      const body = (await response.json()) as { tx_status?: string; tx_result?: { repr?: string } };
      if (body.tx_status === "success") {
        console.log(`Confirmed: ${body.tx_result?.repr ?? "success"}`);
        return;
      }
      if (body.tx_status && body.tx_status !== "pending") {
        throw new Error(`registration transaction ended with status ${body.tx_status}`);
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, CONFIRMATION_INTERVAL_MS));
  }
  throw new Error("confirmation timed out; rerun this command later to verify the saved identity");
}

async function main() {
  const senderKey = requireKey("USER_KEY");
  const user = getAddressFromPrivateKey(senderKey, networkName());
  const password = requirePassword();
  const backupPath = resolve(
    process.env.PRIVARA_PRIVACY_BACKUP_PATH ??
      `.privara/stealth-${networkName()}-${user}.json`
  );
  const identity = await loadOrCreateIdentity(backupPath, password);
  const registry = stealthRegistryId();
  const current = await fetchStealthKeys({ registry, user, network: stacksNetwork() });

  console.log(`Wallet:   ${user}`);
  console.log(`Registry: ${registry}`);
  console.log(`P:        ${bytesToHex(identity.spendingPublicKey)}`);
  console.log(`V:        ${bytesToHex(identity.viewingPublicKey)}`);

  if (recordMatches(identity, current)) {
    console.log(`Verified existing registration at epoch ${current!.epoch}. No transaction needed.`);
    return;
  }

  const rotating = current !== null;
  if (rotating && process.env.PRIVARA_ROTATE_STEALTH_KEYS !== "1") {
    throw new Error(
      "this wallet already has different stealth keys; refusing to rotate without PRIVARA_ROTATE_STEALTH_KEYS=1"
    );
  }

  const functionName = rotating ? "update-stealth-keys" : "register-stealth-keys";
  const transaction = await makeContractCall({
    contractAddress: coreAddress(),
    contractName: STEALTH_REGISTRY_NAME,
    functionName,
    functionArgs: buildStealthKeyArgs(
      identity.spendingPublicKey,
      identity.viewingPublicKey
    ),
    senderKey,
    network: networkName(),
    postConditionMode: "allow",
  });
  const result = await broadcastTransaction({ transaction, network: stacksNetwork() });
  if ("error" in result) {
    throw new Error(`broadcast failed: ${result.error} ${result.reason ?? ""}`.trim());
  }

  console.log(`Broadcast: ${result.txid}`);
  console.log(explorerTxUrl(result.txid));
  await waitForSuccess(result.txid);

  const registered = await fetchStealthKeys({ registry, user, network: stacksNetwork() });
  if (!recordMatches(identity, registered)) {
    throw new Error("confirmed transaction, but the SDK lookup did not return the expected keys");
  }
  console.log(`SDK lookup verified P,V at epoch ${registered!.epoch}. Phase 2 exit condition met.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
