// Build and sign a payment intent offline, printing it as JSON for the relayer.
//
//   USER_KEY=<hex> PRIVARA_CORE_ADDRESS=<addr> \
//     npx tsx scripts/create-intent.ts <recipient> <relayer> <amount> <relayerFee> [expiryBlocks]
//
// Nothing is broadcast: the user signs locally and hands the JSON to a relayer,
// who runs settle.ts. The nonce is fetched from the router so intents are ordered.

import {
  fetchCallReadOnlyFunction,
  getAddressFromPrivateKey,
  principalCV,
  cvToValue,
} from "@stacks/transactions";
import { bytesToHex } from "@stacks/common";
import { createIntent, signIntent } from "../sdk/src";
import {
  ROUTER_NAME,
  asset,
  coreAddress,
  network,
  networkName,
  requireKey,
  stacksNetwork,
} from "./_config";

const DEFAULT_EXPIRY_WINDOW = 200; // blocks ahead of the current tip

async function currentBlockHeight(): Promise<number> {
  const base = stacksNetwork();
  const res = await fetch(`${base.client.baseUrl}/v2/info`);
  const info = (await res.json()) as { stacks_tip_height: number };
  return info.stacks_tip_height;
}

async function getNonce(user: string): Promise<bigint> {
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: coreAddress(),
    contractName: ROUTER_NAME,
    functionName: "get-nonce",
    functionArgs: [principalCV(user)],
    senderAddress: user,
    network: networkName(),
  });
  return BigInt(cvToValue(cv));
}

async function main() {
  const [recipient, relayer, amountStr, feeStr, expiryStr] = process.argv.slice(2);
  if (!recipient || !relayer || !amountStr || !feeStr) {
    throw new Error(
      "usage: create-intent.ts <recipient> <relayer> <amount> <relayerFee> [expiryBlocks]"
    );
  }

  const senderKey = requireKey("USER_KEY");
  const user = getAddressFromPrivateKey(senderKey, networkName());
  const nonce = await getNonce(user);

  const tip = await currentBlockHeight();
  const expiry = expiryStr
    ? Number(expiryStr)
    : tip + DEFAULT_EXPIRY_WINDOW;

  const intent = createIntent({
    asset: asset(),
    amount: BigInt(amountStr),
    recipient,
    relayer,
    relayerFee: BigInt(feeStr),
    nonce,
    expiry,
  });

  const signed = signIntent(intent, senderKey, network());

  // Serialize to a relayer-friendly JSON envelope (bigints -> strings, bytes -> hex).
  const envelope = {
    network: network(),
    asset: signed.asset,
    amount: signed.amount.toString(),
    recipient: signed.recipient,
    relayer: signed.relayer,
    relayerFee: signed.relayerFee.toString(),
    nonce: signed.nonce.toString(),
    expiry: signed.expiry,
    user: signed.user,
    intentHash: bytesToHex(signed.intentHash),
    digest: bytesToHex(signed.digest),
    userSig: bytesToHex(signed.userSig),
  };

  console.error(
    `Signed intent for user ${user} (nonce ${nonce}, expiry block ${expiry}, tip ${tip})`
  );
  // The JSON envelope goes to stdout so it can be piped straight into settle.ts.
  console.log(JSON.stringify(envelope, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
