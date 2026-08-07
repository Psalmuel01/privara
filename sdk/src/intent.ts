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
