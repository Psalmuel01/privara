// Derive the three demo accounts (deployer, user, relayer) from one testnet mnemonic.
//
//   # generate a fresh mnemonic and derive all three accounts
//   npx tsx scripts/gen-wallets.ts
//
//   # or derive from an existing mnemonic (e.g. the one already in Testnet.toml)
//   SECRET_MNEMONIC="word word ... word" npx tsx scripts/gen-wallets.ts
//
// Prints each account's role, Stacks testnet address, and hex private key.
//
// SECURITY: this prints PRIVATE KEYS to stdout. Only ever use a FRESH,
// TESTNET-ONLY mnemonic here. Never run this against a mnemonic that controls
// any mainnet funds. Do not commit or paste the output anywhere public.

import {
  generateSecretKey,
  generateWallet,
  generateNewAccount,
  Wallet,
} from "@stacks/wallet-sdk";
import { getAddressFromPrivateKey } from "@stacks/transactions";

const ROLES = ["deployer", "user", "relayer"] as const;

async function main() {
  const provided = process.env.SECRET_MNEMONIC?.trim();
  const mnemonic = provided ?? generateSecretKey(); // 24 words

  let wallet: Wallet = await generateWallet({ secretKey: mnemonic, password: "" });
  // generateWallet seeds account 0; add two more so we have 0,1,2.
  while (wallet.accounts.length < ROLES.length) {
    wallet = generateNewAccount(wallet);
  }

  console.log("=".repeat(72));
  console.log(provided ? "Derived from SECRET_MNEMONIC:" : "Generated a NEW testnet mnemonic:");
  console.log(mnemonic);
  console.log("=".repeat(72));
  console.log("Keep the mnemonic secret. Put it in settings/Testnet.toml (deployer).\n");

  ROLES.forEach((role, i) => {
    const key = wallet.accounts[i].stxPrivateKey;
    const address = getAddressFromPrivateKey(key, "testnet");
    console.log(`[account ${i}] ${role}`);
    console.log(`  address     : ${address}`);
    console.log(`  private key : ${key}`);
    console.log();
  });

  console.log("Next:");
  console.log("  1. settings/Testnet.toml  -> paste the mnemonic under [accounts.deployer]");
  console.log("  2. Fund all THREE addresses with testnet STX:");
  console.log("     https://explorer.hiro.so/sandbox/faucet?chain=testnet");
  console.log("  3. Export the user + relayer keys for the demo scripts, e.g.:");
  console.log(`     export USER_KEY=${wallet.accounts[1].stxPrivateKey}`);
  console.log(`     export RELAYER_KEY=${wallet.accounts[2].stxPrivateKey}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
