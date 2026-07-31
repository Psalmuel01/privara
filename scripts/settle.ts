// Relayer broadcasts settle-intent from a signed-intent JSON envelope.
//
//   RELAYER_KEY=<hex> PRIVARA_CORE_ADDRESS=<addr> \
//     npx tsx scripts/settle.ts <intent.json>
//
// Or pipe create-intent.ts straight in:
//   ... create-intent.ts ... | RELAYER_KEY=<hex> npx tsx scripts/settle.ts -

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
  readEnvelope,
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

interface TxStatus {
  tx_status: string;
  tx_result?: { repr?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll the tx until it leaves the mempool, then report success vs abort.
// A broadcast only means the mempool accepted the tx; the contract's replay,
// expiry, and signature guards abort at mining time, which we surface here.
async function pollResult(txid: string): Promise<boolean> {
  const base = stacksNetwork().client.baseUrl;
  const deadline = Date.now() + 5 * 60_000; // give the miner up to 5 minutes
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/extended/v1/tx/${txid}`);
    if (res.ok) {
      const tx = (await res.json()) as TxStatus;
      if (tx.tx_status !== "pending") {
        if (tx.tx_status === "success") {
          console.log("\n✔ success");
          return true;
        }
        const reason = tx.tx_result?.repr ?? "";
        console.log(`\n✘ ${tx.tx_status} ${reason}`.trimEnd());
        return false;
      }
    }
    process.stderr.write(".");
    await sleep(5_000);
  }
  console.log("\n? still pending after 5 min -- check the explorer");
  return false;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: settle.ts <intent.json | ->");

  const e = readEnvelope<Envelope>(path);
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

  const ok = await pollResult(res.txid);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
