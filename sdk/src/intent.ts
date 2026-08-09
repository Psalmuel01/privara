import {
  signMessageHashRsv,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { bytesToHex, hexToBytes } from "@stacks/common";
import type { Intent, SignedIntent } from "./types";
import { hashIntent, messageDigest, type Network } from "./crypto";

export function createIntent(params: Intent): Intent {
  return { ...params };
}

// Re-issue an intent as a fresh attempt of the SAME logical payment: every field is held
// fixed except the nonce, which is replaced with a new random salt, giving a distinct
// digest that settles/cancels independently of the original.
//
// !! DOUBLE-SPEND HAZARD !! Re-issuing does NOT invalidate the original. After reissue you
// hold TWO valid intents for the same payment, and a relayer may settle EITHER (or, absent
// deposit for both, whichever it gets to first). This function alone does not make a retry
// safe. The safe retry sequence, which the caller must perform, is:
//   1. cancel-intent(original) and WAIT for it to confirm as (ok true).
//        - (ok false) means a relayer already settled the original: you are done, do NOT
//          reissue, or you will pay twice.
//   2. only then reissue() and sign/broadcast the new one.
// cancel is itself best-effort (a relayer can front-run it), which is exactly why step 1
// must be confirmed before step 2. If you cannot cancel-confirm, prefer waiting for the
// original to expire over reissuing.
export function reissue(intent: Intent): Intent {
  return { ...intent, nonce: randomNonce() };
}

// A random 64-bit nonce. Intents are unordered: the router no longer enforces a
// sequential per-user counter, so the nonce is only a uniqueness salt that keeps two
// otherwise-identical payments (same asset/amount/recipient/relayer/fee/expiry) from
// hashing to the same digest -- which the router would reject as a replay. A random
// nonce needs no on-chain read, so signing is fully offline. Collision odds over 2^64
// are negligible for one user's intent volume; a same-nonce accidental duplicate simply
// fails with ERR_INTENT_USED and can be re-signed with a fresh nonce.
export function randomNonce(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

// Signs an intent with the caller's secp256k1 private key, producing the SIP-018
// digest and the 65-byte RSV signature the router's settle-intent accepts.
//
// The contract recovers the signer from the signature and uses it as the payer, so
// `user` is NOT sent on-chain. We still derive and record it here as local metadata
// (deposit/nonce lookups, display) -- it never enters the settlement args.
// `router` is the deployed router contract principal ("<address>.<name>") the intent
// settles against. It is bound into the SIP-018 domain so the signature is valid only
// against that exact deployment (cross-deployment / cross-name replay protection).
export function signIntent(
  intent: Intent,
  privateKey: string,
  network: Network,
  router: string
): SignedIntent {
  const intentHash = hashIntent(intent);
  const digest = messageDigest(intent, network, router);

  // signMessageHashRsv emits the 65-byte RSV layout (recovery byte last) that
  // Clarity's secp256k1-recover? expects, so no byte reordering is needed.
  const sigHex = signMessageHashRsv({
    messageHash: bytesToHex(digest),
    privateKey,
  });

  const stacksNetwork = network === "mainnet" ? "mainnet" : "testnet";
  const user = getAddressFromPrivateKey(privateKey, stacksNetwork);

  return {
    ...intent,
    user,
    intentHash,
    digest,
    userSig: hexToBytes(sigHex),
  };
}

// Formats a SignedIntent into the positional argument list expected by settle-intent:
//   (asset amount recipient relayer relayer-fee nonce expiry user-sig)
// `user` is intentionally absent -- the contract recovers the payer from user-sig.
// cancel-intent takes the identical argument shape, so this also builds cancel args.
export function buildSettlementArgs(si: SignedIntent) {
  return {
    asset: si.asset,
    amount: si.amount,
    recipient: si.recipient,
    relayer: si.relayer,
    relayerFee: si.relayerFee,
    nonce: si.nonce,
    expiry: si.expiry,
    userSig: si.userSig,
  };
}
