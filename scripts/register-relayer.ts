// Relayer self-registers in privara-registry (discovery only -- the router does
// NOT consult the registry to settle; this advertises the relayer's endpoint and
// pubkey for wallets/SDK to discover). register() is tx-sender-scoped, so the
// broadcasting key IS the relayer being registered.
//
//   RELAYER_KEY=<hex> PRIVARA_CORE_ADDRESS=<addr> \
//     npx tsx scripts/register-relayer.ts <feeRateBps> <endpoint>
//
//   feeRateBps  advertised fee rate in basis points (10000 = 100%), <= 10000
//   endpoint    relayer API URL (string-utf8, 1..128 chars)

import {
  makeContractCall,
  broadcastTransaction,
  getAddressFromPrivateKey,
  privateKeyToPublic,
  compressPublicKey,
  bufferCV,
  uintCV,
  stringUtf8CV,
} from "@stacks/transactions";
import { hexToBytes } from "@stacks/common";
import {
  REGISTRY_NAME,
  coreAddress,
  explorerTxUrl,
  networkName,
  requireKey,
  stacksNetwork,
} from "./_config";

async function main() {
  const feeStr = process.argv[2];
  const endpoint = process.argv[3];
  if (feeStr === undefined || !endpoint) {
    throw new Error("usage: register-relayer.ts <feeRateBps> <endpoint>");
  }
  const feeRate = BigInt(feeStr);
  if (feeRate > 10000n) throw new Error("feeRateBps must be <= 10000");

  const senderKey = requireKey("RELAYER_KEY");
  const relayer = getAddressFromPrivateKey(senderKey, networkName());
  // Compressed (33-byte) secp256k1 pubkey the registry stores for key agreement.
  const pubkey = compressPublicKey(privateKeyToPublic(senderKey));

  console.log(`Registering relayer ${relayer}`);
  console.log(`  fee-rate : ${feeRate} bps`);
  console.log(`  endpoint : ${endpoint}`);
  console.log(`  pubkey   : ${pubkey}`);

  const tx = await makeContractCall({
    contractAddress: coreAddress(),
    contractName: REGISTRY_NAME,
    functionName: "register",
    functionArgs: [
      bufferCV(hexToBytes(pubkey)),
      uintCV(feeRate),
      stringUtf8CV(endpoint),
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
