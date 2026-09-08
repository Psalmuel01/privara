import { bytesToHex } from "@stacks/common";
import {
  exportPrivacySeed,
  generateIdentity,
  identityFromSeed,
  importPrivacySeed,
  type EncryptedPrivacySeedBackup,
  type PrivacyIdentity,
} from "@privara/sdk";

export interface PrivacyBackupStatus {
  version: 1;
  exported: boolean;
  verified: boolean;
  spendingPublicKey?: string;
  viewingPublicKey?: string;
}

export interface PrivacyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class PrivacyBackupConflictError extends Error {
  readonly code = "privacy_backup_conflict";
}

const backupKey = (network: string, address: string) =>
  `privara:privacy-backup:${network}:${address}`;
const statusKey = (network: string, address: string) =>
  `privara:privacy-backup-status:${network}:${address}`;

function keys(identity: PrivacyIdentity) {
  return {
    spendingPublicKey: bytesToHex(identity.spendingPublicKey),
    viewingPublicKey: bytesToHex(identity.viewingPublicKey),
  };
}

function sameIdentity(left: PrivacyIdentity, right: PrivacyIdentity): boolean {
  const a = keys(left);
  const b = keys(right);
  return a.spendingPublicKey === b.spendingPublicKey && a.viewingPublicKey === b.viewingPublicKey;
}

function decodeBackup(encoded: string): EncryptedPrivacySeedBackup {
  const parsed = JSON.parse(encoded) as EncryptedPrivacySeedBackup;
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid privacy backup JSON");
  return parsed;
}

export function readPrivacyBackupStatus(
  storage: PrivacyStorage,
  network: string,
  address: string
): PrivacyBackupStatus {
  const encoded = storage.getItem(statusKey(network, address));
  if (!encoded) return { version: 1, exported: false, verified: false };
  try {
    const status = JSON.parse(encoded) as PrivacyBackupStatus;
    if (status.version !== 1) throw new Error("unsupported status");
    return status;
  } catch {
    return { version: 1, exported: false, verified: false };
  }
}

export function readStoredPrivacyBackup(
  storage: PrivacyStorage,
  network: string,
  address: string
): string | null {
  return storage.getItem(backupKey(network, address));
}

export async function createPendingPrivacyBackup(
  storage: PrivacyStorage,
  network: string,
  address: string,
  password: string
): Promise<{ identity: PrivacyIdentity; backup: EncryptedPrivacySeedBackup }> {
  if (readStoredPrivacyBackup(storage, network, address)) {
    throw new Error("An encrypted privacy backup already exists for this wallet on this device");
  }
  const identity = generateIdentity();
  const backup = await exportPrivacySeed(identity.privacySeed, password);
  storage.setItem(backupKey(network, address), JSON.stringify(backup));
  storage.setItem(
    statusKey(network, address),
    JSON.stringify({ version: 1, exported: false, verified: false } satisfies PrivacyBackupStatus)
  );
  return { identity, backup };
}

export function markPrivacyBackupExported(
  storage: PrivacyStorage,
  network: string,
  address: string
): void {
  if (!readStoredPrivacyBackup(storage, network, address)) {
    throw new Error("No encrypted privacy backup exists on this device");
  }
  const current = readPrivacyBackupStatus(storage, network, address);
  storage.setItem(statusKey(network, address), JSON.stringify({ ...current, exported: true }));
}

export async function unlockVerifiedPrivacyBackup(
  storage: PrivacyStorage,
  network: string,
  address: string,
  password: string
): Promise<PrivacyIdentity> {
  const status = readPrivacyBackupStatus(storage, network, address);
  if (!status.exported || !status.verified) {
    throw new Error("Export and restore-verify the encrypted backup before unlocking private receiving");
  }
  const encoded = readStoredPrivacyBackup(storage, network, address);
  if (!encoded) throw new Error("No privacy backup exists on this device. Import one first");
  const seed = await importPrivacySeed(decodeBackup(encoded), password);
  const identity = identityFromSeed(seed);
  seed.fill(0);
  assertPrivacyBackupVerified(storage, network, address, identity);
  return identity;
}

/**
 * Restore a backup and prove it decrypts. A different existing identity is retained
 * unless the caller passes replaceExisting after an explicit confirmation.
 */
export async function restoreAndVerifyPrivacyBackup(
  storage: PrivacyStorage,
  network: string,
  address: string,
  encoded: string,
  password: string,
  replaceExisting = false
): Promise<PrivacyIdentity> {
  const candidateSeed = await importPrivacySeed(decodeBackup(encoded), password);
  const candidate = identityFromSeed(candidateSeed);
  candidateSeed.fill(0);
  const existingEncoded = readStoredPrivacyBackup(storage, network, address);

  if (existingEncoded && existingEncoded !== encoded) {
    let matches = false;
    try {
      const existingSeed = await importPrivacySeed(decodeBackup(existingEncoded), password);
      const existing = identityFromSeed(existingSeed);
      existingSeed.fill(0);
      matches = sameIdentity(existing, candidate);
    } catch {
      // An unreadable existing backup is never overwritten without explicit confirmation.
    }
    if (!matches && !replaceExisting) {
      throw new PrivacyBackupConflictError(
        "This file contains a different privacy identity. The existing backup was not changed"
      );
    }
  }

  storage.setItem(backupKey(network, address), JSON.stringify(decodeBackup(encoded)));
  storage.setItem(
    statusKey(network, address),
    JSON.stringify({
      version: 1,
      exported: true,
      verified: true,
      ...keys(candidate),
    } satisfies PrivacyBackupStatus)
  );
  return candidate;
}

export function assertPrivacyBackupVerified(
  storage: PrivacyStorage,
  network: string,
  address: string,
  identity: PrivacyIdentity
): void {
  const status = readPrivacyBackupStatus(storage, network, address);
  const publicKeys = keys(identity);
  if (
    !status.exported ||
    !status.verified ||
    status.spendingPublicKey !== publicKeys.spendingPublicKey ||
    status.viewingPublicKey !== publicKeys.viewingPublicKey
  ) {
    throw new Error("Encrypted backup export and restore verification are required before key registration");
  }
}
