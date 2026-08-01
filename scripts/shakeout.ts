// Run a batch of varied intents end-to-end against testnet to shake out fee
// estimation, nonce handling, and RPC quirks before calling the flow stable.
//
//   USER_KEY=<hex> RELAYER_KEY=<hex> PRIVARA_CORE_ADDRESS=<addr> \
//     npx tsx scripts/shakeout.ts [count]
//
// For each iteration it: mints + deposits enough mock-token, signs an intent with
// a varied (amount, fee, expiry-window), settles it, and waits for the mined
// result. Intents MUST run sequentially -- each settlement advances the user's
// on-chain nonce, and create-intent reads that nonce live, so overlapping runs
// would collide. Every broadcast tx id and outcome is printed and tallied.
//
// This is a testnet dry-run harness (mock-token, mintable). Not part of the
// real-sBTC demo; it exists to log ~10-15 varied executions for the milestone.

import { spawnSync } from "node:child_process";
import {
  fetchCallReadOnlyFunction,
  getAddressFromPrivateKey,
  principalCV,
  cvToValue,
} from "@stacks/transactions";
import {
  ROUTER_NAME,
  coreAddress,
  networkName,
  requireKey,
  stacksNetwork,
} from "./_config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wait for a broadcast tx to leave the mempool before sending the next one.
// Every tx from the user shares one account nonce, so mint -> deposit -> settle
// MUST be mined in order; broadcasting the next before the previous confirms
// collides at the same nonce (BadNonce) on a live chain.
async function waitMined(txid: string, label: string): Promise<boolean> {
  const base = stacksNetwork().client.baseUrl;
  const clean = txid.startsWith("0x") ? txid.slice(2) : txid;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/extended/v1/tx/${clean}`);
    if (res.ok) {
      const tx = (await res.json()) as { tx_status: string; tx_result?: { repr?: string } };
      if (tx.tx_status !== "pending") {
        const ok = tx.tx_status === "success";
        console.log(`  ${label}: ${ok ? "✔" : "✘ " + tx.tx_status + " " + (tx.tx_result?.repr ?? "")}`.trimEnd());
        return ok;
      }
    }
    process.stderr.write(".");
    await sleep(5_000);
  }
  console.log(`  ${label}: ? still pending after 5 min`);
  return false;
}

// A spread of amounts and fees to exercise fee edges (incl. fee=0) and sizes.
const VARIANTS: Array<{ amount: number; fee: number; expiryWindow: number }> = [
  { amount: 100_000, fee: 1_000, expiryWindow: 200 },
  { amount: 50_000, fee: 0, expiryWindow: 150 },
  { amount: 250_000, fee: 5_000, expiryWindow: 300 },
  { amount: 10_000, fee: 100, expiryWindow: 120 },
  { amount: 500_000, fee: 2_500, expiryWindow: 250 },
  { amount: 75_000, fee: 750, expiryWindow: 180 },
  { amount: 1_000_000, fee: 10_000, expiryWindow: 400 },
  { amount: 33_333, fee: 333, expiryWindow: 130 },
  { amount: 420_000, fee: 0, expiryWindow: 220 },
  { amount: 88_000, fee: 1_200, expiryWindow: 160 },
  { amount: 12_500, fee: 125, expiryWindow: 110 },
  { amount: 640_000, fee: 6_400, expiryWindow: 350 },
];

interface Result {
  i: number;
  amount: number;
  fee: number;
  settleTxid: string | null;
  ok: boolean;
}

// Run a demo script as a child so it reuses the exact same broadcast/poll paths
// the reviewer would run by hand. Returns stdout for txid extraction.
function run(script: string, args: string[]): { code: number; out: string } {
  const res = spawnSync("npx", ["tsx", `scripts/${script}`, ...args], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
    env: process.env,
  });
  if (res.stdout) process.stdout.write(res.stdout);
  return { code: res.status ?? 1, out: res.stdout ?? "" };
}

function extractTxid(out: string): string | null {
  const m = out.match(/Broadcast:\s*([0-9a-fx]+)/i);
  return m ? m[1] : null;
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
  const count = Math.min(Number(process.argv[2] ?? "12"), VARIANTS.length);
  const userKey = requireKey("USER_KEY");
  requireKey("RELAYER_KEY"); // fail fast if the relayer key is missing
  const user = getAddressFromPrivateKey(userKey, networkName());
  const recipient = process.env.RECIPIENT;
  const relayer = process.env.RELAYER;
  if (!recipient || !relayer) {
    throw new Error("RECIPIENT and RELAYER env vars are required (settlement targets)");
  }

  console.log(`Shakeout: ${count} varied intents as user ${user}`);
  console.log(`  recipient ${recipient} / relayer ${relayer}\n`);

  const results: Result[] = [];

  for (let i = 0; i < count; i++) {
    const v = VARIANTS[i];
    console.log(`\n===== intent ${i + 1}/${count}: amount=${v.amount} fee=${v.fee} =====`);

    // Mint + deposit exactly this intent's amount so the deposit never runs dry.
    // Each must be MINED before the next broadcast -- they share the user's nonce.
    const mint = run("mint.ts", [String(v.amount)]);
    const mintTx = extractTxid(mint.out);
    if (mint.code !== 0 || !mintTx || !(await waitMined(mintTx, "mint"))) {
      results.push({ i, amount: v.amount, fee: v.fee, settleTxid: null, ok: false }); break;
    }
    const dep = run("deposit.ts", [String(v.amount)]);
    const depTx = extractTxid(dep.out);
    if (dep.code !== 0 || !depTx || !(await waitMined(depTx, "deposit"))) {
      results.push({ i, amount: v.amount, fee: v.fee, settleTxid: null, ok: false }); break;
    }

    // Sign with a live expiry window, capture the JSON, settle it, wait for mining.
    const nonceBefore = await getNonce(user);
    const create = run("create-intent.ts", [
      recipient, relayer, String(v.amount), String(v.fee), "", // expiry defaults to tip+window inside the script
    ]);
    if (create.code !== 0) { results.push({ i, amount: v.amount, fee: v.fee, settleTxid: null, ok: false }); break; }
    // create-intent prints the JSON envelope to stdout; hand it to settle via a temp file.
    const envelope = create.out.slice(create.out.indexOf("{"));
    const fs = await import("node:fs");
    const tmp = `shakeout-${i}.json`;
    fs.writeFileSync(tmp, envelope);

    const settle = run("settle.ts", [tmp]);
    const txid = extractTxid(settle.out);
    const ok = settle.code === 0;
    results.push({ i, amount: v.amount, fee: v.fee, settleTxid: txid, ok });

    const nonceAfter = await getNonce(user);
    console.log(`  nonce ${nonceBefore} -> ${nonceAfter} (${ok ? "settled" : "FAILED"})`);
    fs.unlinkSync(tmp);
  }

  console.log(`\n===== shakeout summary =====`);
  let pass = 0;
  for (const r of results) {
    console.log(
      `  #${r.i + 1} amount=${r.amount} fee=${r.fee} ${r.ok ? "OK  " : "FAIL"} ${r.settleTxid ?? "-"}`
    );
    if (r.ok) pass++;
  }
  console.log(`\n${pass}/${results.length} settled successfully.`);
  if (pass !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
