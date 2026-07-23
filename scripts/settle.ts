// Relayer broadcasts settle-intent from a signed-intent JSON envelope.
//
//   RELAYER_KEY=<hex> PRIVARA_CORE_ADDRESS=<addr> \
//     npx tsx scripts/settle.ts <intent.json>
//
// Or pipe create-intent.ts straight in:
//   ... create-intent.ts ... | RELAYER_KEY=<hex> npx tsx scripts/settle.ts -

import { readFileSync } from "node:fs";
import {
  makeContractCall,
  broadcastTransaction,
  getAddressFromPrivateKey,
  principalCV,
  uintCV,
  bufferCV,
} from "@stacks/transactions";
import { hexToBytes } from "@stacks/common";
import {
  ROUTER_NAME,
  coreAddress,
  explorerTxUrl,
  networkName,
  requireKey,
  stacksNetwork,
} from "./_config";

interface Envelope {
  asset: string;
  amount: string;
  recipient: string;
  relayer: string;
  relayerFee: string;
  nonce: string;
  expiry: number;
  user: string;
  userSig: string;
}

function readEnvelope(path: string): Envelope {
  const raw = path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
  return JSON.parse(raw) as Envelope;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: settle.ts <intent.json | ->");

  const e = readEnvelope(path);
  const senderKey = requireKey("RELAYER_KEY");
  const relayerAddr = getAddressFromPrivateKey(senderKey, networkName());

  if (relayerAddr !== e.relayer) {
    console.warn(
      `WARNING: RELAYER_KEY derives ${relayerAddr} but the intent names relayer ${e.relayer}. ` +
        `The router settles from the caller regardless, but only the bound relayer is credited the fee.`
    );
  }

  console.log(`Settling intent for user ${e.user}`);
  console.log(`  recipient : ${e.recipient} (gets ${BigInt(e.amount) - BigInt(e.relayerFee)})`);
  console.log(`  relayer   : ${e.relayer} (fee ${e.relayerFee})`);

  const tx = await makeContractCall({
    contractAddress: coreAddress(),
    contractName: ROUTER_NAME,
    functionName: "settle-intent",
    functionArgs: [
      principalCV(e.asset),
      uintCV(BigInt(e.amount)),
      principalCV(e.recipient),
      principalCV(e.relayer),
      uintCV(BigInt(e.relayerFee)),
      uintCV(BigInt(e.nonce)),
      uintCV(BigInt(e.expiry)),
      principalCV(e.user),
      bufferCV(hexToBytes(e.userSig)),
    ],
    senderKey,
    network: networkName(),
    postConditionMode: "allow",
  });

  const res = await broadcastTransaction({ transaction: tx, network: stacksNetwork() });
  if ("error" in res) {
    throw new Error(`broadcast failed: ${res.error} ${res.reason ?? ""}`);
  }
  console.log(`\nBroadcast: ${res.txid}`);
  console.log(explorerTxUrl(res.txid));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
