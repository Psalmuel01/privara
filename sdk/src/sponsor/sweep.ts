import { bytesToHex } from "@stacks/common";
import {
  AuthType,
  Cl,
  ClarityType,
  Pc,
  PayloadType,
  PostConditionMode,
  addressFromVersionHash,
  addressToString,
  getAddressFromPrivateKey,
  isSingleSig,
  makeContractCall,
  serializeTransactionBytes,
  wireToPostCondition,
  type ContractIdString,
  type StacksTransactionWire,
} from "@stacks/transactions";
import {
  ChainId,
  STACKS_MAINNET,
  STACKS_TESTNET,
  TransactionVersion,
} from "@stacks/network";
import type { Network } from "../crypto";

export interface BuildSponsoredSweepOptions {
  assetContract: string;
  tokenName: string;
  destination: string;
  amount: bigint;
  stealthPrivateKey: Uint8Array | string;
  network: Network;
  nonce?: bigint;
}

export interface SponsoredSweepPolicy {
  network: Network;
  assetContract: string;
  tokenName: string;
  maxAmount: bigint;
  maxTransactionBytes: number;
}

export interface ValidatedSponsoredSweep {
  origin: string;
  destination: string;
  amount: bigint;
  assetContract: string;
  tokenName: string;
}

function splitContract(contractId: string): [string, string] {
  const dot = contractId.indexOf(".");
  if (dot <= 0 || dot === contractId.length - 1) {
    throw new Error(`invalid SIP-010 contract principal: ${contractId}`);
  }
  return [contractId.slice(0, dot), contractId.slice(dot + 1)];
}

function privateKeyHex(key: Uint8Array | string): string {
  return typeof key === "string" ? key : bytesToHex(key);
}

export async function buildSponsoredSweep(
  options: BuildSponsoredSweepOptions
): Promise<StacksTransactionWire> {
  if (options.amount <= 0n) throw new Error("sweep amount must be positive");
  if (!options.tokenName) throw new Error("token name is required");
  const [contractAddress, contractName] = splitContract(options.assetContract);
  const senderKey = privateKeyHex(options.stealthPrivateKey);
  const origin = getAddressFromPrivateKey(senderKey, options.network);
  // Passing `nonce: undefined` overrides the Stacks builder's default and causes
  // it to call intToBigInt(undefined) before it gets a chance to fetch the nonce.
  const nonceOption = options.nonce === undefined ? {} : { nonce: options.nonce };

  return makeContractCall({
    contractAddress,
    contractName,
    functionName: "transfer",
    functionArgs: [
      Cl.uint(options.amount),
      Cl.principal(origin),
      Cl.principal(options.destination),
      Cl.none(),
    ],
    senderKey,
    network: options.network,
    sponsored: true,
    fee: 0n,
    ...nonceOption,
    postConditionMode: "deny",
    postConditions: [
      Pc.origin()
        .willSendEq(options.amount)
        .ft(options.assetContract as ContractIdString, options.tokenName),
    ],
  });
}

function principalValue(value: ReturnType<typeof Cl.principal>, label: string): string {
  if (
    value.type !== ClarityType.PrincipalStandard &&
    value.type !== ClarityType.PrincipalContract
  ) {
    throw new Error(`${label} must be a principal`);
  }
  return value.value;
}

export function validateSponsoredSweep(
  transaction: StacksTransactionWire,
  policy: SponsoredSweepPolicy
): ValidatedSponsoredSweep {
  const serializedSize = serializeTransactionBytes(transaction).length;
  if (serializedSize > policy.maxTransactionBytes) {
    throw new Error(`sponsored transaction exceeds ${policy.maxTransactionBytes} bytes`);
  }
  if (transaction.auth.authType !== AuthType.Sponsored) {
    throw new Error("transaction is not marked for sponsorship");
  }
  if (!isSingleSig(transaction.auth.spendingCondition)) {
    throw new Error("sweep origin must use single-signature authorization");
  }
  const expectedNetwork = policy.network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
  const expectedVersion =
    policy.network === "mainnet" ? TransactionVersion.Mainnet : TransactionVersion.Testnet;
  const expectedChainId =
    policy.network === "mainnet" ? ChainId.Mainnet : ChainId.Testnet;
  if (
    transaction.transactionVersion !== expectedVersion ||
    transaction.chainId !== expectedChainId
  ) {
    throw new Error(`sponsored transaction is not for ${policy.network}`);
  }

  if (transaction.payload.payloadType !== PayloadType.ContractCall) {
    throw new Error("sponsored sweep must be a contract call");
  }
  const payload = transaction.payload;
  const calledContract = `${addressToString(payload.contractAddress)}.${payload.contractName.content}`;
  if (calledContract !== policy.assetContract || payload.functionName.content !== "transfer") {
    throw new Error("sponsored sweep calls a disallowed contract or method");
  }
  if (payload.functionArgs.length !== 4) {
    throw new Error("SIP-010 transfer must have exactly four arguments");
  }
  const [amountCV, senderCV, recipientCV, memoCV] = payload.functionArgs;
  if (amountCV.type !== ClarityType.UInt) throw new Error("transfer amount must be a uint");
  const amount = BigInt(amountCV.value);
  if (amount <= 0n || amount > policy.maxAmount) {
    throw new Error(`transfer amount exceeds sponsor policy maximum ${policy.maxAmount}`);
  }
  const sender = principalValue(senderCV as ReturnType<typeof Cl.principal>, "transfer sender");
  const destination = principalValue(
    recipientCV as ReturnType<typeof Cl.principal>,
    "transfer recipient"
  );
  if (memoCV.type !== ClarityType.OptionalNone) {
    throw new Error("sponsored sweep memo must be none");
  }

  const origin = addressToString(
    addressFromVersionHash(
      expectedNetwork.addressVersion.singleSig,
      transaction.auth.spendingCondition.signer
    )
  );
  if (sender !== origin) throw new Error("transfer sender does not match signed origin");
  if (destination === origin) throw new Error("sweep destination must differ from origin");

  if (transaction.postConditionMode !== PostConditionMode.Deny) {
    throw new Error("sponsored sweep must use deny post-condition mode");
  }
  if (transaction.postConditions.values.length !== 1) {
    throw new Error("sponsored sweep must contain exactly one post-condition");
  }
  const postCondition = wireToPostCondition(transaction.postConditions.values[0]);
  if (
    postCondition.type !== "ft-postcondition" ||
    postCondition.address !== "origin" ||
    postCondition.condition !== "eq" ||
    BigInt(postCondition.amount) !== amount ||
    postCondition.asset !== `${policy.assetContract}::${policy.tokenName}`
  ) {
    throw new Error("sponsored sweep has an invalid fungible-token post-condition");
  }

  // Verify only after cheap structural/policy rejection. The sponsor never needs the
  // origin/private stealth key; a mutation of any accepted field invalidates this check.
  transaction.verifyOrigin();

  return {
    origin,
    destination,
    amount,
    assetContract: policy.assetContract,
    tokenName: policy.tokenName,
  };
}
