import type { Intent, SignedIntent } from "./types";
import { hashIntent } from "./crypto";

export function createIntent(params: Intent): Intent {
  return { ...params };
}

// Signs an intent using the caller's secp256k1 private key.
// The resulting SignedIntent is what the relayer submits to settle-intent.
// TODO: replace placeholder stubs with @noble/secp256k1 sign() call
export async function signIntent(
  intent: Intent,
  _privateKey: Uint8Array
): Promise<SignedIntent> {
  const intentHash = await hashIntent(intent);

  // placeholder — replace with real secp256k1 signing
  const userPubkey = new Uint8Array(33);
  const userSig = new Uint8Array(65);

  return { ...intent, intentHash, userPubkey, userSig };
}

// Formats a SignedIntent into the argument list expected by settle-intent.
export function buildSettlementArgs(si: SignedIntent) {
  return {
    asset: si.asset,
    amount: si.amount,
    recipient: si.recipient,
    relayer: si.relayer,
    relayerFee: si.relayerFee,
    nonce: si.nonce,
    expiry: si.expiry,
    userPubkey: si.userPubkey,
    userSig: si.userSig,
  };
}
