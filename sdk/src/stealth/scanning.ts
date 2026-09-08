import { bytesToHex } from "@stacks/common";
import { stealthPublicKeyToAddress, type StacksNetworkName } from "./address";
import {
  deriveStealthForRecipient,
  deriveStealthPublicKeyForRecipient,
} from "./derivation";
import {
  decryptStealthNote,
  type AnnouncementContext,
  type EncryptedStealthNote,
} from "./encryption";

export interface StealthAnnouncement {
  stealthPrincipal: string;
  ephemeralPublicKey: Uint8Array;
  note: EncryptedStealthNote;
  context: AnnouncementContext;
}

export interface DetectedStealthPayment {
  stealthPrincipal: string;
  plaintext: Uint8Array;
  stealthPrivateKey?: Uint8Array;
}

export interface InvalidScanCandidateMetadata {
  index: number;
  stealthPrincipal?: string;
  reason: "invalid_announcement";
}

function safePrincipal(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Z0-9]{28,50}(?:\.[a-zA-Z0-9_-]{1,40})?$/.test(value)
    ? value
    : undefined;
}

export async function scanAnnouncement(
  announcement: StealthAnnouncement,
  viewingPrivateKey: Uint8Array,
  spendingPublicKey: Uint8Array,
  network: StacksNetworkName,
  spendingPrivateKey?: Uint8Array
): Promise<DetectedStealthPayment | null> {
  if (announcement.context.network !== network) return null;
  if (announcement.context.stealthPrincipal !== announcement.stealthPrincipal) {
    throw new Error("announcement context does not match stealth principal");
  }

  // Invalid curve points are parser failures, not ordinary non-matches. Let the batch
  // scanner catch this candidate, report safe metadata, and continue with later entries.
  const candidatePublicKey = deriveStealthPublicKeyForRecipient(
    viewingPrivateKey,
    spendingPublicKey,
    announcement.ephemeralPublicKey
  );
  const candidateAddress = stealthPublicKeyToAddress(candidatePublicKey, network);
  if (candidateAddress !== announcement.stealthPrincipal) return null;

  const plaintext = await decryptStealthNote(
    announcement.note,
    viewingPrivateKey,
    announcement.ephemeralPublicKey,
    announcement.context
  );

  let stealthPrivateKey: Uint8Array | undefined;
  if (spendingPrivateKey) {
    const spendable = deriveStealthForRecipient(
      viewingPrivateKey,
      spendingPrivateKey,
      announcement.ephemeralPublicKey
    );
    if (bytesToHex(spendable.stealthPublicKey) !== bytesToHex(candidatePublicKey)) {
      throw new Error("spending private key does not match registered spending public key");
    }
    stealthPrivateKey = spendable.stealthPrivateKey;
  }

  return { stealthPrincipal: announcement.stealthPrincipal, plaintext, stealthPrivateKey };
}

export async function scanAnnouncements(
  announcements: StealthAnnouncement[],
  viewingPrivateKey: Uint8Array,
  spendingPublicKey: Uint8Array,
  network: StacksNetworkName,
  spendingPrivateKey?: Uint8Array,
  onInvalid?: (metadata: InvalidScanCandidateMetadata) => void
): Promise<DetectedStealthPayment[]> {
  const detected: DetectedStealthPayment[] = [];
  for (const [index, announcement] of announcements.entries()) {
    try {
      const payment = await scanAnnouncement(
        announcement,
        viewingPrivateKey,
        spendingPublicKey,
        network,
        spendingPrivateKey
      );
      if (payment) detected.push(payment);
    } catch {
      // A malformed or unauthentic candidate must not stop scanning later entries.
      onInvalid?.({
        index,
        stealthPrincipal: safePrincipal(announcement?.stealthPrincipal),
        reason: "invalid_announcement",
      });
    }
  }
  return detected;
}
