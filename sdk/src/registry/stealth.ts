import type { StacksNetwork, StacksNetworkName } from "@stacks/network";
import { hexToBytes } from "@stacks/common";
import {
  Cl,
  ClarityType,
  fetchCallReadOnlyFunction,
  type ClarityValue,
} from "@stacks/transactions";
import { Point } from "@noble/secp256k1";

export interface StealthRegistryRecord {
  spendingPublicKey: Uint8Array;
  viewingPublicKey: Uint8Array;
  epoch: bigint;
}

export interface FetchStealthKeysOptions {
  registry: string;
  user: string;
  network: StacksNetworkName | StacksNetwork;
}

function validateKey(key: Uint8Array, label: string): void {
  if (key.length !== 33 || (key[0] !== 0x02 && key[0] !== 0x03)) {
    throw new Error(`${label} must be a compressed 33-byte secp256k1 key`);
  }
  try {
    Point.fromHex(key);
  } catch {
    throw new Error(`${label} is not a valid secp256k1 point`);
  }
}

export function buildStealthKeyArgs(
  spendingPublicKey: Uint8Array,
  viewingPublicKey: Uint8Array
): ClarityValue[] {
  validateKey(spendingPublicKey, "spending public key");
  validateKey(viewingPublicKey, "viewing public key");
  if (spendingPublicKey.every((byte, index) => byte === viewingPublicKey[index])) {
    throw new Error("spending and viewing public keys must differ");
  }
  return [Cl.buffer(spendingPublicKey), Cl.buffer(viewingPublicKey)];
}

export function parseStealthKeysCV(value: ClarityValue): StealthRegistryRecord | null {
  if (value.type === ClarityType.OptionalNone) return null;
  if (value.type !== ClarityType.OptionalSome || value.value.type !== ClarityType.Tuple) {
    throw new Error("unexpected get-stealth-keys response");
  }
  const tuple = value.value.value;
  const spending = tuple["spending-key"];
  const viewing = tuple["viewing-key"];
  const epoch = tuple.epoch;
  if (
    spending?.type !== ClarityType.Buffer ||
    viewing?.type !== ClarityType.Buffer ||
    epoch?.type !== ClarityType.UInt
  ) {
    throw new Error("malformed stealth registry record");
  }
  const record = {
    spendingPublicKey: hexToBytes(spending.value),
    viewingPublicKey: hexToBytes(viewing.value),
    epoch: BigInt(epoch.value),
  };
  validateKey(record.spendingPublicKey, "registered spending public key");
  validateKey(record.viewingPublicKey, "registered viewing public key");
  return record;
}

function splitContractId(contractId: string): [string, string] {
  const separator = contractId.indexOf(".");
  if (separator <= 0 || separator === contractId.length - 1) {
    throw new Error(`invalid stealth registry contract principal: ${contractId}`);
  }
  return [contractId.slice(0, separator), contractId.slice(separator + 1)];
}

export async function fetchStealthKeys(
  options: FetchStealthKeysOptions
): Promise<StealthRegistryRecord | null> {
  const [contractAddress, contractName] = splitContractId(options.registry);
  const response = await fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: "get-stealth-keys",
    functionArgs: [Cl.principal(options.user)],
    senderAddress: options.user,
    network: options.network,
  });
  return parseStealthKeysCV(response);
}
