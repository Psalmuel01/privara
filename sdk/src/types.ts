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
  user: string;            // signer principal; the contract asserts it equals the recovered signer
  intentHash: Uint8Array;  // sha256 of the consensus-serialized intent tuple, 32 bytes (contract hash-intent)
  digest: Uint8Array;      // full SIP-018 digest actually signed, 32 bytes
  userSig: Uint8Array;     // recoverable secp256k1 signature (RSV, recovery byte last), 65 bytes
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
