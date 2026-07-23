// Deposit SIP-010 tokens into the router (must run before creating an intent).
//
//   USER_KEY=<hex> PRIVARA_CORE_ADDRESS=<addr> npx tsx scripts/deposit.ts <amount>
//
// <amount> is in the token's base units.

import {
  makeContractCall,
  broadcastTransaction,
  getAddressFromPrivateKey,
  principalCV,
  uintCV,
} from "@stacks/transactions";
import {
  ROUTER_NAME,
  asset,
  coreAddress,
  explorerTxUrl,
  networkName,
  requireKey,
  stacksNetwork,
} from "./_config";

async function main() {
  const amount = BigInt(process.argv[2] ?? "");
  if (!(amount > 0n)) throw new Error("usage: deposit.ts <amount> (positive integer)");

  const senderKey = requireKey("USER_KEY");
  const from = getAddressFromPrivateKey(senderKey, networkName());
  const assetId = asset();

  console.log(`Depositing ${amount} of ${assetId}`);
  console.log(`  from user   : ${from}`);
  console.log(`  into router : ${coreAddress()}.${ROUTER_NAME}`);

  const tx = await makeContractCall({
    contractAddress: coreAddress(),
    contractName: ROUTER_NAME,
    functionName: "deposit",
    functionArgs: [principalCV(assetId), uintCV(amount)],
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
