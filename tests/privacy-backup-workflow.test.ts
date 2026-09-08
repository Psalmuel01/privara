import { describe, expect, it } from "vitest";
import {
  PrivacyBackupConflictError,
  assertPrivacyBackupVerified,
  createPendingPrivacyBackup,
  markPrivacyBackupExported,
  readPrivacyBackupStatus,
  readStoredPrivacyBackup,
  restoreAndVerifyPrivacyBackup,
  unlockVerifiedPrivacyBackup,
  type PrivacyStorage,
} from "../app/src/lib/privacy-backup";

class MemoryStorage implements PrivacyStorage {
  readonly data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const NETWORK = "testnet";
const ADDRESS = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const PASSWORD = "correct horse battery staple";

describe("privacy backup registration gate", () => {
  it("blocks registration evidence until export and restore verification", async () => {
    const storage = new MemoryStorage();
    const created = await createPendingPrivacyBackup(storage, NETWORK, ADDRESS, PASSWORD);
    expect(() => assertPrivacyBackupVerified(storage, NETWORK, ADDRESS, created.identity))
      .toThrow("export and restore verification");
    markPrivacyBackupExported(storage, NETWORK, ADDRESS);
    expect(() => assertPrivacyBackupVerified(storage, NETWORK, ADDRESS, created.identity))
      .toThrow("export and restore verification");
    const encoded = readStoredPrivacyBackup(storage, NETWORK, ADDRESS)!;
    const restored = await restoreAndVerifyPrivacyBackup(storage, NETWORK, ADDRESS, encoded, PASSWORD);
    expect(() => assertPrivacyBackupVerified(storage, NETWORK, ADDRESS, restored)).not.toThrow();
    expect(readPrivacyBackupStatus(storage, NETWORK, ADDRESS)).toMatchObject({
      exported: true, verified: true,
    });
  });

  it("recovers in a fresh browser storage/session from the exported JSON", async () => {
    const originalSession = new MemoryStorage();
    const created = await createPendingPrivacyBackup(originalSession, NETWORK, ADDRESS, PASSWORD);
    markPrivacyBackupExported(originalSession, NETWORK, ADDRESS);
    const downloadedJson = readStoredPrivacyBackup(originalSession, NETWORK, ADDRESS)!;

    const freshSession = new MemoryStorage();
    const restored = await restoreAndVerifyPrivacyBackup(
      freshSession, NETWORK, ADDRESS, downloadedJson, PASSWORD
    );
    expect(restored.spendingPublicKey).toEqual(created.identity.spendingPublicKey);
    expect(restored.viewingPublicKey).toEqual(created.identity.viewingPublicKey);
    expect(() => assertPrivacyBackupVerified(freshSession, NETWORK, ADDRESS, restored)).not.toThrow();
    await expect(unlockVerifiedPrivacyBackup(freshSession, NETWORK, ADDRESS, PASSWORD))
      .resolves.toMatchObject({ spendingPublicKey: restored.spendingPublicKey });
  });

  it("never silently overwrites a different existing privacy identity", async () => {
    const storage = new MemoryStorage();
    await createPendingPrivacyBackup(storage, NETWORK, ADDRESS, PASSWORD);
    const existing = readStoredPrivacyBackup(storage, NETWORK, ADDRESS)!;
    const otherStorage = new MemoryStorage();
    await createPendingPrivacyBackup(otherStorage, NETWORK, ADDRESS, PASSWORD);
    const candidate = readStoredPrivacyBackup(otherStorage, NETWORK, ADDRESS)!;

    await expect(restoreAndVerifyPrivacyBackup(storage, NETWORK, ADDRESS, candidate, PASSWORD))
      .rejects.toBeInstanceOf(PrivacyBackupConflictError);
    expect(readStoredPrivacyBackup(storage, NETWORK, ADDRESS)).toBe(existing);
    await expect(restoreAndVerifyPrivacyBackup(storage, NETWORK, ADDRESS, candidate, PASSWORD, true))
      .resolves.toBeDefined();
    expect(readStoredPrivacyBackup(storage, NETWORK, ADDRESS)).toBe(candidate);
  });
});
