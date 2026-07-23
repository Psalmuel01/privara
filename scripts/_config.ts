// Shared config + helpers for the Privara demo scripts.
//
// These run the end-to-end M1 flow (deposit -> sign intent offline -> relayer
// settles -> check status) against simnet-derived devnet keys on testnet.
//
// Configuration comes from the environment so no secret is ever committed:
//   PRIVARA_NETWORK      "testnet" (default) | "mainnet"
//   PRIVARA_CORE_ADDRESS deployer/STX address that published the contracts
//   PRIVARA_ASSET        SIP-010 asset principal (default: <core>.mock-token)
//   USER_KEY             hex private key of the depositing/signing user
//   RELAYER_KEY          hex private key of the relayer that broadcasts settlement
//   STACKS_API_URL       optional RPC override (default: Hiro testnet/mainnet)
//
// Keys are read from the environment only; pass them inline, e.g.
//   USER_KEY=... RELAYER_KEY=... npx tsx scripts/deposit.ts 1000000

import {
  STACKS_MAINNET,
  STACKS_TESTNET,
  type StacksNetworkName,
} from "@stacks/network";
import type { Network } from "../sdk/src";

export function network(): Network {
  const n = process.env.PRIVARA_NETWORK ?? "testnet";
  if (n !== "testnet" && n !== "mainnet") {
    throw new Error(`PRIVARA_NETWORK must be "testnet" or "mainnet", got "${n}"`);
  }
  return n;
}

export function stacksNetwork() {
  const base = network() === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
  const client = process.env.STACKS_API_URL
    ? { baseUrl: process.env.STACKS_API_URL }
    : base.client;
  return { ...base, client } as typeof base;
}

export function networkName(): StacksNetworkName {
  return network();
}

export function coreAddress(): string {
  const addr = process.env.PRIVARA_CORE_ADDRESS;
  if (!addr) {
    throw new Error(
      "PRIVARA_CORE_ADDRESS is required (the address that deployed privara-router)"
    );
  }
  return addr;
}

export const ROUTER_NAME = "privara-router";
export const REGISTRY_NAME = "privara-registry";

export function routerId(): string {
  return `${coreAddress()}.${ROUTER_NAME}`;
}

export function asset(): string {
  return process.env.PRIVARA_ASSET ?? `${coreAddress()}.mock-token`;
}

export function requireKey(name: "USER_KEY" | "RELAYER_KEY"): string {
  const key = process.env[name];
  if (!key) throw new Error(`${name} env var is required (hex private key)`);
  return key.trim();
}

export function explorerTxUrl(txid: string): string {
  const chain = network();
  const id = txid.startsWith("0x") ? txid : `0x${txid}`;
  return `https://explorer.hiro.so/txid/${id}?chain=${chain}`;
}

// Splits "SP...ADDR.contract-name" into [address, name].
export function splitPrincipal(principal: string): [string, string] {
  const dot = principal.indexOf(".");
  if (dot === -1) throw new Error(`not a contract principal: ${principal}`);
  return [principal.slice(0, dot), principal.slice(dot + 1)];
}
