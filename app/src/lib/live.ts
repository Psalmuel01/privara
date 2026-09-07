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
  exportPrivacySeed,
  fetchAnnouncementPage,
  fetchSip010Balance,
  fetchStealthKeys,
  generateIdentity,
  identityFromSeed,
  importPrivacySeed,
  preparePrivateIntent,
  privateIntentEnvelope,
  scanAnnouncements,
  stealthIntentDomainCV,
  stealthIntentMessageCV,
  sweepStealthBalance,
  type EncryptedPrivacySeedBackup,
  type PrivacyIdentity,
  type SettlementFeeMode,
} from "@privara/sdk";

export const NETWORK = "testnet" as const;
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

function backupKey(address: string): string {
  return `privara:privacy-backup:${NETWORK}:${address}`;
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
  return localStorage.getItem(backupKey(address)) !== null;
}

export async function createPrivacyIdentity(
  address: string,
  password: string
): Promise<{ identity: PrivacyIdentity; backup: EncryptedPrivacySeedBackup }> {
  if (hasPrivacyBackup(address)) {
    throw new Error("An encrypted privacy backup already exists for this wallet on this device");
  }
  const identity = generateIdentity();
  const backup = await exportPrivacySeed(identity.privacySeed, password);
  localStorage.setItem(backupKey(address), JSON.stringify(backup));
  return { identity, backup };
}

export async function unlockPrivacyIdentity(
  address: string,
  password: string
): Promise<PrivacyIdentity> {
  const encoded = localStorage.getItem(backupKey(address));
  if (!encoded) throw new Error("No privacy backup exists on this device. Import or create one first");
  const seed = await importPrivacySeed(JSON.parse(encoded) as EncryptedPrivacySeedBackup, password);
  return identityFromSeed(seed);
}

export async function importPrivacyIdentity(
  address: string,
  encoded: string,
  password: string
): Promise<PrivacyIdentity> {
  const backup = JSON.parse(encoded) as EncryptedPrivacySeedBackup;
  const seed = await importPrivacySeed(backup, password);
  localStorage.setItem(backupKey(address), JSON.stringify(backup));
  return identityFromSeed(seed);
}

export function exportStoredBackup(address: string): void {
  const encoded = localStorage.getItem(backupKey(address));
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
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export async function registerPrivacyIdentity(
  config: PublicRelayerConfig,
  address: string,
  identity: PrivacyIdentity
): Promise<{ txid?: string; alreadyRegistered: boolean }> {
  const current = await fetchStealthKeys({ registry: config.registry, user: address, network: NETWORK });
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
    contract: config.registry as `${string}.${string}`,
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

export async function depositMock(
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
  config: PublicRelayerConfig,
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
    identity.spendingPrivateKey
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

export async function spendPrivatePayment(options: {
  config: PublicRelayerConfig;
  payment: LivePayment;
  destination: string;
  fullBalance: boolean;
  amount?: bigint;
}) {
  const base = {
    endpoint: RELAYER_URL,
    network: NETWORK,
    spendContract: `${options.config.coreAddress}.privara-sponsored-spend-v2`,
    assetContract: options.config.asset,
    tokenName: options.config.tokenName,
    destination: options.destination,
    stealthPrivateKey: options.payment.stealthPrivateKey,
    stacksApiUrl: STACKS_API_URL,
  } as const;
  return options.fullBalance
    ? sweepStealthBalance({ ...base, fullBalance: true })
    : sweepStealthBalance({ ...base, fullBalance: false, amount: options.amount! });
}

export function publicKeyLabel(identity: PrivacyIdentity | null, kind: "spending" | "viewing") {
  if (!identity) return "Locked";
  return bytesToHex(kind === "spending" ? identity.spendingPublicKey : identity.viewingPublicKey);
}
