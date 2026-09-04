import { bytesToHex, hexToBytes } from "@stacks/common";

const BACKUP_FORMAT = "privara-privacy-seed" as const;
const BACKUP_VERSION = 1 as const;
const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

export interface EncryptedPrivacySeedBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  kdf: {
    name: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
  };
  cipher: {
    name: "AES-256-GCM";
    nonce: string;
    ciphertext: string;
  };
}

function webCrypto(): Crypto {
  const provider = globalThis.crypto;
  if (!provider?.subtle || !provider.getRandomValues) {
    throw new Error("Web Crypto API is required for privacy seed backup");
  }
  return provider;
}

function validatePassword(password: string): void {
  if (password.length < 12) throw new Error("backup password must be at least 12 characters");
}

async function backupKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  usage: KeyUsage
): Promise<CryptoKey> {
  const material = await webCrypto().subtle.importKey(
    "raw",
    arrayBuffer(new TextEncoder().encode(password)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return webCrypto().subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: arrayBuffer(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

function backupAssociatedData(): Uint8Array {
  return new TextEncoder().encode(`${BACKUP_FORMAT}:v${BACKUP_VERSION}`);
}

export async function exportPrivacySeed(
  privacySeed: Uint8Array,
  password: string
): Promise<EncryptedPrivacySeedBackup> {
  if (privacySeed.length !== 32) throw new Error("privacy seed must be 32 bytes");
  validatePassword(password);
  const salt = webCrypto().getRandomValues(new Uint8Array(SALT_BYTES));
  const nonce = webCrypto().getRandomValues(new Uint8Array(NONCE_BYTES));
  const key = await backupKey(password, salt, PBKDF2_ITERATIONS, "encrypt");
  const encrypted = await webCrypto().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: arrayBuffer(nonce),
      additionalData: arrayBuffer(backupAssociatedData()),
      tagLength: 128,
    },
    key,
    arrayBuffer(privacySeed)
  );
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: {
      name: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToHex(salt),
    },
    cipher: {
      name: "AES-256-GCM",
      nonce: bytesToHex(nonce),
      ciphertext: bytesToHex(new Uint8Array(encrypted)),
    },
  };
}

export async function importPrivacySeed(
  backup: EncryptedPrivacySeedBackup,
  password: string
): Promise<Uint8Array> {
  validatePassword(password);
  if (backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
    throw new Error("unsupported privacy seed backup format");
  }
  if (backup.kdf.name !== "PBKDF2-SHA256" || backup.cipher.name !== "AES-256-GCM") {
    throw new Error("unsupported privacy seed backup algorithms");
  }
  if (backup.kdf.iterations < PBKDF2_ITERATIONS) {
    throw new Error("privacy seed backup uses an unsafe PBKDF2 iteration count");
  }
  const salt = hexToBytes(backup.kdf.salt);
  const nonce = hexToBytes(backup.cipher.nonce);
  const ciphertext = hexToBytes(backup.cipher.ciphertext);
  if (salt.length !== SALT_BYTES || nonce.length !== NONCE_BYTES) {
    throw new Error("invalid privacy seed backup parameters");
  }
  const key = await backupKey(password, salt, backup.kdf.iterations, "decrypt");
  try {
    const decrypted = await webCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: arrayBuffer(nonce),
        additionalData: arrayBuffer(backupAssociatedData()),
        tagLength: 128,
      },
      key,
      arrayBuffer(ciphertext)
    );
    const privacySeed = new Uint8Array(decrypted);
    if (privacySeed.length !== 32) throw new Error("decrypted privacy seed has invalid length");
    return privacySeed;
  } catch {
    throw new Error("privacy seed backup authentication failed");
  }
}
