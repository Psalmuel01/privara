import { Point } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { Cl, serializeCVBytes } from "@stacks/transactions";

export const STEALTH_ANNOUNCEMENT_VERSION = 1 as const;
export const MAX_STEALTH_CIPHERTEXT_BYTES = 1024;

// Canonical payload whose hash will be bound into the versioned M2 intent. A settlement
// id is intentionally absent: it is the final intent digest and would create a circular
// hash dependency. The router/event or indexer associates that digest after settlement.
export interface StealthAnnouncementPayload {
  version: typeof STEALTH_ANNOUNCEMENT_VERSION;
  stealthPrincipal: string;
  ephemeralPublicKey: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  asset: string;
  registryEpoch: bigint;
}

export function validateStealthAnnouncement(payload: StealthAnnouncementPayload): void {
  if (payload.version !== STEALTH_ANNOUNCEMENT_VERSION) {
    throw new Error("unsupported stealth announcement version");
  }
  if (payload.ephemeralPublicKey.length !== 33) {
    throw new Error("ephemeral public key must be 33 bytes");
  }
  if (payload.ephemeralPublicKey[0] !== 0x02 && payload.ephemeralPublicKey[0] !== 0x03) {
    throw new Error("ephemeral public key must use compressed secp256k1 encoding");
  }
  try {
    Point.fromHex(payload.ephemeralPublicKey);
  } catch {
    throw new Error("ephemeral public key is not a valid secp256k1 point");
  }
  if (payload.nonce.length !== 12) throw new Error("announcement nonce must be 12 bytes");
  if (payload.ciphertext.length < 16) {
    throw new Error("announcement ciphertext must include an AES-GCM authentication tag");
  }
  if (payload.ciphertext.length > MAX_STEALTH_CIPHERTEXT_BYTES) {
    throw new Error(`announcement ciphertext exceeds ${MAX_STEALTH_CIPHERTEXT_BYTES} bytes`);
  }
  if (payload.registryEpoch < 0n) throw new Error("registry epoch must be non-negative");
}

// Canonical encoding uses Clarity consensus serialization so a future M2 router can
// reproduce the hash exactly before emitting the payload. Key names and types are wire
// protocol and MUST be versioned if changed.
export function serializeStealthAnnouncement(payload: StealthAnnouncementPayload): Uint8Array {
  validateStealthAnnouncement(payload);
  return serializeCVBytes(
    Cl.tuple({
      asset: Cl.principal(payload.asset),
      ciphertext: Cl.buffer(payload.ciphertext),
      "ephemeral-key": Cl.buffer(payload.ephemeralPublicKey),
      nonce: Cl.buffer(payload.nonce),
      "registry-epoch": Cl.uint(payload.registryEpoch),
      "stealth-principal": Cl.principal(payload.stealthPrincipal),
      version: Cl.uint(payload.version),
    })
  );
}

export function hashStealthAnnouncement(payload: StealthAnnouncementPayload): Uint8Array {
  return sha256(serializeStealthAnnouncement(payload));
}
