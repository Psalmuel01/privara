import { bytesToHex } from "@stacks/common";
import { connect, disconnect, getLocalStorage, request } from "@stacks/connect";
import {
  Cl,
  ClarityType,
  Pc,
  broadcastTransaction,
  fetchCallReadOnlyFunction,
  fetchFeeEstimateTransfer,
  makeSTXTokenTransfer,
  type ContractIdString,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";
import {
  assertBnsResolutionUnchanged,
  attachStealthIntentSignature,
  buildStealthKeyArgs,
  fetchAnnouncementPage,
  fetchStxAnnouncementPage,
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
  type ResolvedRecipient,
  resolveMainnetRecipient,
} from "@privara-stacks/sdk";
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
import {
  defaultStacksApiUrl,
  parsePrivaraNetwork,
  stacksAddressPrefix,
} from "../config/network";

export const NETWORK = parsePrivaraNetwork(import.meta.env.VITE_PRIVARA_NETWORK);
const ADDRESS_PREFIX = stacksAddressPrefix(NETWORK);
/** Registration is an on-chain wallet action and remains available if the relayer is down. */
export const FALLBACK_STEALTH_REGISTRY = requiredNetworkContract(
  "VITE_PRIVARA_FALLBACK_REGISTRY",
  "STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-stealth-registry"
);
export const FALLBACK_LIVE_ROUTER = requiredNetworkContract(
  "VITE_PRIVARA_FALLBACK_ROUTER",
  "STXB1YYJ4253QA0N20F12ZEQVX02HN7QRW2TJXT0.privara-router-m2-sbtc"
);
export const FALLBACK_LIVE_ASSET = requiredNetworkContract(
  "VITE_PRIVARA_FALLBACK_ASSET",
  "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token"
);
// Same Privara deployer by default, so existing mainnet Vercel configuration keeps
// working. Set the env only if this contract is ever deployed from another account.
export const STX_ROUTER_CONTRACT = import.meta.env.VITE_PRIVARA_STX_ROUTER?.trim()
  || `${FALLBACK_STEALTH_REGISTRY.split(".")[0]}.privara-stx-router-v1`;
/** Optional until the dedicated USDCx router has been deployed and confirmed. */
export const USDCX_ROUTER_CONTRACT = import.meta.env.VITE_PRIVARA_USDCX_ROUTER?.trim() || "";
export const STACKS_API_URL =
  import.meta.env.VITE_STACKS_API_URL?.replace(/\/$/, "") || defaultStacksApiUrl(NETWORK);
export const RELAYER_URL = (() => {
  const configured = import.meta.env.VITE_PRIVARA_RELAYER_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (NETWORK === "testnet") return "http://127.0.0.1:8787";
  throw new Error("VITE_PRIVARA_RELAYER_URL is required for a mainnet build");
})();

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
  /** Maximum total settlement outflow accepted by this relayer. */
  maxIntentAmount?: string;
  /** Fixed token fee charged when spending from a one-time address. */
  sponsorFee?: string;
  /** Treasury that receives the explicitly shown settlement/service fee. */
  feeRecipient: string;
  /** Native-STX custody and stealth-settlement router. */
  stxRouter: string;
  /** Every SIP-010 router/asset pair this relayer explicitly serves. */
  assets?: PublicSip010AssetConfig[];
}

export interface PublicSip010AssetConfig {
  id: string;
  symbol: string;
  decimals: number;
  router: string;
  asset: string;
  tokenName: string;
  sponsorFee: string;
  maxIntentAmount: string;
}

/** Return a compatibility-shaped config pinned to one advertised SIP-010 policy. */
export function configForSip010Asset(
  config: PublicRelayerConfig,
  assetContract: string
): PublicRelayerConfig | null {
  const advertised = config.assets?.find((candidate) => candidate.asset === assetContract);
  if (!advertised) {
    return config.asset === assetContract ? config : null;
  }
  if (advertised.id === "usdcx" && advertised.router !== USDCX_ROUTER_CONTRACT) return null;
  return {
    ...config,
    router: advertised.router,
    asset: advertised.asset,
    tokenName: advertised.tokenName,
    sponsorFee: advertised.sponsorFee,
    maxIntentAmount: advertised.maxIntentAmount,
  };
}

function requiredNetworkContract(name: keyof ImportMetaEnv, testnetDefault: string): string {
  const value = import.meta.env[name]?.trim() || (NETWORK === "testnet" ? testnetDefault : "");
  if (!value) throw new Error(`${name} is required for a mainnet build`);
  const address = value.split(".", 1)[0];
  const valid = NETWORK === "mainnet"
    ? address.startsWith("SP") || address.startsWith("SM")
    : address.startsWith("ST") || address.startsWith("SN");
  if (!valid || !value.includes(".")) {
    throw new Error(`${name} is not a Stacks ${NETWORK} contract principal`);
  }
  return value;
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
    throw new Error(`The configured relayer is not a supported Privara ${NETWORK} service`);
  }
  if (
    config.registry !== FALLBACK_STEALTH_REGISTRY ||
    config.router !== FALLBACK_LIVE_ROUTER ||
    config.asset !== FALLBACK_LIVE_ASSET
  ) {
    throw new Error("The relayer contract configuration does not match this app build");
  }
  if (config.stxRouter !== STX_ROUTER_CONTRACT) {
    throw new Error("The relayer STX router does not match this app build");
  }
  for (const advertised of config.assets ?? []) {
    if (!advertised.router.includes(".") || !advertised.asset.includes(".")) {
      throw new Error("The relayer advertised an invalid SIP-010 asset policy");
    }
    if (!/^\d+$/.test(advertised.sponsorFee) || !/^\d+$/.test(advertised.maxIntentAmount)) {
      throw new Error("The relayer advertised invalid SIP-010 limits");
    }
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

export interface ResolvedPrivateRecipient extends ResolvedRecipient {
  keys: NonNullable<Awaited<ReturnType<typeof fetchStealthKeys>>> | null;
}

export async function resolveRecipient(
  config: PublicRelayerConfig,
  recipient: string
): Promise<ResolvedPrivateRecipient> {
  const resolved = NETWORK === "mainnet"
    ? await resolveMainnetRecipient(recipient)
    : { identifier: recipient.trim(), address: recipient.trim() };
  const keys = await fetchStealthKeys({ registry: config.registry, user: resolved.address, network: NETWORK });
  return { ...resolved, keys };
}

export function storedWalletAddress(): string | null {
  return getLocalStorage()?.addresses.stx.find((entry) => entry.address.startsWith(ADDRESS_PREFIX))?.address ?? null;
}

export async function connectWallet(): Promise<string> {
  const result = await connect({ network: NETWORK });
  const address = result.addresses.find((entry) => entry.address.startsWith(ADDRESS_PREFIX))?.address;
  if (!address) throw new Error(`The selected wallet did not return a Stacks ${NETWORK} address`);
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
  registry = FALLBACK_STEALTH_REGISTRY
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
  registry = FALLBACK_STEALTH_REGISTRY
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

export type PrivacyRegistrationState =
  | "unregistered"
  | "registered"
  | "matched"
  | "mismatch";

/**
 * Read the wallet's public privacy-key registration without exposing private material.
 * Passing an unlocked identity also proves whether the local backup controls that
 * registration.
 */
export async function privacyRegistrationState(
  registry: string,
  address: string,
  identity?: PrivacyIdentity
): Promise<PrivacyRegistrationState> {
  const current = await fetchStealthKeys({ registry, user: address, network: NETWORK });
  if (!current) return "unregistered";
  if (!identity) return "registered";
  return sameBytes(current.spendingPublicKey, identity.spendingPublicKey) &&
    sameBytes(current.viewingPublicKey, identity.viewingPublicKey)
    ? "matched"
    : "mismatch";
}

async function assertIdentityMatchesRegistration(
  registry: string,
  address: string,
  identity: PrivacyIdentity
): Promise<void> {
  if (await privacyRegistrationState(registry, address, identity) === "mismatch") {
    throw new Error(
      "This backup does not match the privacy identity already registered to this wallet. Nothing was overwritten"
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
  address: string,
  nativeStx = false
): Promise<bigint> {
  const [contractAddress, contractName] = (nativeStx ? config.stxRouter : config.router).split(".");
  const value = await fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: "get-deposit",
    functionArgs: nativeStx ? [Cl.principal(address)] : [Cl.principal(address), Cl.principal(config.asset)],
    senderAddress: address,
    network: NETWORK,
  });
  if (value.type !== ClarityType.UInt) throw new Error("Unable to read the router deposit");
  return BigInt(value.value);
}

/** Read the connected wallet's balance for the exact SIP-010 asset served by Privara. */
export async function readWalletAssetBalance(
  config: PublicRelayerConfig,
  address: string
): Promise<bigint> {
  return fetchSip010Balance({
    assetContract: config.asset,
    principal: address,
    network: NETWORK,
    stacksApiUrl: STACKS_API_URL,
  });
}

/** Native STX wallet/one-time-address balance from the standard address endpoint. */
export async function readStxBalance(address: string): Promise<bigint> {
  const response = await fetch(`${STACKS_API_URL}/extended/v1/address/${encodeURIComponent(address)}/balances`);
  const balances = await responseJson<{ stx?: { balance?: string } }>(response);
  if (!balances.stx?.balance || !/^\d+$/.test(balances.stx.balance)) {
    throw new Error("Unable to read the STX balance");
  }
  return BigInt(balances.stx.balance);
}

/** Fund exactly the configured router/asset pair before the signed settlement. */
export async function depositAsset(
  config: PublicRelayerConfig,
  address: string,
  amount: bigint,
  nativeStx = false
): Promise<string> {
  const result = await request("stx_callContract", {
    address,
    network: NETWORK,
    contract: (nativeStx ? config.stxRouter : config.router) as `${string}.${string}`,
    functionName: "deposit",
    functionArgs: nativeStx ? [Cl.uint(amount)] : [Cl.principal(config.asset), Cl.uint(amount)],
    postConditionMode: "deny",
    postConditions: [
      nativeStx
        ? Pc.origin().willSendEq(amount).ustx()
        : Pc.origin().willSendEq(amount).ft(config.asset as ContractIdString, config.tokenName),
    ],
  });
  return transactionId(result);
}

export async function submitPrivatePayment(options: {
  config: PublicRelayerConfig;
  walletAddress: string;
  recipient: string | ResolvedPrivateRecipient;
  enteredAmount: bigint;
  feeMode: SettlementFeeMode;
}): Promise<{ txid: string; recipientAmount: bigint; stealthPrincipal: string }> {
  // A reviewed BNS alias is resolved again immediately before the wallet prompt.
  // Ownership changes never silently redirect a payment.
  const recipient = typeof options.recipient === "string"
    ? { identifier: options.recipient, address: options.recipient, keys: null }
    : options.recipient;
  await assertBnsResolutionUnchanged(recipient);
  const tipResponse = await fetch(`${STACKS_API_URL}/v2/info`);
  const tip = await responseJson<{ stacks_tip_height: number }>(tipResponse);
  const prepared = await preparePrivateIntent({
    registry: options.config.registry,
    recipient: recipient.address,
    recipientKeys: recipient.keys ?? undefined,
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

export interface PreparedStxWalletPayment {
  recipient: ResolvedPrivateRecipient;
  prepared: Awaited<ReturnType<typeof preparePrivateIntent>>;
}

export async function prepareStxWalletPayment(options: {
  config: PublicRelayerConfig;
  recipient: ResolvedPrivateRecipient;
  enteredAmount: bigint;
  feeMode: SettlementFeeMode;
}): Promise<PreparedStxWalletPayment> {
  if (!options.recipient.keys) throw new Error("Recipient has no registered Privara privacy keys");
  const tip = await responseJson<{ stacks_tip_height: number }>(await fetch(`${STACKS_API_URL}/v2/info`));
  return {
    recipient: options.recipient,
    prepared: await preparePrivateIntent({
      registry: options.config.registry,
      recipient: options.recipient.address,
      recipientKeys: options.recipient.keys,
      network: NETWORK,
      router: options.config.stxRouter,
      asset: options.config.stxRouter,
      relayer: options.config.relayerAddress,
      enteredAmount: options.enteredAmount,
      settlementFeeBps: BigInt(options.config.settlementFeeBps),
      feeMode: options.feeMode,
      expiry: tip.stacks_tip_height + 200,
    }),
  };
}

/** Sign the reviewed STX intent; the relayer submits the separate router settlement. */
export async function submitStxWalletPayment(
  walletAddress: string,
  reviewed: PreparedStxWalletPayment
): Promise<{ txid: string; recipientAmount: bigint; stealthPrincipal: string }> {
  await assertBnsResolutionUnchanged(reviewed.recipient);
  const signed = await request("stx_signStructuredMessage", {
    domain: stealthIntentDomainCV(NETWORK, STX_ROUTER_CONTRACT),
    message: stealthIntentMessageCV(reviewed.prepared.intent),
  });
  const intent = attachStealthIntentSignature(reviewed.prepared.intent, signed.signature, NETWORK, STX_ROUTER_CONTRACT);
  if (intent.user !== walletAddress) throw new Error(`The signing wallet changed accounts (${intent.user})`);
  const result = await responseJson<{ txid: string }>(await fetch(`${RELAYER_URL}/v1/intents/settle-stx`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(privateIntentEnvelope({ ...reviewed.prepared, intent }, NETWORK)),
  }));
  return {
    txid: result.txid,
    recipientAmount: reviewed.prepared.quote.recipientAmount,
    stealthPrincipal: reviewed.prepared.announcement.stealthPrincipal,
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

export async function scanPrivateStxPayments(
  router: string,
  identity: PrivacyIdentity
): Promise<{ checked: number; payments: LivePayment[] }> {
  const announcements: Awaited<ReturnType<typeof fetchStxAnnouncementPage>>["announcements"] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await fetchStxAnnouncementPage({
      apiUrl: STACKS_API_URL,
      router,
      cursor,
      limit: 100,
      onInvalid: (metadata) => console.warn("Skipped invalid public STX announcement", metadata),
    });
    announcements.push(...page.announcements);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    if (pageNumber === 99) throw new Error("Announcement history exceeded the scanner safety limit");
  }
  const detected = await scanAnnouncements(
    announcements.map((announcement) => ({
      stealthPrincipal: announcement.stealthPrincipal,
      ephemeralPublicKey: announcement.ephemeralPublicKey,
      note: { version: announcement.version, nonce: announcement.nonce, ciphertext: announcement.ciphertext },
      context: {
        network: NETWORK,
        router,
        stealthPrincipal: announcement.stealthPrincipal,
        asset: announcement.asset,
        registryEpoch: announcement.registryEpoch,
        protocolVersion: announcement.version,
      },
    })),
    identity.viewingPrivateKey,
    identity.spendingPublicKey,
    NETWORK,
    identity.spendingPrivateKey,
    (metadata) => console.warn("Skipped invalid STX scan candidate", metadata)
  );
  const payments = await Promise.all(detected.map(async (payment): Promise<LivePayment> => {
    if (!payment.stealthPrivateKey) throw new Error("Scanner did not derive a spending key");
    const indexed = announcements.find((candidate) => candidate.stealthPrincipal === payment.stealthPrincipal);
    if (!indexed) throw new Error("Detected payment is missing its index record");
    return {
      stealthPrincipal: payment.stealthPrincipal,
      stealthPrivateKey: payment.stealthPrivateKey,
      balance: await readStxBalance(payment.stealthPrincipal),
      transactionId: indexed.transactionId,
      receivedAmount: indexed.amount - indexed.relayerFee,
      plaintext: new TextDecoder().decode(payment.plaintext),
    };
  }));
  return { checked: announcements.length, payments };
}

function mainnetClient() {
  return { ...STACKS_MAINNET, client: { baseUrl: STACKS_API_URL } } as typeof STACKS_MAINNET;
}

/** A native-STX stealth address already owns fee currency, so it signs and broadcasts directly. */
export interface PreparedPrivateStxSpend {
  destination: string;
  paymentAmount: bigint;
  networkFee: bigint;
  nonce: bigint;
}

export async function preparePrivateStxSpend(options: {
  payment: LivePayment;
  destination: string;
  amount?: bigint;
  fullBalance: boolean;
}): Promise<PreparedPrivateStxSpend> {
  const key = `${bytesToHex(options.payment.stealthPrivateKey)}01`;
  const network = mainnetClient();
  let probe: Awaited<ReturnType<typeof makeSTXTokenTransfer>>;
  let fallbackNetworkFee: bigint | null = null;
  try {
    probe = await makeSTXTokenTransfer({
      recipient: options.destination,
      amount: 1n,
      senderKey: key,
      network,
      memo: "Privara",
    });
  } catch (primaryError) {
    try {
      // Hiro's richer transaction-fee estimator can be temporarily unavailable.
      // Build the same signed shape with a zero placeholder, then price its exact byte
      // length through the standard transfer-fee endpoint before showing the review.
      probe = await makeSTXTokenTransfer({
        recipient: options.destination,
        amount: 1n,
        senderKey: key,
        network,
        memo: "Privara",
        fee: 0n,
      });
      fallbackNetworkFee = await fetchFeeEstimateTransfer({ transaction: probe, network });
    } catch {
      throw primaryError;
    }
  }
  const condition = probe.auth.spendingCondition;
  if (!condition) throw new Error("Unable to estimate the STX network fee");
  const networkFee = fallbackNetworkFee ?? BigInt(condition.fee);
  const paymentAmount = options.fullBalance
    ? options.payment.balance - networkFee
    : options.amount ?? 0n;
  if (paymentAmount <= 0n || paymentAmount + networkFee > options.payment.balance) {
    throw new Error("This one-time address does not have enough STX for the payment and network fee");
  }
  return {
    destination: options.destination,
    paymentAmount,
    networkFee,
    nonce: BigInt(condition.nonce),
  };
}

export async function submitPreparedPrivateStxSpend(
  payment: LivePayment,
  approved: PreparedPrivateStxSpend
): Promise<{ txid: string; paymentAmount: string; networkFeePaid: string }> {
  const key = `${bytesToHex(payment.stealthPrivateKey)}01`;
  const network = mainnetClient();
  const transaction = await makeSTXTokenTransfer({
    recipient: approved.destination,
    amount: approved.paymentAmount,
    senderKey: key,
    network,
    memo: "Privara",
    fee: approved.networkFee,
    nonce: approved.nonce,
  });
  const result = await broadcastTransaction({ transaction, network });
  if ("error" in result) throw new Error(`${result.error} ${result.reason ?? ""}`.trim());
  return { txid: result.txid, paymentAmount: approved.paymentAmount.toString(), networkFeePaid: approved.networkFee.toString() };
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
