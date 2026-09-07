import {
  Cl,
  ClarityType,
  fetchCallReadOnlyFunction,
  getAddressFromPrivateKey,
  serializeTransaction,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import type { Network } from "../crypto";
import {
  buildSponsoredSpend,
  fullWithdrawalPaymentAmount,
} from "./sweep";

export interface SponsorPolicyQuote {
  version: number;
  network: Network;
  spendContract: string;
  asset: string;
  tokenName: string;
  feeRecipient: string;
  sponsorAddress: string;
  sponsorFee: string;
  maxPaymentAmount: string;
  maxStacksNetworkFee: string;
}

export interface SponsoredSpendResult {
  txid: string;
  status: "broadcast";
  explorerUrl: string;
  origin: string;
  destination: string;
  paymentAmount: string;
  tokenSponsorFee: string;
  networkFeePaid: string;
}

interface SponsoredClientBase {
  endpoint: string;
  network: Network;
  spendContract: string;
  assetContract: string;
  tokenName: string;
  destination: string;
  stealthPrivateKey: Uint8Array | string;
  nonce?: bigint;
  stacksApiUrl?: string;
  fetchFn?: typeof fetch;
}

export interface SendFromStealthOptions extends SponsoredClientBase {
  amount: bigint;
}

export type WithdrawStealthBalanceOptions = SponsoredClientBase;

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

function stacksNetwork(network: Network, apiUrl?: string) {
  const base = network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
  return apiUrl ? ({ ...base, client: { baseUrl: apiUrl } } as typeof base) : base;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `relayer returned HTTP ${response.status}`);
  return body;
}

export async function fetchSponsorPolicy(
  relayerEndpoint: string,
  fetchFn: typeof fetch = fetch
): Promise<SponsorPolicyQuote> {
  return responseJson<SponsorPolicyQuote>(
    await fetchFn(endpoint(relayerEndpoint, "/v1/stealth/sponsor-policy"))
  );
}

export async function fetchSip010Balance(options: {
  assetContract: string;
  principal: string;
  network: Network;
  stacksApiUrl?: string;
}): Promise<bigint> {
  const dot = options.assetContract.indexOf(".");
  if (dot <= 0 || dot === options.assetContract.length - 1) {
    throw new Error("invalid SIP-010 contract principal");
  }
  const result = await fetchCallReadOnlyFunction({
    contractAddress: options.assetContract.slice(0, dot),
    contractName: options.assetContract.slice(dot + 1),
    functionName: "get-balance",
    functionArgs: [Cl.principal(options.principal)],
    senderAddress: options.principal,
    network: stacksNetwork(options.network, options.stacksApiUrl),
  });
  if (result.type !== ClarityType.ResponseOk || result.value.type !== ClarityType.UInt) {
    throw new Error("unable to read stealth SIP-010 balance");
  }
  return BigInt(result.value.value);
}

async function submit(options: SponsoredClientBase, requestedAmount?: bigint) {
  const fetchFn = options.fetchFn ?? fetch;
  const policy = await fetchSponsorPolicy(options.endpoint, fetchFn);
  // Pin the quote to the contract and asset selected by the application. A malicious
  // or misconfigured endpoint must not silently redirect the user to another contract.
  if (policy.version !== 1) throw new Error(`unsupported sponsor policy version ${policy.version}`);
  if (policy.network !== options.network) throw new Error("sponsor policy network mismatch");
  if (policy.spendContract !== options.spendContract) throw new Error("sponsor contract mismatch");
  if (policy.asset !== options.assetContract || policy.tokenName !== options.tokenName) {
    throw new Error("sponsor asset policy mismatch");
  }
  const sponsorFee = BigInt(policy.sponsorFee);
  const origin = getAddressFromPrivateKey(options.stealthPrivateKey, options.network);
  const balance = await fetchSip010Balance({
    assetContract: options.assetContract,
    principal: origin,
    network: options.network,
    stacksApiUrl: options.stacksApiUrl,
  });
  const paymentAmount =
    requestedAmount === undefined
      ? fullWithdrawalPaymentAmount(balance, sponsorFee)
      : requestedAmount;
  if (paymentAmount <= 0n || paymentAmount > BigInt(policy.maxPaymentAmount)) {
    throw new Error("payment amount is outside sponsor policy");
  }
  if (paymentAmount + sponsorFee > balance) {
    throw new Error("insufficient stealth balance for payment and sponsor fee");
  }
  // All policy-controlled values become signed contract arguments. The relayer receives
  // only this public serialized transaction, never the stealth private key.
  const transaction = await buildSponsoredSpend({
    spendContract: options.spendContract,
    assetContract: options.assetContract,
    tokenName: options.tokenName,
    destination: options.destination,
    paymentAmount,
    feeRecipient: policy.feeRecipient,
    sponsorFee,
    expectedSponsor: policy.sponsorAddress,
    stealthPrivateKey: options.stealthPrivateKey,
    network: options.network,
    nonce: options.nonce,
  });
  return responseJson<SponsoredSpendResult>(
    await fetchFn(endpoint(options.endpoint, "/v1/stealth/sponsor"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ originSignedTransaction: serializeTransaction(transaction) }),
    })
  );
}

export async function sendFromStealth(
  options: SendFromStealthOptions
): Promise<SponsoredSpendResult> {
  return submit(options, options.amount);
}

export async function withdrawStealthBalance(
  options: WithdrawStealthBalanceOptions
): Promise<SponsoredSpendResult> {
  return submit(options);
}
