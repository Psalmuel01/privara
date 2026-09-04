// Privara stealth-address derivation (M2). A sender pays a recipient's *normal* address but settlement lands on a fresh
// one-time principal that is not publicly linked to the recipient's long-term wallet.
//
// The math (secp256k1, group order n, generator G):
//   recipient long-term keys:  spending p -> P = pG ;  viewing v -> V = vG   (P, V registered)
//   sender picks ephemeral r -> R = rG, computes shared point Q = rV
//   h = HashToScalar("privara:stealth:v1" || compressed(Q))
//   one-time pubkey P' = P + hG           -> Stacks principal S (the payment recipient)
//   recipient recomputes Q = vR (since rV == vR), same h, same P'
//   one-time privkey  p' = (p + h) mod n  satisfies p'G == P', so it controls S.
//
// This module is pure EC math over @noble/secp256k1; address conversion lives in
// ./address so this file stays chain-agnostic and unit-testable in isolation.

import { CURVE, Point, utils } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";

// Domain-separation tags (spec §31). Distinct contexts must never share a hash input.
const STEALTH_DOMAIN = new TextEncoder().encode("privara:stealth:v1");

const N = CURVE.n;

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// Map a domain-tagged shared secret to a secp256k1 scalar in [1, n). We reduce the
// sha256 digest mod n and reject the (cryptographically negligible) zero result rather
// than silently producing an invalid key.
export function hashToScalar(domain: Uint8Array, ...data: Uint8Array[]): bigint {
  const digest = sha256(concatBytes(domain, ...data));
  let scalar = 0n;
  for (const byte of digest) scalar = (scalar << 8n) | BigInt(byte);
  scalar = utils.mod(scalar, N);
  if (scalar === 0n) throw new Error("hashToScalar produced zero (retry with fresh input)");
  return scalar;
}

// Compressed 33-byte encoding of a point.
function compressed(point: Point): Uint8Array {
  return point.toRawBytes(true);
}

// A scalar (private key) as a 32-byte big-endian buffer, which is what stacks.js and
// noble both expect for a private key.
export function scalarToBytes(scalar: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let s = scalar;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(s & 0xffn);
    s >>= 8n;
  }
  return out;
}

function bytesToScalar(bytes: Uint8Array): bigint {
  let s = 0n;
  for (const b of bytes) s = (s << 8n) | BigInt(b);
  return s;
}

function checkedScalar(bytes: Uint8Array, label: string): bigint {
  if (bytes.length !== 32) throw new Error(`${label} must be 32 bytes`);
  const scalar = bytesToScalar(bytes);
  if (scalar <= 0n || scalar >= N) throw new Error(`${label} out of range`);
  return scalar;
}

function checkedPoint(bytes: Uint8Array, label: string): Point {
  if (bytes.length !== 33) throw new Error(`${label} must be a compressed 33-byte key`);
  if (bytes[0] !== 0x02 && bytes[0] !== 0x03) {
    throw new Error(`${label} must use compressed secp256k1 encoding`);
  }
  try {
    return Point.fromHex(bytes);
  } catch {
    throw new Error(`${label} is not a valid secp256k1 point`);
  }
}

export interface StealthOutput {
  // Compressed one-time public key P' (33 bytes). Callers convert to a Stacks principal.
  stealthPublicKey: Uint8Array;
  // The sender's ephemeral public key R (33 bytes), published in the announcement.
  ephemeralPublicKey: Uint8Array;
}

// SENDER side: given the recipient's registered spending (P) and viewing (V) public
// keys, derive a fresh one-time stealth public key and the ephemeral key to announce.
// `ephemeralPrivateKey` MUST be fresh CSPRNG bytes per payment (spec §30.6); it is
// accepted as a parameter so callers can supply audited randomness and tests can pin it.
export function deriveStealthForSender(
  spendingPublicKey: Uint8Array,
  viewingPublicKey: Uint8Array,
  ephemeralPrivateKey: Uint8Array
): StealthOutput {
  const r = checkedScalar(ephemeralPrivateKey, "ephemeral private key");

  const P = checkedPoint(spendingPublicKey, "spending public key");
  const V = checkedPoint(viewingPublicKey, "viewing public key");
  const R = Point.BASE.multiply(r);

  // Shared point Q = rV. h = HashToScalar(domain || compressed(Q)). P' = P + hG.
  const Q = V.multiply(r);
  const h = hashToScalar(STEALTH_DOMAIN, compressed(Q));
  const Pprime = P.add(Point.BASE.multiply(h));

  return {
    stealthPublicKey: compressed(Pprime),
    ephemeralPublicKey: compressed(R),
  };
}

// Watch-only RECIPIENT side: v + public P + announced R is sufficient to detect a
// payment. This deliberately does not require p and cannot derive spending authority.
export function deriveStealthPublicKeyForRecipient(
  viewingPrivateKey: Uint8Array,
  spendingPublicKey: Uint8Array,
  ephemeralPublicKey: Uint8Array
): Uint8Array {
  const v = checkedScalar(viewingPrivateKey, "viewing private key");
  const P = checkedPoint(spendingPublicKey, "spending public key");
  const R = checkedPoint(ephemeralPublicKey, "ephemeral public key");
  const Q = R.multiply(v);
  const h = hashToScalar(STEALTH_DOMAIN, compressed(Q));
  return compressed(P.add(Point.BASE.multiply(h)));
}

// ECDH helpers used by authenticated announcement encryption. They expose only the
// compressed shared point, never either private scalar.
export function sharedSecretForSender(
  viewingPublicKey: Uint8Array,
  ephemeralPrivateKey: Uint8Array
): Uint8Array {
  const V = checkedPoint(viewingPublicKey, "viewing public key");
  const r = checkedScalar(ephemeralPrivateKey, "ephemeral private key");
  return compressed(V.multiply(r));
}

export function sharedSecretForRecipient(
  viewingPrivateKey: Uint8Array,
  ephemeralPublicKey: Uint8Array
): Uint8Array {
  const v = checkedScalar(viewingPrivateKey, "viewing private key");
  const R = checkedPoint(ephemeralPublicKey, "ephemeral public key");
  return compressed(R.multiply(v));
}

// RECIPIENT side: given the viewing private key v, the recipient's spending private key
// p, and the announced ephemeral public key R, recompute the one-time key pair. Returns
// the one-time private key p' and its public key P'. If the derived P' does not match the
// announced stealth key, the payment is not for this recipient (compare upstream).
export function deriveStealthForRecipient(
  viewingPrivateKey: Uint8Array,
  spendingPrivateKey: Uint8Array,
  ephemeralPublicKey: Uint8Array
): { stealthPrivateKey: Uint8Array; stealthPublicKey: Uint8Array } {
  const v = checkedScalar(viewingPrivateKey, "viewing private key");
  const p = checkedScalar(spendingPrivateKey, "spending private key");

  const R = checkedPoint(ephemeralPublicKey, "ephemeral public key");
  // Q = vR == rV (ECDH), so the recipient recovers the same shared point and same h.
  const Q = R.multiply(v);
  const h = hashToScalar(STEALTH_DOMAIN, compressed(Q));

  // p' = (p + h) mod n ; P' = p'G = P + hG.
  const pPrime = utils.mod(p + h, N);
  if (pPrime === 0n) throw new Error("derived stealth scalar is zero");
  const Pprime = Point.BASE.multiply(pPrime);

  return {
    stealthPrivateKey: scalarToBytes(pPrime),
    stealthPublicKey: compressed(Pprime),
  };
}
