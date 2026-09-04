import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { sharedSecretForRecipient, sharedSecretForSender } from "./derivation";

export const STEALTH_NOTE_VERSION = 1 as const;
const NOTE_KEY_DOMAIN = new TextEncoder().encode("privara:note-key:v1");
const ANNOUNCEMENT_DOMAIN = new TextEncoder().encode("privara:announcement:v1");
const AES_GCM_NONCE_BYTES = 12;

export interface AnnouncementContext {
  network: "mainnet" | "testnet";
  router: string;
  stealthPrincipal: string;
  asset: string;
  registryEpoch: bigint;
  protocolVersion?: number;
}

export interface EncryptedStealthNote {
  version: typeof STEALTH_NOTE_VERSION;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const length = arrays.reduce((sum, item) => sum + item.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const item of arrays) {
    output.set(item, offset);
    offset += item.length;
  }
  return output;
}

// TypeScript 7 distinguishes ArrayBuffer-backed views from SharedArrayBuffer-capable
// Uint8Arrays. Web Crypto requires the former, so copy at the API boundary.
function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function uint64(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffffffffffffffffn) {
    throw new Error("registry epoch must fit in uint64");
  }
  const output = new Uint8Array(8);
  let remaining = value;
  for (let index = 7; index >= 0; index--) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function lengthPrefixed(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 0xffff) throw new Error("announcement context field is too long");
  return concatBytes(
    new Uint8Array([(bytes.length >>> 8) & 0xff, bytes.length & 0xff]),
    bytes
  );
}

// Canonical binary associated data. Length prefixes avoid ambiguous concatenation.
// Ciphertext authentication binds the note to this exact deployment, destination,
// asset, registry epoch, network, and protocol version.
export function announcementAssociatedData(context: AnnouncementContext): Uint8Array {
  const version = context.protocolVersion ?? STEALTH_NOTE_VERSION;
  if (!Number.isInteger(version) || version < 0 || version > 255) {
    throw new Error("protocol version must fit in one byte");
  }
  return concatBytes(
    ANNOUNCEMENT_DOMAIN,
    new Uint8Array([version]),
    lengthPrefixed(context.network),
    lengthPrefixed(context.router),
    lengthPrefixed(context.stealthPrincipal),
    lengthPrefixed(context.asset),
    uint64(context.registryEpoch)
  );
}

function noteKey(sharedPoint: Uint8Array, associatedData: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedPoint, undefined, concatBytes(NOTE_KEY_DOMAIN, associatedData), 32);
}

function webCrypto(): Crypto {
  const provider = globalThis.crypto;
  if (!provider?.subtle || !provider.getRandomValues) {
    throw new Error("Web Crypto API is required for stealth note encryption");
  }
  return provider;
}

async function aesKey(keyBytes: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return webCrypto().subtle.importKey("raw", arrayBuffer(keyBytes), "AES-GCM", false, [usage]);
}

export async function encryptStealthNote(
  plaintext: Uint8Array,
  viewingPublicKey: Uint8Array,
  ephemeralPrivateKey: Uint8Array,
  context: AnnouncementContext,
  nonce?: Uint8Array
): Promise<EncryptedStealthNote> {
  const iv = nonce ? new Uint8Array(nonce) : webCrypto().getRandomValues(new Uint8Array(AES_GCM_NONCE_BYTES));
  if (iv.length !== AES_GCM_NONCE_BYTES) throw new Error("AES-GCM nonce must be 12 bytes");
  const associatedData = announcementAssociatedData(context);
  const sharedPoint = sharedSecretForSender(viewingPublicKey, ephemeralPrivateKey);
  const key = await aesKey(noteKey(sharedPoint, associatedData), "encrypt");
  const encrypted = await webCrypto().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: arrayBuffer(iv),
      additionalData: arrayBuffer(associatedData),
      tagLength: 128,
    },
    key,
    arrayBuffer(plaintext)
  );
  return { version: STEALTH_NOTE_VERSION, nonce: iv, ciphertext: new Uint8Array(encrypted) };
}

export async function decryptStealthNote(
  note: EncryptedStealthNote,
  viewingPrivateKey: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  context: AnnouncementContext
): Promise<Uint8Array> {
  if (note.version !== STEALTH_NOTE_VERSION) throw new Error("unsupported stealth note version");
  if (note.nonce.length !== AES_GCM_NONCE_BYTES) throw new Error("AES-GCM nonce must be 12 bytes");
  const associatedData = announcementAssociatedData(context);
  const sharedPoint = sharedSecretForRecipient(viewingPrivateKey, ephemeralPublicKey);
  const key = await aesKey(noteKey(sharedPoint, associatedData), "decrypt");
  try {
    const plaintext = await webCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: arrayBuffer(note.nonce),
        additionalData: arrayBuffer(associatedData),
        tagLength: 128,
      },
      key,
      arrayBuffer(note.ciphertext)
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("stealth note authentication failed");
  }
}
