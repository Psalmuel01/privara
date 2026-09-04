// Privara stealth privacy identity (M2).
//
// SEED AUTHORITY (spec amendment, MUST): the privacy seed is the RECOVERY ROOT. It is an
// INDEPENDENT cryptographically random 32 bytes -- it is NOT derived from a wallet
// signature. Wallet signing determinism is not assumed: repeated SIP-018 signatures are
// not guaranteed to produce identical bytes across wallet versions, crypto libraries,
// hardware wallets, or MPC signers, so a signature-derived seed could make stealth funds
// permanently unrecoverable after a wallet/signer change. Wallet-signature material MAY be
// used only as a non-authoritative local cache/encryption convenience, never as the
// canonical key source. The seed MUST support explicit export/import and MUST NOT be
// logged, transmitted to the relayer/indexer, or persisted unencrypted.

import { CURVE, Point, utils } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { scalarToBytes } from "./derivation";

const SPENDING_DOMAIN = new TextEncoder().encode("privara:spending-key:v1");
const VIEWING_DOMAIN = new TextEncoder().encode("privara:viewing-key:v1");

const N = CURVE.n;

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// Domain-separated seed -> secp256k1 scalar in [1, n).
function deriveScalar(domain: Uint8Array, seed: Uint8Array): bigint {
  const digest = sha256(concatBytes(domain, seed));
  let scalar = 0n;
  for (const byte of digest) scalar = (scalar << 8n) | BigInt(byte);
  scalar = utils.mod(scalar, N);
  if (scalar === 0n) throw new Error("derived a zero scalar (astronomically unlikely)");
  return scalar;
}

export interface PrivacyIdentity {
  // The recovery root. 32 random bytes. Guard as highly sensitive wallet material.
  privacySeed: Uint8Array;
  spendingPrivateKey: Uint8Array; // p   (kept client-side)
  viewingPrivateKey: Uint8Array; // v   (kept client-side)
  spendingPublicKey: Uint8Array; // P   (registered publicly, compressed 33b)
  viewingPublicKey: Uint8Array; // V   (registered publicly, compressed 33b)
}

// Derive the full identity from a given seed (import path, and used by generateIdentity).
export function identityFromSeed(privacySeed: Uint8Array): PrivacyIdentity {
  if (privacySeed.length !== 32) throw new Error("privacy seed must be 32 bytes");
  const p = deriveScalar(SPENDING_DOMAIN, privacySeed);
  const v = deriveScalar(VIEWING_DOMAIN, privacySeed);
  const spendingPrivateKey = scalarToBytes(p);
  const viewingPrivateKey = scalarToBytes(v);
  return {
    privacySeed,
    spendingPrivateKey,
    viewingPrivateKey,
    spendingPublicKey: Point.BASE.multiply(p).toRawBytes(true),
    viewingPublicKey: Point.BASE.multiply(v).toRawBytes(true),
  };
}

// Generate a fresh identity from independent CSPRNG randomness (NOT a wallet signature).
export function generateIdentity(): PrivacyIdentity {
  return identityFromSeed(utils.randomPrivateKey());
}
