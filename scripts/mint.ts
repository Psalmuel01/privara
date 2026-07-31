// Mint mock-token to an address. TEST-ONLY: mock-token is the free, mintable
// stand-in for sBTC used to dry-run the full testnet flow before switching the
// router's SBTC constant to real sBTC. Not used in the real sBTC demo.
//
//   USER_KEY=<hex> PRIVARA_CORE_ADDRESS=<addr> npx tsx scripts/mint.ts <amount> [recipient]
//
// Mints <amount> base units to <recipient> (defaults to the USER_KEY address).
// Requires mock-token to be deployed on the target network.

import {
  makeContractCall,
  broadcastTransaction,
  getAddressFromPrivateKey,
  principalCV,
  uintCV,
} from "@stacks/transactions";
import {
  coreAddress,
  explorerTxUrl,
  networkName,
  requireKey,
  stacksNetwork,
} from "./_config";

async function main() {
  const amount = BigInt(process.argv[2] ?? "");
  if (!(amount > 0n)) throw new Error("usage: mint.ts <amount> [recipient]");

  const senderKey = requireKey("USER_KEY");
  const to = process.argv[3] ?? getAddressFromPrivateKey(senderKey, networkName());

  console.log(`Minting ${amount} mock-token to ${to}`);

  const tx = await makeContractCall({
    contractAddress: coreAddress(),
    contractName: "mock-token",
    functionName: "mint",
    functionArgs: [uintCV(amount), principalCV(to)],
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
