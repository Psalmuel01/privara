import { Cl, serializeCVBytes } from "@stacks/transactions";
import { sha256 } from "@noble/hashes/sha256";
import type { Intent } from "./types";

// Clarity `chain-id` keyword values. Bound into the SIP-018 domain so a signature
// made for one network can never be replayed on the other.
export const CHAIN_ID = {
  mainnet: 1n,
  testnet: 2147483648n, // 0x80000000; also what simnet reports
} as const;

export type Network = keyof typeof CHAIN_ID;

// ascii "SIP018"; the SIP-018 structured-data prefix.
const STRUCTURED_DATA_PREFIX = new Uint8Array([0x53, 0x49, 0x50, 0x30, 0x31, 0x38]);

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

// The intent as the Clarity tuple the contract hashes. Consensus serialization sorts
// keys, so field order here is cosmetic; the field SET and TYPES must match the
// contract's hash-intent exactly, or no signature will verify.
function intentTupleCV(intent: Intent) {
  return Cl.tuple({
    asset: Cl.principal(intent.asset),
    amount: Cl.uint(intent.amount),
    recipient: Cl.principal(intent.recipient),
    relayer: Cl.principal(intent.relayer),
    "relayer-fee": Cl.uint(intent.relayerFee),
    nonce: Cl.uint(intent.nonce),
    expiry: Cl.uint(intent.expiry),
  });
}

// sha256 of the consensus-serialized intent tuple. Byte-for-byte identical to the
// contract's `hash-intent` (proven by the parity test).
export function hashIntent(intent: Intent): Uint8Array {
  return sha256(serializeCVBytes(intentTupleCV(intent)));
}

// sha256 of the consensus-serialized SIP-018 domain tuple for a network. Matches the
// contract's MESSAGE_DOMAIN_HASH constant (which uses the `chain-id` keyword).
export function domainHash(network: Network): Uint8Array {
  const domain = Cl.tuple({
    name: Cl.stringAscii("privara"),
    version: Cl.stringAscii("1"),
    "chain-id": Cl.uint(CHAIN_ID[network]),
  });
  return sha256(serializeCVBytes(domain));
}

// Full SIP-018 digest the user signs:
//   sha256(0x534950303138 || domain-hash || structured-data-hash)
// This is what the contract recovers the signer from via secp256k1-recover?.
export function messageDigest(intent: Intent, network: Network): Uint8Array {
  const dataHash = hashIntent(intent);
  return sha256(concat(STRUCTURED_DATA_PREFIX, domainHash(network), dataHash));
}

// Encrypt an offchain payment note for a recipient's public key.
// Uses ECIES-like construction: ephemeral ECDH + AES-GCM.
// TODO: implement with @noble/secp256k1 + @noble/ciphers (M2)
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
