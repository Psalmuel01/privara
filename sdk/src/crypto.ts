import { serializeCV, principalCV, uintCV } from "@stacks/transactions";
import type { Intent } from "./types";

// sha256 via Web Crypto (Node 20+) or a bundled fallback
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// Mirrors hash-intent in privara-router.clar:
//   sha256( sha256(asset) | sha256(amount) | sha256(recipient) |
//           sha256(relayer) | sha256(relayer-fee) | sha256(nonce) | sha256(expiry) )
// Each field is serialized using Clarity consensus encoding before hashing,
// so the on-chain and off-chain hash values are identical.
export async function hashIntent(intent: Intent): Promise<Uint8Array> {
  const fields = [
    serializeCV(principalCV(intent.asset)),
    serializeCV(uintCV(intent.amount)),
    serializeCV(principalCV(intent.recipient)),
    serializeCV(principalCV(intent.relayer)),
    serializeCV(uintCV(intent.relayerFee)),
    serializeCV(uintCV(intent.nonce)),
    serializeCV(uintCV(intent.expiry)),
  ];

  const hashed = await Promise.all(fields.map((f) => sha256(f)));
  return sha256(concat(...hashed));
}

// Encrypt an offchain payment note for a recipient's public key.
// Uses ECIES-like construction: ephemeral ECDH + AES-GCM.
// TODO: implement with @noble/secp256k1 + @noble/ciphers
export async function encryptNote(
  _payload: Uint8Array,
  _recipientPubkey: Uint8Array
): Promise<Uint8Array> {
  throw new Error("encryptNote: not yet implemented");
}

// Decrypt a payment note using the recipient's private key.
export async function decryptNote(
  _ciphertext: Uint8Array,
  _privateKey: Uint8Array
): Promise<Uint8Array> {
  throw new Error("decryptNote: not yet implemented");
}
