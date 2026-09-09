export type PrivaraNetwork = "testnet" | "mainnet";

export function parsePrivaraNetwork(value: string | undefined): PrivaraNetwork {
  const network = value?.trim() || "testnet";
  if (network !== "testnet" && network !== "mainnet") {
    throw new Error(`VITE_PRIVARA_NETWORK must be "testnet" or "mainnet", got "${network}"`);
  }
  return network;
}

export function stacksAddressPrefix(network: PrivaraNetwork): "ST" | "SP" {
  return network === "mainnet" ? "SP" : "ST";
}

export function defaultStacksApiUrl(network: PrivaraNetwork): string {
  return network === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";
}

export function explorerTransactionUrl(network: PrivaraNetwork, txid: string): string {
  return `https://explorer.hiro.so/txid/0x${txid.replace(/^0x/, "")}?chain=${network}`;
}
