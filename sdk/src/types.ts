export interface Intent {
  asset: string;       // SIP-010 contract principal, e.g. "SP2...token-name"
  amount: bigint;      // total amount including relayer fee
  recipient: string;   // destination principal
  relayer: string;     // relayer principal that will execute settlement
  relayerFee: bigint;  // fee paid to relayer from amount
  nonce: bigint;       // unordered uniqueness salt
  expiry: number;      // block height after which the intent is invalid
}

export interface SignedIntent extends Intent {
  user: string;            // signer principal; the contract asserts it equals the recovered signer
  intentHash: Uint8Array;  // sha256 of the consensus-serialized intent tuple, 32 bytes (contract hash-intent)
  digest: Uint8Array;      // full SIP-018 digest actually signed, 32 bytes
  userSig: Uint8Array;     // recoverable secp256k1 signature (RSV, recovery byte last), 65 bytes
}

// Version-2 stealth intent. The recipient is the one-time stealth principal, never
// the recipient's ordinary wallet. The announcement commitment is signed alongside
// every payment field and verified atomically by privara-router-m2.
export interface StealthIntent extends Intent {
  announcementHash: Uint8Array;
}

export interface SignedStealthIntent extends StealthIntent {
  user: string;
  intentHash: Uint8Array;
  digest: Uint8Array;
  userSig: Uint8Array;
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
