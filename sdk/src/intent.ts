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
// The contract recovers the signer from the signature and asserts it equals the
// `user` principal, so we derive and record that principal here from the same key.
export function signIntent(
  intent: Intent,
  privateKey: string,
  network: Network
): SignedIntent {
  const intentHash = hashIntent(intent);
  const digest = messageDigest(intent, network);

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
//   (asset amount recipient relayer relayer-fee nonce expiry user user-sig)
export function buildSettlementArgs(si: SignedIntent) {
  return {
    asset: si.asset,
    amount: si.amount,
    recipient: si.recipient,
    relayer: si.relayer,
    relayerFee: si.relayerFee,
    nonce: si.nonce,
    expiry: si.expiry,
    user: si.user,
    userSig: si.userSig,
  };
}
