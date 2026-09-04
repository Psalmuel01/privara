// Convert a stealth public key to a Stacks principal.
//
// CRITICAL (proven in the Phase 0 spike): on this @stacks/transactions version, a
// standard principal derived from a 32-byte private key hashes the UNCOMPRESSED public
// key. So the sender MUST derive the stealth address from the uncompressed P', or it will
// not equal the address the recipient's p' signs from -- and the funds would be locked at
// an address the recipient cannot spend.
//
// We therefore always feed the uncompressed (65-byte, 0x04-prefixed) form to
// getAddressFromPublicKey. The stealth derivation module produces compressed points, so
// this module re-expands to uncompressed via noble before conversion.

import { Point } from "@noble/secp256k1";
import { getAddressFromPublicKey } from "@stacks/transactions";
import { bytesToHex } from "@stacks/common";

export type StacksNetworkName = "mainnet" | "testnet";

// Uncompressed (65-byte) encoding of a public key given in either form.
export function toUncompressed(publicKey: Uint8Array): Uint8Array {
  return Point.fromHex(publicKey).toRawBytes(false);
}

// Stealth public key (compressed or uncompressed) -> Stacks principal string.
// Always hashes the uncompressed form so it matches getAddressFromPrivateKey(p').
export function stealthPublicKeyToAddress(
  stealthPublicKey: Uint8Array,
  network: StacksNetworkName
): string {
  const uncompressed = toUncompressed(stealthPublicKey);
  return getAddressFromPublicKey(bytesToHex(uncompressed), network);
}
