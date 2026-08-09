// Check whether an intent has settled and print deposit/nonce status.
//
//   PRIVARA_CORE_ADDRESS=<addr> npx tsx scripts/status.ts <intent.json | ->
//
// Reports is-intent-settled for the intent's digest, plus the user's current
// on-chain nonce and remaining deposit for the intent's asset.

import {
  fetchCallReadOnlyFunction,
  principalCV,
  bufferCV,
  cvToValue,
} from "@stacks/transactions";
import { hexToBytes } from "@stacks/common";
import {
  ROUTER_NAME,
  coreAddress,
  explorerTxUrl,
  networkName,
  readEnvelope,
} from "./_config";

interface Envelope {
  asset: string;
  user: string;
  digest: string;
}

async function readOnly(functionName: string, functionArgs: any[], sender: string) {
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: coreAddress(),
    contractName: ROUTER_NAME,
    functionName,
    functionArgs,
    senderAddress: sender,
    network: networkName(),
  });
  return cvToValue(cv);
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: status.ts <intent.json | ->");
  const e = readEnvelope<Envelope>(path);

  const settled = await readOnly(
    "is-intent-settled",
    [bufferCV(hexToBytes(e.digest))],
    e.user
  );
  const deposit = await readOnly(
    "get-deposit",
    [principalCV(e.user), principalCV(e.asset)],
    e.user
  );

  console.log(`Intent digest : ${e.digest}`);
  console.log(`  settled     : ${settled}`);
  console.log(`User ${e.user}`);
  console.log(`  deposit     : ${deposit} of ${e.asset}`);
  console.log(`\nExplorer (contract): ${explorerTxUrl("").replace(/txid\/.*/, "")}address/${coreAddress()}?chain=${networkName()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
