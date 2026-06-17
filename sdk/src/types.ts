export interface Intent {
  asset: string;       // SIP-010 contract principal, e.g. "SP2...token-name"
  amount: bigint;      // total amount including relayer fee
  recipient: string;   // destination principal
  relayer: string;     // relayer principal that will execute settlement
  relayerFee: bigint;  // fee paid to relayer from amount
  nonce: bigint;       // monotonic per-user nonce (fetch via get-nonce)
  expiry: number;      // block height after which the intent is invalid
}

export interface SignedIntent extends Intent {
  intentHash: Uint8Array;  // sha256 output, 32 bytes
  userPubkey: Uint8Array;  // compressed secp256k1 public key, 33 bytes
  userSig: Uint8Array;     // recoverable secp256k1 signature, 65 bytes
}

export interface SettlementRequest {
  intent: SignedIntent;
  network: "mainnet" | "testnet";
}

export interface RelayerInfo {
  address: string;
  pubkey: string;  // hex-encoded compressed pubkey
  feeRate: bigint;
  endpoint: string;
  active: boolean;
}
