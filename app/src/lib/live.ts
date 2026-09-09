import { bytesToHex } from "@stacks/common";
import { connect, disconnect, getLocalStorage, request } from "@stacks/connect";
import {
  Cl,
  ClarityType,
  Pc,
  fetchCallReadOnlyFunction,
  type ContractIdString,
} from "@stacks/transactions";
import {
  attachStealthIntentSignature,
  buildStealthKeyArgs,
  fetchAnnouncementPage,
  fetchSip010Balance,
  fetchStealthKeys,
  preparePrivateIntent,
  privateIntentEnvelope,
  scanAnnouncements,
  stealthIntentDomainCV,
  stealthIntentMessageCV,
  prepareSponsoredSpend,
  submitPreparedSponsoredSpend,
  type PreparedSponsoredSpend,
  type PrivacyIdentity,
  type SettlementFeeMode,
} from "@privara/sdk";
import {
  assertPrivacyBackupVerified,
  createPendingPrivacyBackup,
  markPrivacyBackupExported,
  readPrivacyBackupStatus,
  readStoredPrivacyBackup,
  restoreAndVerifyPrivacyBackup,
  unlockVerifiedPrivacyBackup,
  type PrivacyBackupStatus,
} from "./privacy-backup";

export const NETWORK = "testnet" as const;
/** Registration is an on-chain wallet action and remains available if the relayer is down. */
export const TESTNET_STEALTH_REGISTRY =
  "STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-stealth-registry";
export const TESTNET_MOCK_ROUTER =
  "STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-router-m2";
export const TESTNET_MOCK_ASSET =
  "STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.mock-token";
export const STACKS_API_URL =
  import.meta.env.VITE_STACKS_API_URL?.replace(/\/$/, "") || "https://api.testnet.hiro.so";
export const RELAYER_URL =
  import.meta.env.VITE_PRIVARA_RELAYER_URL?.replace(/\/$/, "") || "http://127.0.0.1:8787";

export interface PublicRelayerConfig {
  version: 1;
  network: typeof NETWORK;
  coreAddress: string;
  registry: string;
  router: string;
  asset: string;
  tokenName: string;
  relayerAddress: string;
  settlementFeeBps: number;
  /** Fixed token fee charged when spending from a one-time address. */
  sponsorFee?: string;
}

export interface LivePayment {
  stealthPrincipal: string;
  stealthPrivateKey: Uint8Array;
  balance: bigint;
  transactionId: string;
  receivedAmount: bigint;
  plaintext: string;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || `Request failed with HTTP ${response.status}`);
  return body;
}

export async function fetchPublicConfig(): Promise<PublicRelayerConfig> {
  const config = await responseJson<PublicRelayerConfig>(await fetch(`${RELAYER_URL}/v1/config`));
  if (config.version !== 1 || config.network !== NETWORK) {
    throw new Error("The configured relayer is not a supported Privara testnet service");
  }
  return config;
}

export async function waitForTransaction(
  txid: string,
  timeoutMs = 5 * 60_000
): Promise<void> {
  const expected = txid.replace(/^0x/, "");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${STACKS_API_URL}/extended/v1/tx/0x${expected}`);
    if (response.ok) {
      const tx = (await response.json()) as { tx_status?: string; tx_result?: { repr?: string } };
      if (tx.tx_status === "success") return;
      if (tx.tx_status?.startsWith("abort_")) {
        throw new Error(`Transaction failed: ${tx.tx_result?.repr || tx.tx_status}`);
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 4_000));
  }
  throw new Error("Transaction is still pending. Check the explorer before retrying");
}

export async function resolveRecipient(config: PublicRelayerConfig, recipient: string) {
  return fetchStealthKeys({ registry: config.registry, user: recipient, network: NETWORK });
}

export function storedWalletAddress(): string | null {
  return getLocalStorage()?.addresses.stx.find((entry) => entry.address.startsWith("ST"))?.address ?? null;
}

export async function connectWallet(): Promise<string> {
  const result = await connect({ network: NETWORK });
  const address = result.addresses.find((entry) => entry.address.startsWith("ST"))?.address;
  if (!address) throw new Error("The selected wallet did not return a Stacks testnet address");
  return address;
}

export function disconnectWallet(): void {
  disconnect();
}

function transactionId(result: { txid?: string }): string {
  if (!result.txid) throw new Error("The wallet did not return a broadcast transaction ID");
  return result.txid;
}

export function hasPrivacyBackup(address: string): boolean {
  return readStoredPrivacyBackup(localStorage, NETWORK, address) !== null;
}

export function privacyBackupStatus(address: string): PrivacyBackupStatus {
  return readPrivacyBackupStatus(localStorage, NETWORK, address);
}

export async function createPrivacyIdentity(
  address: string,
  password: string
): ReturnType<typeof createPendingPrivacyBackup> {
  return createPendingPrivacyBackup(localStorage, NETWORK, address, password);
}

export async function unlockPrivacyIdentity(
  address: string,
  password: string,
  registry = TESTNET_STEALTH_REGISTRY
): Promise<PrivacyIdentity> {
  const identity = await unlockVerifiedPrivacyBackup(localStorage, NETWORK, address, password);
  try {
    await assertIdentityMatchesRegistration(registry, address, identity);
    return identity;
  } catch (error) {
    identity.privacySeed.fill(0);
    identity.spendingPrivateKey.fill(0);
    identity.viewingPrivateKey.fill(0);
    throw error;
  }
}

export async function importPrivacyIdentity(
  address: string,
  encoded: string,
  password: string,
  replaceExisting = false,
  registry = TESTNET_STEALTH_REGISTRY
): Promise<PrivacyIdentity> {
  return restoreAndVerifyPrivacyBackup(
    localStorage,
    NETWORK,
    address,
    encoded,
    password,
    replaceExisting,
    (candidate) => assertIdentityMatchesRegistration(registry, address, candidate)
  );
}

export function exportStoredBackup(address: string): void {
  const encoded = readStoredPrivacyBackup(localStorage, NETWORK, address);
  if (!encoded) throw new Error("No encrypted privacy backup exists on this device");
  const blob = new Blob([`${JSON.stringify(JSON.parse(encoded), null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `privara-privacy-${NETWORK}-${address}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  markPrivacyBackupExported(localStorage, NETWORK, address);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

async function assertIdentityMatchesRegistration(
  registry: string,
  address: string,
  identity: PrivacyIdentity
): Promise<void> {
  const current = await fetchStealthKeys({ registry, user: address, network: NETWORK });
  if (
    current &&
    (!sameBytes(current.spendingPublicKey, identity.spendingPublicKey) ||
      !sameBytes(current.viewingPublicKey, identity.viewingPublicKey))
  ) {
    throw new Error(
      "This backup does not match this wallet's existing on-chain P/V registration. Nothing was overwritten"
    );
  }
}

export async function registerPrivacyIdentity(
  registry: string,
  address: string,
  identity: PrivacyIdentity
): Promise<{ txid?: string; alreadyRegistered: boolean }> {
  // This local invariant prevents accidental registration before recoverability was proved.
  assertPrivacyBackupVerified(localStorage, NETWORK, address, identity);
  const current = await fetchStealthKeys({ registry, user: address, network: NETWORK });
  if (
    current &&
    sameBytes(current.spendingPublicKey, identity.spendingPublicKey) &&
    sameBytes(current.viewingPublicKey, identity.viewingPublicKey)
  ) {
    return { alreadyRegistered: true };
  }
  if (current) {
    throw new Error(
      "This wallet is registered to a different privacy backup. Import that backup; automatic key rotation is disabled to protect existing funds"
    );
  }
  const [spendingKey, viewingKey] = buildStealthKeyArgs(
    identity.spendingPublicKey,
    identity.viewingPublicKey
  );
  const result = await request("stx_callContract", {
    address,
    network: NETWORK,
    contract: registry as `${string}.${string}`,
    functionName: "register-stealth-keys",
    functionArgs: [spendingKey, viewingKey],
    postConditionMode: "allow",
  });
  return { txid: transactionId(result), alreadyRegistered: false };
}

export async function readRouterDeposit(
  config: PublicRelayerConfig,
  address: string
): Promise<bigint> {
  const [contractAddress, contractName] = config.router.split(".");
  const value = await fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: "get-deposit",
    functionArgs: [Cl.principal(address), Cl.principal(config.asset)],
    senderAddress: address,
    network: NETWORK,
  });
  if (value.type !== ClarityType.UInt) throw new Error("Unable to read the router deposit");
  return BigInt(value.value);
}

/** Testnet-only faucet call. MOCK's unrestricted mint function is never used on mainnet. */
export async function mintMock(
  config: PublicRelayerConfig,
  address: string,
  amount: bigint
): Promise<string> {
  const result = await request("stx_callContract", {
    address,
    network: NETWORK,
    contract: config.asset as `${string}.${string}`,
    functionName: "mint",
    functionArgs: [Cl.uint(amount), Cl.principal(address)],
    postConditionMode: "allow",
  });
  return transactionId(result);
}

/** Fund exactly the configured router/asset pair before the signed settlement. */
export async function depositAsset(
  config: PublicRelayerConfig,
  address: string,
  amount: bigint
): Promise<string> {
  const result = await request("stx_callContract", {
    address,
    network: NETWORK,
    contract: config.router as `${string}.${string}`,
    functionName: "deposit",
    functionArgs: [Cl.principal(config.asset), Cl.uint(amount)],
    postConditionMode: "deny",
    postConditions: [
      Pc.origin()
        .willSendEq(amount)
        .ft(config.asset as ContractIdString, config.tokenName),
    ],
  });
  return transactionId(result);
}

export async function submitPrivatePayment(options: {
  config: PublicRelayerConfig;
  walletAddress: string;
  recipient: string;
  enteredAmount: bigint;
  feeMode: SettlementFeeMode;
}): Promise<{ txid: string; recipientAmount: bigint; stealthPrincipal: string }> {
  const tipResponse = await fetch(`${STACKS_API_URL}/v2/info`);
  const tip = await responseJson<{ stacks_tip_height: number }>(tipResponse);
  const prepared = await preparePrivateIntent({
    registry: options.config.registry,
    recipient: options.recipient,
    network: NETWORK,
    router: options.config.router,
    asset: options.config.asset,
    relayer: options.config.relayerAddress,
    enteredAmount: options.enteredAmount,
    settlementFeeBps: BigInt(options.config.settlementFeeBps),
    feeMode: options.feeMode,
    expiry: tip.stacks_tip_height + 200,
  });
  const signed = await request("stx_signStructuredMessage", {
    domain: stealthIntentDomainCV(NETWORK, options.config.router),
    message: stealthIntentMessageCV(prepared.intent),
  });
  const intent = attachStealthIntentSignature(
    prepared.intent,
    signed.signature,
    NETWORK,
    options.config.router
  );
  if (intent.user !== options.walletAddress) {
    throw new Error(`The signing wallet changed accounts (${intent.user})`);
  }
  const result = await responseJson<{ txid: string }>(
    await fetch(`${RELAYER_URL}/v1/intents/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        privateIntentEnvelope({ ...prepared, intent }, NETWORK)
      ),
    })
  );
  return {
    txid: result.txid,
    recipientAmount: prepared.quote.recipientAmount,
    stealthPrincipal: prepared.announcement.stealthPrincipal,
  };
}

export async function scanPrivatePayments(
  config: Pick<PublicRelayerConfig, "router" | "asset">,
  identity: PrivacyIdentity
): Promise<{ checked: number; payments: LivePayment[] }> {
  const announcements: Awaited<ReturnType<typeof fetchAnnouncementPage>>["announcements"] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await fetchAnnouncementPage({
      apiUrl: STACKS_API_URL,
      router: config.router,
      cursor,
      limit: 100,
      onInvalid: (metadata) => console.warn("Skipped invalid public announcement", metadata),
    });
    announcements.push(...page.announcements);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    if (pageNumber === 99) throw new Error("Announcement history exceeded the scanner safety limit");
  }
  const scanInput = announcements.map((announcement) => ({
    stealthPrincipal: announcement.stealthPrincipal,
    ephemeralPublicKey: announcement.ephemeralPublicKey,
    note: {
      version: announcement.version,
      nonce: announcement.nonce,
      ciphertext: announcement.ciphertext,
    },
    context: {
      network: NETWORK,
      router: config.router,
      stealthPrincipal: announcement.stealthPrincipal,
      asset: announcement.asset,
      registryEpoch: announcement.registryEpoch,
      protocolVersion: announcement.version,
    },
  }));
  const detected = await scanAnnouncements(
    scanInput,
    identity.viewingPrivateKey,
    identity.spendingPublicKey,
    NETWORK,
    identity.spendingPrivateKey,
    (metadata) => console.warn("Skipped invalid scan candidate", metadata)
  );
  const payments = await Promise.all(
    detected.map(async (payment): Promise<LivePayment> => {
      if (!payment.stealthPrivateKey) throw new Error("Scanner did not derive a spending key");
      const indexed = announcements.find(
        (candidate) => candidate.stealthPrincipal === payment.stealthPrincipal
      );
      if (!indexed) throw new Error("Detected payment is missing its index record");
      return {
        stealthPrincipal: payment.stealthPrincipal,
        stealthPrivateKey: payment.stealthPrivateKey,
        balance: await fetchSip010Balance({
          assetContract: config.asset,
          principal: payment.stealthPrincipal,
          network: NETWORK,
          stacksApiUrl: STACKS_API_URL,
        }),
        transactionId: indexed.transactionId,
        receivedAmount: indexed.amount - indexed.relayerFee,
        plaintext: new TextDecoder().decode(payment.plaintext),
      };
    })
  );
  return { checked: announcements.length, payments };
}

export interface PrivateSpendRequest {
  config: PublicRelayerConfig;
  payment: LivePayment;
  destination: string;
  fullBalance: boolean;
  amount?: bigint;
}

function privateSpendBase(options: PrivateSpendRequest) {
  return {
    endpoint: RELAYER_URL,
    network: NETWORK,
    spendContract: `${options.config.coreAddress}.privara-sponsored-spend-v2`,
    assetContract: options.config.asset,
    tokenName: options.config.tokenName,
    destination: options.destination,
    stealthPrivateKey: options.payment.stealthPrivateKey,
    stacksApiUrl: STACKS_API_URL,
  } as const;
}

/** Fetch the exact sponsor terms once, before the confirmation screen is shown. */
export async function preparePrivateSpend(
  options: PrivateSpendRequest
): Promise<PreparedSponsoredSpend> {
  const base = privateSpendBase(options);
  return options.fullBalance
    ? prepareSponsoredSpend({ ...base, fullBalance: true })
    : prepareSponsoredSpend({ ...base, fullBalance: false, amount: options.amount! });
}

/** Sign the already-approved terms; this path deliberately performs no quote refresh. */
export async function spendPrivatePayment(
  options: PrivateSpendRequest,
  approved: PreparedSponsoredSpend
) {
  return submitPreparedSponsoredSpend(privateSpendBase(options), approved);
}

export function publicKeyLabel(identity: PrivacyIdentity | null, kind: "spending" | "viewing") {
  if (!identity) return "Locked";
  return bytesToHex(kind === "spending" ? identity.spendingPublicKey : identity.viewingPublicKey);
}
