import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  ExternalLink,
  FileKey,
  History,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  quoteSettlementFee,
  resolveMainnetRecipient,
  type PreparedSponsoredSpend,
  type PrivacyIdentity,
} from "@privara-stacks/sdk";
import {
  SUPPORTED_ASSETS,
  formatUnits,
  parseUnits,
  type Sip010Asset,
} from "./config/assets";
import {
  FALLBACK_LIVE_ASSET,
  FALLBACK_LIVE_ROUTER,
  FALLBACK_STEALTH_REGISTRY,
  NETWORK,
  RELAYER_URL,
  STACKS_API_URL,
  connectWallet,
  configForSip010Asset,
  createPrivacyIdentity,
  depositAsset,
  disconnectWallet,
  exportStoredBackup,
  fetchPublicConfig,
  hasPrivacyBackup,
  importPrivacyIdentity,
  prepareStxWalletPayment,
  preparePrivateSpend,
  preparePrivateStxSpend,
  privacyBackupStatus,
  privacyRegistrationState,
  publicKeyLabel,
  readRouterDeposit,
  readStxBalance,
  readWalletAssetBalance,
  registerPrivacyIdentity,
  resolveRecipient,
  scanPrivatePayments,
  scanPrivateStxPayments,
  spendPrivatePayment,
  submitPreparedPrivateStxSpend,
  storedWalletAddress,
  submitPrivatePayment,
  submitStxWalletPayment,
  unlockPrivacyIdentity,
  waitForTransaction,
  type LivePayment,
  type PublicRelayerConfig,
  type PreparedStxWalletPayment,
  type PreparedPrivateStxSpend,
  type ResolvedPrivateRecipient,
} from "./lib/live";
import { PrivacyBackupConflictError } from "./lib/privacy-backup";
import {
  maximumTransferAmount,
  paymentFundingShortfall,
} from "./lib/payment-funding";
import {
  parseDaoPayoutCsv,
  quoteDaoPayoutBatch,
  type DaoPayoutBatchQuote,
  type DaoPayoutInput,
} from "./lib/dao-payouts";
import { explorerTransactionUrl } from "./config/network";
import {
  atomicToUsd,
  defaultTransferAmount,
  fetchBitcoinUsdQuote,
  formatUsd,
  usdToAtomic,
  type BitcoinUsdQuote,
} from "./lib/usd-price";

type View = "overview" | "send" | "receive" | "activity" | "payouts" | "guide";
type FeeMode = "added" | "included";
type Notice = { kind: "success" | "error" | "info"; message: string } | null;
type SpendResult = { txid: string; paymentAmount: string; tokenSponsorFee: string; networkFeePaid: string };

const short = (value: string, start = 6, end = 5) =>
  `${value.slice(0, start)}…${value.slice(-end)}`;
const explorer = (txid: string) => explorerTransactionUrl(NETWORK, txid);
const assetContract = (asset: Sip010Asset) => asset.contract[NETWORK];
const networkLabel = NETWORK === "mainnet" ? "Mainnet" : "Testnet";
const UsdQuoteContext = createContext<BitcoinUsdQuote | null>(null);
const USD_AMOUNT_PRESETS = [5, 10, 25, 50, 100, 250] as const;
const viewFromPath = (): View => window.location.pathname.replace(/\/+$/, "") === "/guide"
  ? "guide"
  : "overview";

function FiatEstimate({ amount, asset, className = "" }: {
  amount: bigint; asset: Sip010Asset; className?: string;
}) {
  const quote = useContext(UsdQuoteContext);
  const value = atomicToUsd(amount, asset, quote?.price ?? null);
  if (value === null) return null;
  return <span
    className={`fiat-estimate ${className}`.trim()}
    title={asset.id === "usdcx"
      ? "Nominal USDCx dollar value; market value may vary"
      : `Indicative ${quote!.source} BTC/USD price; display only`}
  >≈ {formatUsd(value)}</span>;
}

async function copyText(value: string, notify: (notice: Notice) => void, label: string) {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard access is unavailable in this browser");
    await navigator.clipboard.writeText(value);
    notify({ kind: "success", message: `${label} copied to clipboard.` });
  } catch (error) {
    notify({ kind: "error", message: message(error) });
  }
}

const navItems = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "send" as const, label: "Send privately", icon: Send },
  { id: "receive" as const, label: "Receive & scan", icon: Inbox },
  { id: "activity" as const, label: "Activity", icon: History },
  { id: "payouts" as const, label: "DAO payouts", icon: Users },
];

function AssetIcon({ asset, small = false }: { asset: Sip010Asset; small?: boolean }) {
  return <span className={`asset-icon ${asset.tone} ${small ? "small" : ""}`}>{asset.icon}</span>;
}

export default function App() {
  const [view, setView] = useState<View>(viewFromPath);
  const [assetId, setAssetId] = useState("sbtc");
  const [assetMenu, setAssetMenu] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(() => storedWalletAddress());
  const [config, setConfig] = useState<PublicRelayerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<PrivacyIdentity | null>(null);
  const [payments, setPayments] = useState<LivePayment[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<LivePayment | null>(null);
  const [deposit, setDeposit] = useState(0n);
  const [tip, setTip] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [connecting, setConnecting] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [usdQuote, setUsdQuote] = useState<BitcoinUsdQuote | null>(null);
  const configErrorNotified = useRef(false);
  const asset = SUPPORTED_ASSETS.find((item) => item.id === assetId)!;
  const activeConfig = useMemo(() => config && asset.kind === "sip010"
    ? configForSip010Asset(config, assetContract(asset)!)
    : config, [config, asset]);

  // Keep the public guide shareable without introducing a routing dependency for this
  // small single-page app. Vercel rewrites /guide to index.html, and history handles
  // sidebar navigation plus the browser Back/Forward buttons.
  const navigate = (nextView: View) => {
    const nextPath = nextView === "guide" ? "/guide" : "/";
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
    setView(nextView);
  };

  useEffect(() => {
    const onPopState = () => setView(viewFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (asset.id !== "sbtc") {
      setUsdQuote(null);
      return;
    }
    let current = true;
    const loadPrice = () => void fetchBitcoinUsdQuote(RELAYER_URL)
      .then((quote) => current && setUsdQuote(quote))
      // Fiat is a convenience only. A provider outage must never block exact-sat flows.
      .catch(() => undefined);
    loadPrice();
    const timer = window.setInterval(loadPrice, 5 * 60_000);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [asset.id]);

  useEffect(() => {
    const loadConfig = () => void fetchPublicConfig()
      .then((value) => {
        setConfig(value);
        // The relayer is authoritative for the exact asset/router policy it serves.
        // This prevents the UI from labelling one configured policy as another asset.
        setConfigError(null);
        configErrorNotified.current = false;
      })
      .catch((error) => {
        // Report an outage once, then keep retrying quietly until the service recovers.
        if (!configErrorNotified.current) {
          setConfigError(error instanceof Error ? error.message : String(error));
          configErrorNotified.current = true;
        }
      });
    loadConfig();
    // A local or newly deployed relayer may start after the static app; reconnect without
    // making the user refresh or losing an unlocked in-memory privacy identity.
    const configTimer = window.setInterval(loadConfig, 15_000);
    void fetch(`${STACKS_API_URL}/v2/info`)
      .then((response) => response.json())
      .then((info: { stacks_tip_height?: number }) => setTip(info.stacks_tip_height ?? null))
      .catch(() => undefined);
    return () => window.clearInterval(configTimer);
  }, []);

  useEffect(() => {
    if (!activeConfig || !walletAddress) return;
    const balance = readRouterDeposit(activeConfig, walletAddress, asset.kind === "stx");
    void balance.then(setDeposit).catch(() => setDeposit(0n));
  }, [activeConfig, walletAddress, asset.kind]);

  useEffect(() => {
    setPayments([]);
    setSelectedPayment(null);
  }, [assetId]);

  const connect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const address = await connectWallet();
      setWalletAddress(address);
      setIdentity(null);
      setPayments([]);
      setNotice({ kind: "success", message: `Wallet connected to Stacks ${NETWORK}.` });
    } catch (error) {
      setNotice({ kind: "error", message: message(error) });
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    disconnectWallet();
    identity?.privacySeed.fill(0);
    identity?.spendingPrivateKey.fill(0);
    identity?.viewingPrivateKey.fill(0);
    setWalletAddress(null);
    setIdentity(null);
    setPayments([]);
    setNotice({ kind: "info", message: "Wallet disconnected and unlocked privacy keys cleared." });
  };

  return (
    <UsdQuoteContext.Provider value={usdQuote}>
      <div className={`app-shell asset-${asset.id}`}>
        <aside className="sidebar">
          <button className="brand" onClick={() => navigate("overview")} aria-label="Privara overview" disabled={batchProcessing}>
            <span className="brand-mark">P</span><span>privara</span>
          </button>
          <div className="demo-chip"><span />Live {NETWORK} app</div>
          <nav className="nav-list" aria-label="Main navigation">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => navigate(id)} disabled={batchProcessing && id !== "payouts"}>
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <button className={`guide-link ${view === "guide" ? "active" : ""}`} onClick={() => navigate("guide")} disabled={batchProcessing}><BookOpen size={16} /><span><strong>Privara guide</strong><small>How everything works</small></span></button>
            <div className="privacy-live">
              <span className={`status-dot ${identity ? "" : "inactive"}`} />
              <div><strong>{identity ? "Privacy keys unlocked" : "Privacy keys locked"}</strong><small>{identity ? "Held in this browser session" : "Unlock from Receive & scan"}</small></div>
            </div>
            {walletAddress && <button className="settings-link" onClick={disconnect} disabled={batchProcessing}><LogOut size={16} /> Disconnect</button>}
          </div>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <div className="network-status"><span className="pulse" /> Stacks {networkLabel} <span>·</span> {tip ? `Block ${tip.toLocaleString()}` : "Connecting…"}</div>
            <div className="top-actions">
              <div className="asset-select-wrap">
                <button className="asset-select" onClick={() => setAssetMenu(!assetMenu)} aria-expanded={assetMenu}>
                  <AssetIcon asset={asset} small /> {asset.symbol}<ChevronDown size={14} />
                </button>
                {assetMenu && <div className="asset-menu">
                  <span className="menu-label">Private payment assets</span>
                  {SUPPORTED_ASSETS.map((item) => (
                    <button key={item.id} disabled={item.kind !== "stx" && (!config || !configForSip010Asset(config, assetContract(item)!))} onClick={() => { setAssetId(item.id); setAssetMenu(false); }}>
                      <AssetIcon asset={item} small />
                      <span><strong>{item.symbol}</strong></span>
                      {assetId === item.id && <Check size={15} />}
                    </button>
                  ))}
                </div>}
              </div>
              {walletAddress ? (
                <button className="wallet-pill" onClick={() => void copyText(walletAddress, setNotice, "Wallet address")} title="Copy wallet address">
                  <span className="wallet-avatar">S</span><span>{short(walletAddress)}</span><Copy size={14} />
                </button>
              ) : (
                <button className="wallet-pill connect-wallet" onClick={connect} disabled={connecting}>
                  <Wallet size={15} />{connecting ? "Connecting…" : "Connect wallet"}
                </button>
              )}
            </div>
          </header>

          {(notice || configError) && <NoticeBar notice={notice ?? { kind: "error", message: `Relayer unavailable: ${configError}` }} clear={() => notice ? setNotice(null) : setConfigError(null)} />}

          {view === "overview" && <Overview asset={asset} wallet={walletAddress} identity={identity} deposit={deposit} payments={payments} go={navigate} openSpend={(payment) => setSelectedPayment(payment)} connect={connect} />}
          {view === "send" && <SendPrivate asset={asset} config={activeConfig} wallet={walletAddress} deposit={deposit} setDeposit={setDeposit} notify={setNotice} connect={connect} onDone={() => setView("activity")} />}
          {view === "receive" && <ReceiveAndScan asset={asset} config={activeConfig} wallet={walletAddress} identity={identity} setIdentity={setIdentity} payments={payments} setPayments={setPayments} notify={setNotice} connect={connect} openSpend={setSelectedPayment} />}
          {view === "activity" && <ActivityView asset={asset} payments={payments} />}
          {view === "payouts" && (asset.kind === "stx"
            ? <><PageTitle eyebrow="Teams & DAOs" title="STX batch payouts are not enabled yet." copy="The native STX router supports individual private sends only. Switch to sBTC for the existing contributor batch workflow." /><section className="panel empty-state"><Users size={28} /><h2>Use individual private STX payments</h2><p>This release adds no new batch protocol. Send each STX payment from Send privately, or select sBTC for DAO payouts.</p><button className="primary-action" onClick={() => navigate("send")}>Send STX privately</button></section></>
            : <Payouts asset={asset} config={activeConfig} wallet={walletAddress} deposit={deposit} setDeposit={setDeposit} notify={setNotice} connect={connect} onProcessingChange={setBatchProcessing} />)}
          {view === "guide" && <PrivaraGuide config={config} />}
        </main>

        {selectedPayment && activeConfig && walletAddress && (asset.kind === "stx" ?
          <StxSpend
            asset={asset}
            wallet={walletAddress}
            payment={selectedPayment}
            payments={payments.filter((payment) => payment.balance > 0n)}
            close={() => setSelectedPayment(null)}
            notify={setNotice}
            onComplete={(source, result) => {
              const spent = BigInt(result.paymentAmount) + BigInt(result.networkFeePaid);
              setPayments((current) => current.map((item) => item.transactionId === source.transactionId
                ? { ...item, balance: item.balance > spent ? item.balance - spent : 0n }
                : item));
            }}
          /> : <SponsoredSpend
            asset={asset}
            wallet={walletAddress}
            config={activeConfig}
            payment={selectedPayment}
            payments={payments.filter((payment) => payment.balance > 0n)}
            close={() => setSelectedPayment(null)}
            notify={setNotice}
            onComplete={(source, result) => {
              const spent = BigInt(result.paymentAmount) + BigInt(result.tokenSponsorFee);
              setPayments((current) => current.map((item) => item.transactionId === source.transactionId
                ? { ...item, balance: item.balance > spent ? item.balance - spent : 0n }
                : item));
            }}
          />
        )}
      </div>
    </UsdQuoteContext.Provider>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function NoticeBar({ notice, clear }: { notice: NonNullable<Notice>; clear: () => void }) {
  const noticeRef = useRef<HTMLDivElement>(null);
  const clearRef = useRef(clear);
  clearRef.current = clear;

  useEffect(() => {
    const duration = notice.kind === "info" ? 12_000 : notice.kind === "error" ? 9_000 : 7_000;
    const timer = window.setTimeout(() => clearRef.current(), duration);
    const dismissOutside = (event: PointerEvent) => {
      if (!noticeRef.current?.contains(event.target as Node)) clearRef.current();
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearRef.current();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [notice.kind, notice.message]);

  return <div ref={noticeRef} className={`notice-bar ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} aria-live={notice.kind === "error" ? "assertive" : "polite"}>
    <span className="notice-icon">{notice.kind === "error" ? <TriangleAlert size={18} /> : notice.kind === "success" ? <CircleCheck size={18} /> : <Info size={18} />}</span>
    <div><strong>{notice.kind === "error" ? "Something went wrong" : notice.kind === "success" ? "Success" : "In progress"}</strong><span>{notice.message}</span></div>
    <button onClick={clear} aria-label="Dismiss notification"><X size={15} /></button>
  </div>;
}

function PageTitle({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function Overview({ asset, wallet, identity, deposit, payments, go, openSpend, connect }: {
  asset: Sip010Asset; wallet: string | null; identity: PrivacyIdentity | null; deposit: bigint;
  payments: LivePayment[]; go: (view: View) => void; openSpend: (payment: LivePayment) => void; connect: () => void;
}) {
  const available = payments.reduce((sum, payment) => sum + payment.balance, 0n);
  return <>
    <PageTitle eyebrow="One-time-address workspace" title="Your detected stealth balances." copy="Privara hides the recipient's long-term wallet from settlement destinations. Amounts, payer activity, network/API activity, and later withdrawal links remain observable." action={<button className="primary-action" onClick={() => wallet ? go("send") : connect()}><Send size={16} /> {wallet ? "New private payment" : "Connect wallet"}</button>} />
    <section className="balance-grid">
      <article className="balance-card">
        <div className="card-head"><span>Detected private balance</span><span className="balance-asset"><AssetIcon asset={asset} small />{asset.symbol}</span></div>
        <p className="balance-number">{formatUnits(available, asset.decimals, asset.decimals)} <small>{asset.symbol}</small></p>
        <p className="balance-fiat"><FiatEstimate amount={available} asset={asset} /> <span>· Across {payments.filter((payment) => payment.balance > 0n).length} spendable one-time address(es)</span></p>
        <div className="action-row"><button className="dark-button" onClick={() => go("receive")}><Search size={15} /> Scan blockchain</button>{payments.find((payment) => payment.balance > 0n) && <button className="light-button" onClick={() => openSpend(payments.find((payment) => payment.balance > 0n)!)}><Wallet size={15} /> Spend</button>}</div>
        <div className="privacy-orbit" aria-hidden="true"><i /><i /><i /></div>
      </article>
      <article className="posture-card">
        <div className="posture-top"><span className="eyebrow on-dark">Live readiness</span><ShieldCheck size={23} /></div>
        <div className="score"><strong>{wallet && identity ? "Ready" : "Setup needed"}</strong><span>{wallet && identity ? "3 / 3" : wallet ? "1 / 3" : "0 / 3"}</span></div><div className="meter"><i style={{ width: wallet && identity ? "100%" : wallet ? "34%" : "0%" }} /></div>
        <ul><li><CircleCheck /> {wallet ? `Wallet ${short(wallet)}` : `Connect a ${NETWORK} wallet`}</li><li><CircleCheck /> {identity ? "Privacy identity unlocked" : "Unlock encrypted privacy backup"}</li><li><CircleCheck /> {asset.kind === "stx" ? "Wallet balance" : "Router deposit"}: {formatUnits(deposit, asset.decimals)} {asset.symbol}</li></ul>
      </article>
    </section>
    <section className="proof-strip"><div><span className="proof-icon"><Zap size={17} /></span><div><strong>Connected service</strong><small>{RELAYER_URL}</small></div></div><a href={`${STACKS_API_URL}/v2/info`} target="_blank" rel="noreferrer">Stacks API <ExternalLink size={13} /></a></section>
  </>;
}

function SendPrivate({ asset, config, wallet, deposit, setDeposit, notify, connect, onDone }: {
  asset: Sip010Asset; config: PublicRelayerConfig | null; wallet: string | null; deposit: bigint;
  setDeposit: (value: bigint) => void; notify: (notice: Notice) => void; connect: () => void; onDone: () => void;
}) {
  const usdQuote = useContext(UsdQuoteContext);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState(() => defaultTransferAmount(asset));
  const [feeMode, setFeeMode] = useState<FeeMode>("added");
  const [stage, setStage] = useState<"edit" | "review" | "signing" | "done">("edit");
  const [route, setRoute] = useState<"idle" | "checking" | "found" | "missing">("idle");
  const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedPrivateRecipient | null>(null);
  const [reviewedStx, setReviewedStx] = useState<PreparedStxWalletPayment | null>(null);
  const [funding, setFunding] = useState<"payment" | null>(null);
  const [walletAssetBalance, setWalletAssetBalance] = useState<bigint | null>(null);
  const [txid, setTxid] = useState("");
  const [stealthPrincipal, setStealthPrincipal] = useState("");
  const quote = useMemo(() => {
    try { return quoteSettlementFee({ amount: parseUnits(amount, asset.decimals), feeBps: BigInt(config?.settlementFeeBps ?? 100), mode: feeMode }); } catch { return null; }
  }, [amount, asset.decimals, config?.settlementFeeBps, feeMode]);
  const format = (value?: bigint) => value === undefined ? "—" : formatUnits(value, asset.decimals, asset.decimals);
  const shortfall = quote ? paymentFundingShortfall(quote.totalAmount, deposit) : 0n;
  const availableBalance = walletAssetBalance === null ? null : deposit + walletAssetBalance;
  const transferCapacity = (() => {
    if (availableBalance === null) return null;
    if (!config?.maxIntentAmount) return availableBalance;
    const relayerLimit = BigInt(config.maxIntentAmount);
    return availableBalance < relayerLimit ? availableBalance : relayerLimit;
  })();
  const maximumAmount = transferCapacity === null
    ? null
    : maximumTransferAmount(
      transferCapacity,
      BigInt(config?.settlementFeeBps ?? 100),
      feeMode
    );
  const exceedsAvailable = Boolean(
    quote && transferCapacity !== null && quote.totalAmount > transferCapacity
  );
  const balancePending = Boolean(wallet && config && transferCapacity === null);
  const chooseUsdPreset = (usd: number) => {
    const atomic = usdToAtomic(usd, asset, usdQuote?.price ?? null);
    if (atomic && atomic > 0n) setAmount(formatUnits(atomic, asset.decimals, asset.decimals));
  };

  useEffect(() => {
    setAmount(defaultTransferAmount(asset));
    setStage("edit");
    setReviewedStx(null);
  }, [asset.id]);

  useEffect(() => {
    if (!config || !wallet) return setWalletAssetBalance(null);
    let current = true;
    setWalletAssetBalance(null);
    void (asset.kind === "stx" ? readStxBalance(wallet) : readWalletAssetBalance(config, wallet))
      .then((balance) => current && setWalletAssetBalance(balance))
      .catch(() => current && setWalletAssetBalance(null));
    return () => { current = false; };
  }, [config, wallet, asset.kind]);

  useEffect(() => {
    setRoute("idle");
    setResolvedRecipient(null);
    if (!config || recipient.length < 3) return;
    const timer = window.setTimeout(() => {
      setRoute("checking");
      void resolveRecipient(config, recipient).then((resolved) => {
        setResolvedRecipient(resolved);
        setRoute(resolved.keys ? "found" : "missing");
      }).catch(() => setRoute("missing"));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [config, recipient]);

  const continueToReview = async () => {
    if (!wallet) return connect();
    if (!config || !quote || route !== "found" || !resolvedRecipient) return;
    try {
      setFunding("payment");
      // Refresh immediately before funding so concurrent deposits never cause us to
      // request more than the exact shortfall for this payment.
      const currentDeposit = await readRouterDeposit(config, wallet, asset.kind === "stx");
      setDeposit(currentDeposit);
      const required = paymentFundingShortfall(quote.totalAmount, currentDeposit);
      if (required > 0n) {
        notify({ kind: "info", message: `Approve funding of ${formatUnits(required, asset.decimals)} ${asset.symbol}. Privara will continue to payment review after confirmation.` });
        const id = await depositAsset(config, wallet, required, asset.kind === "stx");
        notify({ kind: "info", message: `Payment funding broadcast: ${short(id, 10, 8)}. Waiting for confirmation…` });
        await waitForTransaction(id);
        const fundedDeposit = await readRouterDeposit(config, wallet, asset.kind === "stx");
        const remainingWalletBalance = await readWalletAssetBalance(config, wallet);
        setDeposit(fundedDeposit);
        setWalletAssetBalance(remainingWalletBalance);
        if (fundedDeposit < quote.totalAmount) {
          throw new Error("Payment funding confirmed, but the available Privara balance is still insufficient");
        }
        notify({ kind: "success", message: "Payment funded. Review the exact recipient amount and settlement fee next." });
      }
      if (asset.kind === "stx") {
        setReviewedStx(await prepareStxWalletPayment({ config, recipient: resolvedRecipient, enteredAmount: parseUnits(amount, asset.decimals), feeMode }));
      }
      setStage("review");
    } catch (error) {
      notify({ kind: "error", message: `${message(error)} Make sure your wallet has enough ${NETWORK} ${asset.symbol}.` });
    } finally { setFunding(null); }
  };

  const submit = async () => {
    if (!wallet) return connect();
    if (!config || !quote || !resolvedRecipient) return;
    setStage("signing");
    try {
      const result = asset.kind === "stx"
        ? await submitStxWalletPayment(wallet, reviewedStx!)
        : await submitPrivatePayment({ config, walletAddress: wallet, recipient: resolvedRecipient, enteredAmount: parseUnits(amount, asset.decimals), feeMode });
      setTxid(result.txid); setStealthPrincipal(result.stealthPrincipal); setStage("done");
      notify({ kind: "success", message: `Private payment accepted by the relayer. Transaction ${short(result.txid, 10, 8)} was broadcast.` });
    } catch (error) { setStage("review"); notify({ kind: "error", message: message(error) }); }
  };

  if (stage === "done") return <SuccessState asset={asset} amount={format(quote?.recipientAmount)} tx={txid} detail={`Settling to fresh address ${short(stealthPrincipal, 9, 7)}`} action={onDone} />;
  return <>
    <PageTitle eyebrow="Live one-time-address payment" title="Pay a registered recipient." copy="Choose who receives and how much. Privara calculates any funding needed and guides you through the wallet approvals. Amount and payer activity are not hidden." />
    <div className="flow-layout">
      <section className="flow-card">
        {stage === "edit" ? <>
          <label className="field-label">Recipient’s Stacks address or BNS name</label><div className="address-input"><input value={recipient} onChange={(event) => setRecipient(event.target.value.trim())} placeholder={NETWORK === "mainnet" ? "SP… or name.btc" : "ST…"} disabled={funding !== null} />{route !== "idle" && <span className={`resolved ${route === "missing" ? "missing" : ""}`}>{route === "checking" ? "Checking…" : route === "found" ? <><CircleCheck size={14} /> Ready to receive</> : "Not registered"}</span>}</div>{resolvedRecipient?.bnsName && route === "found" && <small className="field-help">{resolvedRecipient.bnsName} resolves to {short(resolvedRecipient.address, 10, 8)}. This exact address will be pinned for review.</small>}
          <label className="field-label">Amount recipient should receive</label><div className={`amount-input ${exceedsAvailable ? "invalid" : ""}`}><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={funding !== null} aria-invalid={exceedsAvailable} /><span className="amount-asset"><AssetIcon asset={asset} small /> {asset.symbol}</span></div>
          {(asset.id === "usdcx" || (usdQuote && asset.id === "sbtc")) && <div className="fiat-tools"><div><FiatEstimate amount={quote?.recipientAmount ?? 0n} asset={asset} /><span>{asset.id === "usdcx" ? "USDCx nominal value" : "CoinGecko estimate"}</span></div><div className="fiat-presets">{USD_AMOUNT_PRESETS.map((usd) => <button type="button" key={usd} onClick={() => chooseUsdPreset(usd)} disabled={funding !== null}>${usd}</button>)}</div></div>}
          <div className={`transfer-maximum ${exceedsAvailable ? "invalid" : ""}`}><span>{availableBalance === null ? "Checking available balance…" : <>{formatUnits(availableBalance, asset.decimals, asset.decimals)} {asset.symbol} <FiatEstimate amount={availableBalance} asset={asset} /> available across your wallet and Privara balance</>}</span><button type="button" onClick={() => maximumAmount !== null && setAmount(formatUnits(maximumAmount, asset.decimals, asset.decimals))} disabled={maximumAmount === null || maximumAmount === 0n || funding !== null}>Use max · {maximumAmount === null ? "—" : formatUnits(maximumAmount, asset.decimals, asset.decimals)} {asset.symbol}</button></div>
          <div className="fee-choice"><button className={feeMode === "added" ? "selected" : ""} onClick={() => setFeeMode("added")} disabled={funding !== null}><span>{feeMode === "added" && <Check size={12} />}</span><div><strong>Add fee on top</strong><small>Recipient receives exactly {amount || "0"} {asset.symbol}</small></div><em>Recommended</em></button><button className={feeMode === "included" ? "selected" : ""} onClick={() => setFeeMode("included")} disabled={funding !== null}><span>{feeMode === "included" && <Check size={12} />}</span><div><strong>Include fee in amount</strong><small>Settlement fee comes out of the entered amount</small></div></button></div>
          {shortfall > 0n && wallet && <div className="funding-note"><Wallet size={16} /><p><strong>One router funding approval needed</strong><span>Privara will request exactly {format(shortfall)} {asset.symbol}, wait for confirmation, and continue automatically.</span></p></div>}
          <button className="primary-wide" disabled={!quote || route !== "found" || !config || funding !== null || exceedsAvailable || balancePending} onClick={continueToReview}>{funding === "payment" ? <><RefreshCw className="spin" size={16} /> Waiting for payment funding…</> : !wallet ? <>Connect wallet <ArrowRight size={16} /></> : balancePending ? <><RefreshCw className="spin" size={16} /> Checking available balance…</> : exceedsAvailable ? <>Amount exceeds available balance</> : shortfall > 0n ? <>Fund {format(shortfall)} {asset.symbol} & continue <ArrowRight size={16} /></> : <>Review payment <ArrowRight size={16} /></>}</button>
        </> : <div className="review-block"><button className="back-link" onClick={() => { setStage("edit"); setReviewedStx(null); }}>← Edit payment</button><div className="route-visual"><div><span className="route-avatar">A</span><small>Your funded payment</small></div><ArrowRight /><div className="stealth-destination"><span><LockKeyhole size={20} /></span><small>{resolvedRecipient?.bnsName ? `${resolvedRecipient.bnsName} → ${short(resolvedRecipient.address, 9, 7)}` : "Cryptographically derived"}</small><strong>Fresh one-time address</strong></div></div><div className="review-lines"><div><span>Recipient receives</span><strong>{format(quote?.recipientAmount)} {asset.symbol} <FiatEstimate amount={quote?.recipientAmount ?? 0n} asset={asset} /></strong></div><div><span>Privara settlement fee</span><strong>{format(quote?.settlementFee)} {asset.symbol} <FiatEstimate amount={quote?.settlementFee ?? 0n} asset={asset} /></strong></div><div className="total"><span>Total authorized</span><strong>{format(quote?.totalAmount)} {asset.symbol} <FiatEstimate amount={quote?.totalAmount ?? 0n} asset={asset} /></strong></div></div><div className="info-box"><Info size={16} /><p>Your wallet signs the exact recipient, amount, fee, nonce, and expiry. The relayer submits a separate settlement from the {asset.symbol} router. USD values are estimates and are not signed.</p></div><button className="primary-wide" onClick={submit} disabled={stage === "signing" || (asset.kind === "stx" && !reviewedStx)}>{stage === "signing" ? <><RefreshCw className="spin" size={16} /> Waiting for wallet…</> : <><Wallet size={16} /> Sign and submit</>}</button></div>}
      </section>
      <aside className="summary-card"><span className="eyebrow">Payment details</span><h3>Summary</h3><dl><div><dt>Recipient receives</dt><dd>{format(quote?.recipientAmount)} {asset.symbol}</dd></div><div><dt>Settlement fee</dt><dd>{format(quote?.settlementFee)} {asset.symbol}</dd></div><div><dt>Total</dt><dd>{format(quote?.totalAmount)} {asset.symbol}</dd></div><div><dt>Funding approval</dt><dd>{shortfall > 0n ? `${format(shortfall)} ${asset.symbol}` : "Not needed"}</dd></div></dl><details className="testnet-tools"><summary>{NETWORK === "testnet" ? "Testnet tools & advanced details" : "Advanced details"}</summary><p>Available Privara router balance: <strong>{formatUnits(deposit, asset.decimals)} {asset.symbol}</strong>.</p><dl><div><dt>Submission</dt><dd>{config ? short(config.relayerAddress, 8, 6) : "Offline"}</dd></div><div><dt>Expiry</dt><dd>≈ 200 blocks</dd></div><div><dt>Nonce</dt><dd>Unordered random</dd></div></dl></details></aside>
    </div>
  </>;
}

function ReceiveAndScan({ asset, config, wallet, identity, setIdentity, payments, setPayments, notify, connect, openSpend }: {
  asset: Sip010Asset; config: PublicRelayerConfig | null; wallet: string | null; identity: PrivacyIdentity | null;
  setIdentity: (identity: PrivacyIdentity | null) => void; payments: LivePayment[]; setPayments: (payments: LivePayment[]) => void;
  notify: (notice: Notice) => void; connect: () => void; openSpend: (payment: LivePayment) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupMode, setSetupMode] = useState<"choose" | "create" | "restore">("choose");
  const [selectedBackup, setSelectedBackup] = useState<File | null>(null);
  const [registration, setRegistration] = useState<"checking" | "unregistered" | "registered" | "matched" | "mismatch" | "unavailable">("checking");
  const [busy, setBusy] = useState<string | null>(null);
  const [checked, setChecked] = useState(0);
  const [backupRevision, setBackupRevision] = useState(0);
  const backupExists = wallet ? hasPrivacyBackup(wallet) : false;
  // backupRevision intentionally makes localStorage workflow changes reactive.
  void backupRevision;
  const backupState = wallet ? privacyBackupStatus(wallet) : null;
  const backupVerified = Boolean(backupState?.exported && backupState.verified);
  const passwordReady = password.length >= 12;
  const registry = config?.registry ?? FALLBACK_STEALTH_REGISTRY;

  useEffect(() => {
    setSetupMode("choose");
    setPassword("");
    setConfirmPassword("");
    setSelectedBackup(null);
  }, [wallet]);

  useEffect(() => {
    if (!wallet) return setRegistration("unregistered");
    let current = true;
    setRegistration("checking");
    void privacyRegistrationState(registry, wallet, identity ?? undefined)
      .then((state) => current && setRegistration(state))
      .catch(() => current && setRegistration("unavailable"));
    return () => { current = false; };
  }, [wallet, registry, identity, backupRevision]);

  const clearPasswordFields = () => {
    setPassword("");
    setConfirmPassword("");
    setSelectedBackup(null);
  };

  const downloadBackup = (nextMessage: string) => {
    if (!wallet) return;
    exportStoredBackup(wallet);
    setBackupRevision((value) => value + 1);
    notify({ kind: "success", message: nextMessage });
  };

  const privacyAction = async (kind: "create" | "unlock" | "register") => {
    if (!wallet) return connect();
    try {
      setBusy(kind);
      if (kind === "create") {
        if (password !== confirmPassword) throw new Error("The two backup passwords do not match");
        const existingRegistration = await privacyRegistrationState(registry, wallet);
        if (existingRegistration !== "unregistered") {
          throw new Error("This wallet already has a private receiving identity. Restore its encrypted backup instead of creating a different one");
        }
        const created = await createPrivacyIdentity(wallet, password);
        // Keep the new keys inactive until the user downloads and successfully restores
        // the encrypted file. Creation alone must never enable private receiving.
        created.identity.privacySeed.fill(0);
        created.identity.spendingPrivateKey.fill(0);
        created.identity.viewingPrivateKey.fill(0);
        setBackupRevision((value) => value + 1);
        clearPasswordFields();
        notify({ kind: "success", message: "Privacy identity created locally. Download the encrypted recovery backup to continue." });
        return;
      }
      let active = identity;
      if (kind === "unlock") {
        active = await unlockPrivacyIdentity(wallet, password, registry);
        const state = await privacyRegistrationState(registry, wallet, active);
        setRegistration(state);
      }
      if (!active) throw new Error("Create or unlock the privacy identity first");
      setIdentity(active);
      if (kind === "register") {
        // Registration talks directly to the immutable registry through the wallet;
        // it must not fail merely because the optional relayer service is offline.
        const result = await registerPrivacyIdentity(registry, wallet, active);
        if (result.txid) {
          notify({ kind: "info", message: `Privacy registration broadcast: ${short(result.txid, 10, 8)}. Waiting for confirmation…` });
          await waitForTransaction(result.txid);
        }
        setRegistration("matched");
        notify({ kind: "success", message: result.alreadyRegistered ? "The registered public privacy keys match this recovery backup. Private receiving is enabled." : "Public privacy keys registered successfully. Private receiving is now enabled." });
      } else notify({ kind: "success", message: "Privacy identity unlocked for this browser session." });
      clearPasswordFields();
    } catch (error) { notify({ kind: "error", message: message(error) }); } finally { setBusy(null); }
  };

  const importBackup = async () => {
    if (!selectedBackup || !wallet) return;
    if (password.length < 12) {
      notify({ kind: "error", message: "Enter the backup password before verifying the selected recovery file." });
      return;
    }
    const encoded = await selectedBackup.text();
    try {
      setBusy("import");
      let active: PrivacyIdentity;
      try {
        active = await importPrivacyIdentity(wallet, encoded, password, false, registry);
      } catch (error) {
        if (!(error instanceof PrivacyBackupConflictError)) throw error;
        const replace = window.confirm(
          "This file contains a different Privara privacy identity. Continue only if you intend to replace the local encrypted backup for this wallet. Privara will download the current backup before making any change."
        );
        if (!replace) throw new Error("Import cancelled; the existing privacy identity was preserved");
        exportStoredBackup(wallet);
        active = await importPrivacyIdentity(wallet, encoded, password, true, registry);
      }
      const state = await privacyRegistrationState(registry, wallet, active);
      setIdentity(active);
      setRegistration(state);
      setBackupRevision((value) => value + 1);
      setSetupMode("choose");
      notify({
        kind: "success",
        message: state === "matched"
          ? "Recovery backup verified and matched to this wallet's registered public privacy keys. Private receiving is restored."
          : "Recovery backup verified successfully. Register its public privacy keys to enable private receiving.",
      });
      clearPasswordFields();
    }
    catch (error) { notify({ kind: "error", message: message(error) }); } finally { setBusy(null); }
  };

  const lockIdentity = () => {
    identity?.privacySeed.fill(0);
    identity?.spendingPrivateKey.fill(0);
    identity?.viewingPrivateKey.fill(0);
    setIdentity(null);
    setPayments([]);
    notify({ kind: "info", message: "Privacy identity locked and decrypted keys cleared from this browser session." });
  };

  const scan = async () => {
    if (!backupVerified || registration !== "matched") return notify({ kind: "error", message: "Complete recovery verification and enable private receiving before scanning." });
    if (!identity) return notify({ kind: "error", message: "Enter your backup password and unlock the verified privacy identity before scanning." });
    // Discovery is client-side and reads public chain data directly. A relayer outage
    // must not prevent a recipient from finding an existing payment.
    const scanConfig = config ?? { router: FALLBACK_LIVE_ROUTER, asset: FALLBACK_LIVE_ASSET };
    try {
      setBusy("scan"); const result = asset.kind === "stx"
        ? await scanPrivateStxPayments(config?.stxRouter ?? assetContract(asset)!, identity)
        : await scanPrivatePayments(scanConfig, identity); setChecked(result.checked); setPayments(result.payments); notify({ kind: "success", message: `Scanned ${result.checked} announcement(s); detected ${result.payments.length} payment(s).` });
    }
    catch (error) { notify({ kind: "error", message: message(error) }); } finally { setBusy(null); }
  };


  const passwordField = (confirmation = false) => <>
    <label className="field-label password-label">Backup password <span>Minimum 12 characters</span></label>
    <div className={`address-input compact password-input ${passwordReady ? "valid" : "required"}`}>
      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your backup password" />
    </div>
    {confirmation && <>
      <label className="field-label">Confirm backup password</label>
      <div className={`address-input compact password-input ${confirmPassword && confirmPassword === password ? "valid" : "required"}`}>
        <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Enter the same password again" />
      </div>
    </>}
    <small className="field-help">This password encrypts your recovery file. Privara cannot retrieve or reset it for you.</small>
  </>;

  const fileField = <label className={`backup-file-picker ${selectedBackup ? "selected" : ""}`}>
    <FileKey size={18} />
    <span><strong>{selectedBackup ? selectedBackup.name : "Choose encrypted backup JSON"}</strong><small>{selectedBackup ? "File selected and ready for password verification." : "Select the Privara recovery file saved from this setup or another browser."}</small></span>
    <input type="file" accept="application/json" onChange={(event) => setSelectedBackup(event.target.files?.[0] ?? null)} disabled={busy !== null} />
  </label>;

  const registrationEnabled = registration === "matched" || (!identity && registration === "registered");
  const receivingEnabled = backupVerified && registrationEnabled;

  return <>
    <PageTitle eyebrow="Receive & discover" title="Find payments sent to your one-time addresses." copy="Privara hides your long-term wallet from the on-chain settlement destination. It does not hide payment amounts, payer activity, network requests, or links created by later withdrawals." action={<button className="primary-action" onClick={scan} disabled={busy !== null || !identity || !backupVerified || registration !== "matched"}>{busy === "scan" ? <RefreshCw className="spin" size={16} /> : <Search size={16} />} Scan announcements</button>} />
    {!wallet ? <section className="panel empty-state"><Wallet size={28} /><h2>Connect a {NETWORK} wallet</h2><p>Your privacy backup is stored separately for each wallet address.</p><button className="primary-action" onClick={connect}>Connect Leather or Xverse</button></section> : <section className="setup-grid">
      <article className="panel setup-card"><div className="section-head"><div><span className="eyebrow">Independent privacy identity</span><h2>{receivingEnabled ? "Private receiving enabled" : backupVerified ? "Recovery backup verified" : backupExists ? "Complete your recovery check" : registration === "registered" ? "Restore your registered identity" : "Not set up on this device"}</h2></div><span className={`ready-badge ${identity && registration === "matched" ? "" : "locked"}`}>{identity && registration === "matched" ? <CircleCheck size={14} /> : <LockKeyhole size={14} />}{identity && registration === "matched" ? "Unlocked" : receivingEnabled ? "Enabled · locked" : "Not enabled"}</span></div>
        <div className="warning-box"><TriangleAlert size={16} /><p>Stealth funds are controlled by your independent Privara privacy seed—not by Leather, Xverse, or a connected hardware wallet. Those wallets cannot recover these funds. Keep the encrypted JSON and its password safe.</p></div>
        {!backupExists && setupMode === "choose" && <div className="setup-stage"><p>{registration === "registered" ? "This wallet already has public privacy keys registered on Stacks. Restore the matching encrypted recovery file to regain access; creating a different identity would not control existing private balances." : "Create a private receiving identity to accept payments through fresh one-time addresses. If you have used Privara with this wallet before, restore the encrypted recovery file instead."}</p><div className="choice-actions">{registration !== "registered" && <button className="dark-button" onClick={() => setSetupMode("create")}>Create new identity</button>}<button className={registration === "registered" ? "dark-button" : "light-button"} onClick={() => setSetupMode("restore")}><FileKey size={15} /> Restore existing identity</button></div></div>}
        {!backupExists && setupMode === "create" && <div className="setup-stage"><button className="back-link" onClick={() => { setSetupMode("choose"); clearPasswordFields(); }}>← Back</button><span className="step-label">Step 1 of 4</span><h3>Protect your privacy backup</h3><p>Create a password for the encrypted Privara recovery file. The privacy identity will be generated locally only after both password entries match.</p>{passwordField(true)}<button className="primary-wide" onClick={() => privacyAction("create")} disabled={!passwordReady || password !== confirmPassword || busy !== null}>{busy === "create" ? <RefreshCw className="spin" size={16} /> : null} Continue</button></div>}
        {backupExists && !backupState?.exported && <div className="setup-stage"><span className="step-label">Step 2 of 4</span><h3>Save your recovery backup</h3><p>Your privacy identity was created locally. Download its encrypted recovery file before private receiving can be enabled.</p><button className="primary-wide" onClick={() => downloadBackup("Encrypted recovery backup downloaded. Verify this exact file to continue.")} disabled={busy !== null}><FileKey size={16} /> Download encrypted backup</button></div>}
        {backupExists && backupState?.exported && !backupVerified && <div className="setup-stage"><span className="step-label">Step 3 of 4</span><h3>Verify your recovery backup</h3><p>Select the file you downloaded and enter its password. Privara will decrypt it locally, derive the public privacy keys again, and confirm that the recovered identity is an exact match.</p>{fileField}{passwordField()}<button className="primary-wide" onClick={() => void importBackup()} disabled={!selectedBackup || !passwordReady || busy !== null}>{busy === "import" ? <RefreshCw className="spin" size={16} /> : <ShieldCheck size={16} />} Verify backup</button></div>}
        {setupMode === "restore" && (!backupExists || backupVerified) && !identity && <div className="setup-stage"><button className="back-link" onClick={() => { setSetupMode("choose"); clearPasswordFields(); }}>← Back</button><h3>Restore Privara identity</h3><p>Select an encrypted recovery file and enter its password. Privara will verify it locally and compare its public privacy keys with any identity already registered to this wallet. A mismatch will stop the restore without overwriting anything.</p>{fileField}{passwordField()}<button className="primary-wide" onClick={() => void importBackup()} disabled={!selectedBackup || !passwordReady || busy !== null}>{busy === "import" ? <RefreshCw className="spin" size={16} /> : <FileKey size={16} />} Restore and verify</button></div>}
        {backupVerified && !identity && setupMode !== "restore" && <div className="setup-stage"><div className="recovery-status"><div><CircleCheck size={16} /><span><strong>Recovery backup</strong><small>Verified on this device</small></span></div><div>{registration === "registered" ? <CircleCheck size={16} /> : <LockKeyhole size={16} />}<span><strong>Private receiving</strong><small>{registration === "registered" ? "Public privacy keys registered" : registration === "unregistered" ? "Unlock to finish registration" : "Checking on-chain registration"}</small></span></div></div><h3>{registration === "registered" ? "Unlock private payments" : "Unlock to continue setup"}</h3><p>Enter the backup password to decrypt your independent privacy identity for this browser session.</p>{passwordField()}<button className="primary-wide" onClick={() => privacyAction("unlock")} disabled={!passwordReady || busy !== null}>{busy === "unlock" ? <RefreshCw className="spin" size={16} /> : <KeyRound size={16} />} Unlock privacy identity</button><details className="backup-manage"><summary>Manage recovery backup</summary><div><button className="light-button" onClick={() => downloadBackup("A new copy of the encrypted recovery backup was downloaded.")}><FileKey size={15} /> Download another copy</button><button className="light-button" onClick={() => { clearPasswordFields(); setSetupMode("restore"); }}>Restore a backup file</button></div></details></div>}
        {identity && registration !== "matched" && <div className="setup-stage"><span className="step-label">Step 4 of 4</span><div className="verified-callout"><CircleCheck size={18} /><span><strong>Recovery backup verified</strong><small>This file can restore your Privara privacy identity.</small></span></div><h3>Enable private receiving</h3><p>Privara will ask your connected wallet to register the public privacy keys on Stacks. Your privacy seed and private keys remain on this device and are never sent on-chain.</p><button className="primary-wide" onClick={() => privacyAction("register")} disabled={busy !== null || !backupVerified || registration === "checking" || registration === "unavailable"}>{busy === "register" ? <RefreshCw className="spin" size={16} /> : <KeyRound size={16} />} Enable private receiving</button>{registration === "unavailable" && <small className="field-help">The Stacks API is temporarily unavailable, so registration status cannot be confirmed yet.</small>}</div>}
        {identity && registration === "matched" && <div className="setup-stage enabled-stage"><div className="verified-callout"><CircleCheck size={18} /><span><strong>Private receiving enabled</strong><small>Your verified recovery identity matches the public privacy keys registered to this wallet.</small></span></div><p>Your privacy identity is unlocked only for this browser session. You can now scan for payments sent to your one-time addresses.</p><div className="privacy-actions"><button className="dark-button" onClick={scan} disabled={busy !== null}><Search size={15} /> Scan for payments</button><button className="light-button" onClick={lockIdentity}><LockKeyhole size={15} /> Lock identity</button></div><details className="backup-manage"><summary>Recovery and public-key details</summary><div className="key-list"><div><span>Spending public key</span><code>{short(publicKeyLabel(identity, "spending"), 12, 10)}</code><button onClick={() => void copyText(publicKeyLabel(identity, "spending"), notify, "Spending public key")} aria-label="Copy spending public key"><Copy size={13} /></button></div><div><span>Viewing public key</span><code>{short(publicKeyLabel(identity, "viewing"), 12, 10)}</code><button onClick={() => void copyText(publicKeyLabel(identity, "viewing"), notify, "Viewing public key")} aria-label="Copy viewing public key"><Copy size={13} /></button></div><button className="light-button" onClick={() => downloadBackup("A new copy of the encrypted recovery backup was downloaded.")}><FileKey size={15} /> Download encrypted backup</button></div></details></div>}
      </article>
      <article className="panel scan-card"><div className="scan-radar"><Radio size={28} /><i /><i /></div><span className="eyebrow">Local scanner</span><h2>{payments.length ? `${payments.length} payment(s) detected` : "Your keys, your inbox"}</h2><p>Public announcements are downloaded from the Stacks API. Matching and one-time spending-key derivation happen inside this browser.</p><div className="scan-stat"><div><strong>{checked}</strong><small>Announcements checked</small></div><div><strong>{payments.length}</strong><small>Payments detected</small></div></div></article>
    </section>}
    <section className="panel payment-list"><div className="section-head"><div><span className="eyebrow">Detected balances</span><h2>One-time addresses</h2></div><span className="muted-label">{payments.filter((payment) => payment.balance > 0n).length} spendable</span></div>{payments.length === 0 ? <div className="inline-empty">Unlock and scan to load live balances.</div> : [...payments].sort((left, right) => Number(right.balance > 0n) - Number(left.balance > 0n)).map((payment) => <PrivatePaymentRow asset={asset} payment={payment} openSpend={openSpend} key={payment.transactionId} />)}</section>
  </>;
}

function LongTermWalletWarning({ confirmed, setConfirmed }: {
  confirmed: boolean;
  setConfirmed: (confirmed: boolean) => void;
}) {
  return <>
    <div className="warning-box long-term-wallet-warning" role="alert">
      <TriangleAlert size={18} />
      <p><strong>Connected long-term wallet detected.</strong> Moving this private balance to the wallet registered with Privara creates a direct public link between the one-time address and your known identity. Use a different destination when preserving separation matters.</p>
    </div>
    <label className="risk-confirmation">
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span><strong>I understand and still want to use this address</strong><small>This acknowledgement is required before Privara will prepare the transaction.</small></span>
    </label>
  </>;
}

function PrivatePaymentRow({ asset, payment, openSpend }: {
  asset: Sip010Asset;
  payment: LivePayment;
  openSpend: (payment: LivePayment) => void;
}) {
  const empty = payment.balance === 0n;
  const partiallySpent = !empty && payment.balance < payment.receivedAmount;
  const received = `${formatUnits(payment.receivedAmount, asset.decimals, asset.decimals)} ${asset.symbol}`;

  return <div className={`private-payment ${empty ? "spent" : "spendable"}`}>
    <span className="payment-symbol">{empty ? <CircleCheck /> : <ArrowDownLeft />}</span>
    <div className="payment-balance-copy">
      <strong>{formatUnits(payment.balance, asset.decimals, asset.decimals)} {asset.symbol} <FiatEstimate amount={payment.balance} asset={asset} /></strong>
      <span className="payment-balance-state">{empty ? `No spendable balance · ${received} originally received` : partiallySpent ? `${received} originally received` : "Available to spend"}</span>
      <small>{short(payment.stealthPrincipal, 10, 8)} · {short(payment.transactionId, 10, 8)}</small>
    </div>
    {empty ? <span className="payment-status spent"><CircleCheck size={13} /> Spent</span> : <>
      <span className="payment-status available"><CircleCheck size={13} /> Available</span>
      <button onClick={() => openSpend(payment)}>Spend <ArrowUpRight size={14} /></button>
    </>}
  </div>;
}

function StxSpend({ asset, wallet, payment, payments, close, notify, onComplete }: {
  asset: Sip010Asset; wallet: string; payment: LivePayment; payments: LivePayment[];
  close: () => void; notify: (notice: Notice) => void; onComplete: (source: LivePayment, result: SpendResult) => void;
}) {
  const [kind, setKind] = useState<"send" | "withdraw">("send");
  const [sourceId, setSourceId] = useState(payment.transactionId);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [approved, setApproved] = useState<PreparedPrivateStxSpend | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SpendResult | null>(null);
  const [longTermConfirmed, setLongTermConfirmed] = useState(false);
  const [resolvedLongTermDestination, setResolvedLongTermDestination] = useState(false);
  const activePayment = payments.find((item) => item.transactionId === sourceId) ?? payment;
  const paymentAmount = (() => { try { return parseUnits(amount, asset.decimals); } catch { return 0n; } })();
  const longTermDestination = destination.trim().toUpperCase() === wallet.toUpperCase();
  const requiresLongTermConfirmation = longTermDestination || resolvedLongTermDestination;

  // A resolved BNS match remains sensitive when switching between Pay someone
  // and Move all. Reset the acknowledgement only when the destination changes.
  useEffect(() => {
    setLongTermConfirmed(false);
    setResolvedLongTermDestination(false);
  }, [destination]);

  const review = async () => {
    try {
      setReviewing(true);
      const resolved = await resolveMainnetRecipient(destination);
      if (resolved.address.toUpperCase() === wallet.toUpperCase() && !longTermConfirmed) {
        setResolvedLongTermDestination(true);
        throw new Error("This destination is your connected long-term wallet. Confirm the privacy warning before continuing.");
      }
      const prepared = await preparePrivateStxSpend({
        payment: activePayment,
        destination: resolved.address,
        amount: kind === "send" ? paymentAmount : undefined,
        fullBalance: kind === "withdraw",
      });
      setApproved(prepared);
      notify({ kind: "info", message: `Network fee pinned at ${formatUnits(prepared.networkFee, 6)} STX. Move all leaves no fee dust.` });
    } catch (error) { notify({ kind: "error", message: message(error) }); }
    finally { setReviewing(false); }
  };
  const submit = async () => {
    if (!approved) return;
    try {
      setSubmitting(true);
      const response = await submitPreparedPrivateStxSpend(activePayment, approved);
      const normalized: SpendResult = { ...response, tokenSponsorFee: "0" };
      setResult(normalized);
      onComplete(activePayment, normalized);
      notify({ kind: "success", message: `STX transfer broadcast as ${short(response.txid, 10, 8)}.` });
    } catch (error) { notify({ kind: "error", message: message(error) }); }
    finally { setSubmitting(false); }
  };
  return <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !submitting && close()}>
    <section className="spend-drawer" role="dialog" aria-modal="true" aria-labelledby="stx-spend-title">
      <button className="close-button" onClick={close} disabled={submitting}><X /></button>
      {result ? <SuccessState asset={asset} amount={formatUnits(BigInt(result.paymentAmount), 6, 6)} tx={result.txid} detail={`One-time address paid ${result.networkFeePaid} µSTX network fee`} action={close} compact /> : <>
        <span className="eyebrow">Native STX spend</span>
        <h2 id="stx-spend-title">Move private balance</h2>
        <p className="drawer-copy">The one-time key signs locally. This address already holds STX, so no sponsor is required.</p>
        {!approved ? <>
          <div className="source-account"><div><span className="source-lock"><LockKeyhole size={18} /></span><div className="source-details"><small>Spend from one-time address</small><span className="source-picker"><select value={sourceId} onChange={(event) => setSourceId(event.target.value)} disabled={reviewing || payments.length < 2}>{payments.map((item) => <option value={item.transactionId} key={item.transactionId}>{short(item.stealthPrincipal, 10, 8)} · {formatUnits(item.balance, 6, 6)} STX</option>)}</select><ChevronDown size={15} /></span></div></div><span><strong>{formatUnits(activePayment.balance, 6, 6)}</strong><small>STX available</small></span></div>
          <div className="segmented spend-actions"><button className={kind === "send" ? "active" : ""} onClick={() => setKind("send")}>Pay someone</button><button className={kind === "withdraw" ? "active" : ""} onClick={() => setKind("withdraw")}>Move all</button></div>
          <label className="field-label">Destination address or BNS name</label>
          <div className="address-input compact"><input value={destination} onChange={(event) => setDestination(event.target.value.trim())} placeholder="SP… or name.btc" /></div>
          {requiresLongTermConfirmation && <LongTermWalletWarning confirmed={longTermConfirmed} setConfirmed={setLongTermConfirmed} />}
          {kind === "send" && <><label className="field-label">Amount recipient receives</label><div className={`amount-input ${paymentAmount > activePayment.balance ? "invalid" : ""}`}><input value={amount} onChange={(event) => setAmount(event.target.value)} /><span className="amount-asset"><AssetIcon asset={asset} small /> STX</span></div></>}
          <div className="info-box"><Info size={16} /><p>{kind === "withdraw" ? "Privara estimates and subtracts the network fee before signing, so the rest can move without an insufficient-balance error." : "The network fee is paid from this one-time STX balance and shown before signing."}</p></div>
          <button className="primary-wide" onClick={review} disabled={reviewing || !destination || (requiresLongTermConfirmation && !longTermConfirmed) || (kind === "send" && (paymentAmount <= 0n || paymentAmount >= activePayment.balance))}>{reviewing ? <><RefreshCw className="spin" size={16} /> Estimating network fee…</> : requiresLongTermConfirmation && !longTermConfirmed ? <>Confirm the privacy warning</> : <><ArrowRight size={16} /> Review exact fee</>}</button>
        </> : <>
          <button className="back-link" onClick={() => setApproved(null)} disabled={submitting}>← Change payment</button>
          <div className="review-lines"><div><span>Recipient receives</span><strong>{formatUnits(approved.paymentAmount, 6, 6)} STX</strong></div><div><span>Exact network fee</span><strong>{formatUnits(approved.networkFee, 6, 6)} STX</strong></div><div><span>Destination</span><strong>{short(approved.destination, 9, 7)}</strong></div><div className="total"><span>Total signed outflow</span><strong>{formatUnits(approved.paymentAmount + approved.networkFee, 6, 6)} STX</strong></div></div>
          {approved.destination.toUpperCase() === wallet.toUpperCase() && <div className="warning-box long-term-wallet-warning" role="alert"><TriangleAlert size={18} /><p><strong>Direct long-term-wallet link.</strong> Signing this transaction publicly links the one-time address to your connected wallet.</p></div>}
          <div className="info-box"><Info size={16} /><p>This fee and destination are pinned. No sponsor or Privara relayer can change them after approval.</p></div>
          <button className="primary-wide" onClick={submit} disabled={submitting}>{submitting ? <><RefreshCw className="spin" size={16} /> Broadcasting…</> : <><Zap size={16} /> Sign locally & broadcast</>}</button>
        </>}
      </>}
    </section>
  </div>;
}

function SponsoredSpend({ asset, config, wallet, payment, payments, close, notify, onComplete }: {
  asset: Sip010Asset; config: PublicRelayerConfig; wallet: string; payment: LivePayment; payments: LivePayment[];
  close: () => void; notify: (notice: Notice) => void; onComplete: (source: LivePayment, result: SpendResult) => void;
}) {
  const usdQuote = useContext(UsdQuoteContext);
  const [kind, setKind] = useState<"send" | "withdraw" | "bitcoin">("send");
  const [sourceId, setSourceId] = useState(payment.transactionId);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState(() => defaultTransferAmount(asset));
  const [approved, setApproved] = useState<PreparedSponsoredSpend | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SpendResult | null>(null);
  const [longTermConfirmed, setLongTermConfirmed] = useState(false);
  const activePayment = payments.find((item) => item.transactionId === sourceId) ?? payment;
  const paymentAmount = (() => { try { return parseUnits(amount, asset.decimals); } catch { return 0n; } })();
  const exceedsBalance = kind === "send" && paymentAmount > activePayment.balance;
  const longTermDestination = kind !== "bitcoin" && destination.trim().toUpperCase() === wallet.toUpperCase();

  // The same connected-wallet destination has the same privacy consequence in
  // either payment mode, so changing tabs must not make its warning disappear.
  useEffect(() => setLongTermConfirmed(false), [destination]);
  // Both direct payments and full-balance moves use the Stacks destination the user reviewed.
  // We deliberately do not default to the connected wallet because that creates an
  // obvious public link between the one-time address and the user's long-term identity.
  const request = () => ({ config, payment: activePayment, destination, fullBalance: kind === "withdraw", amount: kind === "send" ? paymentAmount : undefined });
  const chooseUsdPreset = (usd: number) => {
    const atomic = usdToAtomic(usd, asset, usdQuote?.price ?? null);
    if (atomic && atomic > 0n) setAmount(formatUnits(atomic, asset.decimals, asset.decimals));
  };
  const review = async () => {
    try {
      setReviewing(true);
      if (longTermDestination && !longTermConfirmed) {
        throw new Error("This destination is your connected long-term wallet. Confirm the privacy warning before continuing.");
      }
      const prepared = await preparePrivateSpend(request());
      setApproved(prepared);
      notify({ kind: "info", message: `Quote locked: ${formatUnits(prepared.sponsorFee, asset.decimals)} ${asset.symbol} sponsorship fee. It will not refresh during confirmation.` });
    } catch (error) { notify({ kind: "error", message: message(error) }); }
    finally { setReviewing(false); }
  };
  const submit = async () => {
    if (!approved) return notify({ kind: "error", message: "Review and approve the exact sponsor fee first." });
    try {
      setSubmitting(true);
      notify({ kind: "info", message: "Signing the displayed payment and sponsor fee locally. No quote refresh is performed." });
      const response = await spendPrivatePayment(request(), approved);
      setResult(response);
      onComplete(activePayment, response);
      notify({ kind: "success", message: `Sponsored spend accepted and broadcast as ${short(response.txid, 10, 8)}.` });
    }
    catch (error) { notify({ kind: "error", message: message(error) }); } finally { setSubmitting(false); }
  };
  const closeSafely = () => { if (!submitting) close(); };
  return <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeSafely()}>
<section className="spend-drawer" role="dialog" aria-modal="true" aria-labelledby="spend-title" aria-busy={submitting || reviewing}>
<button className="close-button" onClick={closeSafely} disabled={submitting} aria-label={submitting ? "Transaction submission in progress" : "Close"}>
<X />
</button>{result ? <SuccessState asset={asset} amount={formatUnits(BigInt(result.paymentAmount), asset.decimals, asset.decimals)} tx={result.txid} detail={`Token service fee ${formatUnits(BigInt(result.tokenSponsorFee), asset.decimals)} ${asset.symbol}; sponsor paid ${result.networkFeePaid} µSTX`} action={close} compact /> : <>
<span className="eyebrow">Live sponsored spend</span>
<h2 id="spend-title">Move private balance</h2>
<p className="drawer-copy">Choose one spendable address. Its one-time key signs locally, and balances are never combined automatically.</p>{!approved ? <>
<div className="source-account">
<div>
<span className="source-lock">
<LockKeyhole size={18} />
</span>
<div className="source-details">
<small>Spend from one-time address</small>
<span className="source-picker">
<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} disabled={reviewing || payments.length < 2} aria-label="Spend from one-time address">{payments.map((item) => <option value={item.transactionId} key={item.transactionId}>{short(item.stealthPrincipal, 10, 8)} · {formatUnits(item.balance, asset.decimals, asset.decimals)} {asset.symbol}</option>)}</select>
<ChevronDown size={15} />
</span>
</div>
</div>
<span>
<strong>{formatUnits(activePayment.balance, asset.decimals, asset.decimals)}</strong>
<small>{asset.symbol} available · <FiatEstimate amount={activePayment.balance} asset={asset} />
</small>
</span>
</div>{payments.length > 1 && <p className="source-help">This payment uses only the selected address. Choose another balance here when needed.</p>}<div className="segmented spend-actions">
<button className={kind === "send" ? "active" : ""} onClick={() => setKind("send")} disabled={reviewing}>Pay someone</button>
<button className={kind === "withdraw" ? "active" : ""} onClick={() => setKind("withdraw")} disabled={reviewing}>Move all</button>
<button className={kind === "bitcoin" ? "future-action active" : "future-action"} onClick={() => setKind("bitcoin")} disabled={reviewing}>Convert to BTC <small>Coming soon</small>
</button>
</div>{kind === "bitcoin" ? <div className="bitcoin-coming-soon">
<span className="coming-soon-badge">Planned exchange off-ramp</span>
<h3>Convert your private balance to BTC</h3>
<p>Privara plans to integrate the official sBTC withdrawal protocol so this one-time key can authorize a peg-out locally. The resulting BTC will go to the Bitcoin address you choose, including a compatible exchange deposit address.</p>
<div className="info-box">
<Info size={16} />
<p>Privara will facilitate the withdrawal without taking custody of your privacy seed or one-time key. Until this launches, pay someone directly or move the balance to another Stacks address you control.</p>
</div>
</div> : <>
<label className="field-label">Destination address</label>
<div className="address-input compact">
<input value={destination} onChange={(event) => setDestination(event.target.value.trim())} readOnly={reviewing} placeholder="SP… Stacks mainnet address" />
</div>
{longTermDestination && <LongTermWalletWarning confirmed={longTermConfirmed} setConfirmed={setLongTermConfirmed} />}
<small className="destination-help">{kind === "withdraw" ? "Move the full spendable balance to another Stacks address you control. A fresh address can separate wallet operations, but this transfer remains public and may be correlated through its amount, timing, or later activity." : "Pay the intended person or merchant directly from this one-time address when possible. This avoids creating an unnecessary intermediate transfer."}</small>{kind === "send" && <>
<label className="field-label">Amount recipient receives</label>
<div className={`amount-input ${exceedsBalance ? "invalid" : ""}`}>
<input value={amount} onChange={(event) => setAmount(event.target.value)} readOnly={reviewing} aria-invalid={exceedsBalance} />
<span className="amount-asset">
<AssetIcon asset={asset} small /> {asset.symbol}</span>
</div>{usdQuote && asset.id === "sbtc" && <div className="fiat-tools compact">
<div>
<FiatEstimate amount={paymentAmount} asset={asset} />
<span>CoinGecko estimate</span>
</div>
<div className="fiat-presets">{USD_AMOUNT_PRESETS.map((usd) => <button type="button" key={usd} onClick={() => chooseUsdPreset(usd)} disabled={reviewing}>${usd}</button>)}</div>
</div>}<small className={exceedsBalance ? "amount-error" : "amount-limit"}>The exact sponsorship fee and total will be fetched before confirmation.</small>
</>}<div className="warning-box">
<TriangleAlert size={16} />
<p>{kind === "withdraw" ? "Avoid moving funds to your connected long-term wallet when preserving separation matters: that creates a direct onchain link." : "The destination and amount remain public. Choose a destination that matches the privacy context of the payment."}</p>
</div>
<button className="primary-wide" onClick={review} disabled={reviewing || !destination || activePayment.balance <= 0n || (longTermDestination && !longTermConfirmed) || (kind === "send" && (paymentAmount <= 0n || exceedsBalance))}>{reviewing ? <>
<RefreshCw className="spin" size={16} /> Fetching exact sponsor quote…</> : longTermDestination && !longTermConfirmed ? <>Confirm the privacy warning</> : <><ArrowRight size={16} /> Review exact fee</>}</button>
</>}</> : <>
<button className="back-link" onClick={() => setApproved(null)} disabled={submitting}>← Change payment</button>
<div className="review-lines">
<div>
<span>Recipient receives</span>
<strong>{formatUnits(approved.paymentAmount, asset.decimals, asset.decimals)} {asset.symbol} <FiatEstimate amount={approved.paymentAmount} asset={asset} />
</strong>
</div>
<div>
<span>Exact sponsorship fee</span>
<strong>{formatUnits(approved.sponsorFee, asset.decimals, asset.decimals)} {asset.symbol} <FiatEstimate amount={approved.sponsorFee} asset={asset} />
</strong>
</div>
<div>
<span>Fee recipient</span>
<strong>{short(approved.policy.feeRecipient, 9, 7)}</strong>
</div>
<div>
<span>Destination</span>
<strong>{short(approved.destination, 9, 7)}</strong>
</div>
<div className="total">
<span>Total signed outflow</span>
<strong>{formatUnits(approved.totalAmount, asset.decimals, asset.decimals)} {asset.symbol} <FiatEstimate amount={approved.totalAmount} asset={asset} />
</strong>
</div>
</div>
{approved.destination.toUpperCase() === wallet.toUpperCase() && <div className="warning-box long-term-wallet-warning" role="alert"><TriangleAlert size={18} /><p><strong>Direct long-term-wallet link.</strong> Signing this transaction publicly links the one-time address to your connected wallet.</p></div>}
<div className="info-box">
<Info size={16} />
<p>This quote is pinned. Confirming signs exactly this destination, payment amount, fee recipient, and fee. USD values are indicative and are not signed. If relayer policy changed, submission fails and you must review a new quote.</p>
</div>
<button className="primary-wide" onClick={submit} disabled={submitting}>{submitting ? <>
<RefreshCw className="spin" size={16} /> Relayer is validating and broadcasting…</> : <>
<Zap size={16} /> Approve exact fee & sign</>}</button>{submitting && <p className="submission-note">Keep this panel open. A transaction ID and success confirmation will appear here.</p>}</>}</>}</section>
</div>;
}

function ActivityView({ asset, payments }: { asset: Sip010Asset; payments: LivePayment[] }) {
  return <><PageTitle eyebrow="Live on-chain history" title="Detected activity" copy="This list is rebuilt from public router announcements after you unlock and scan; Privara does not upload a private activity database." /><section className="panel activity-page">{payments.length === 0 ? <div className="inline-empty">No scanned activity in this session.</div> : payments.map((payment) => <a className="activity-live-row" href={explorer(payment.transactionId)} target="_blank" rel="noreferrer" key={payment.transactionId}><span className="activity-type"><ArrowDownLeft /></span><div><strong>Private payment detected</strong><small>{payment.stealthPrincipal}</small></div><strong>+{formatUnits(payment.receivedAmount, asset.decimals)} {asset.symbol} <FiatEstimate amount={payment.receivedAmount} asset={asset} /></strong><ExternalLink size={14} /></a>)}</section></>;
}

type DaoPayoutProgress = "queued" | "signing" | "confirming" | "confirmed" | "failed";
type DaoPayoutResult = { status: DaoPayoutProgress; txid?: string; stealthPrincipal?: string; error?: string };
type DaoRegistrationCheck = {
  address: string;
  status: "idle" | "checking" | "registered" | "unregistered" | "error";
};

function newPayout(): DaoPayoutInput {
  return { id: `payout-${Date.now()}-${Math.random()}`, name: "", recipient: "", amount: "" };
}

function Payouts({ asset, config, wallet, deposit, setDeposit, notify, connect, onProcessingChange }: {
  asset: Sip010Asset; config: PublicRelayerConfig | null; wallet: string | null; deposit: bigint;
  setDeposit: (value: bigint) => void; notify: (notice: Notice) => void; connect: () => void;
  onProcessingChange: (processing: boolean) => void;
}) {
  const [payouts, setPayouts] = useState<DaoPayoutInput[]>([newPayout()]);
  const [feeMode, setFeeMode] = useState<FeeMode>("added");
  const [stage, setStage] = useState<"edit" | "validating" | "review" | "processing" | "done">("edit");
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [approved, setApproved] = useState<{ quote: DaoPayoutBatchQuote; config: PublicRelayerConfig; feeMode: FeeMode } | null>(null);
  const [results, setResults] = useState<Record<string, DaoPayoutResult>>({});
  const [registrationChecks, setRegistrationChecks] = useState<Record<string, DaoRegistrationCheck>>({});
  const [fundingTxid, setFundingTxid] = useState("");
  const registrationTimers = useRef<Record<string, number>>({});

  const draft = useMemo(() => {
    try {
      if (!config) throw new Error("Relayer configuration is unavailable");
      return {
        quote: quoteDaoPayoutBatch({
          payouts,
          decimals: asset.decimals,
          feeBps: BigInt(config.settlementFeeBps),
          feeMode,
          maxIntentAmount: config.maxIntentAmount ? BigInt(config.maxIntentAmount) : undefined,
        }),
        error: null,
      };
    } catch (error) { return { quote: null, error: message(error) }; }
  }, [asset.decimals, config, feeMode, payouts]);
  const available = walletBalance === null ? null : walletBalance + deposit;
  const shortfall = draft.quote ? paymentFundingShortfall(draft.quote.totalAmount, deposit) : 0n;
  const batchDeficit = draft.quote && available !== null && draft.quote.totalAmount > available
    ? draft.quote.totalAmount - available
    : 0n;
  const overBudgetPayoutIds = useMemo(() => {
    const ids = new Set<string>();
    if (!draft.quote || available === null) return ids;
    let runningTotal = 0n;
    for (const payout of draft.quote.payouts) {
      runningTotal += payout.totalAmount;
      if (runningTotal > available) ids.add(payout.id);
    }
    return ids;
  }, [available, draft.quote]);
  const addressSignature = payouts.map((payout) => `${payout.id}:${payout.recipient.trim()}`).join("|");
  const everyRecipientRegistered = Boolean(draft.quote && draft.quote.payouts.every((payout) => {
    const check = registrationChecks[payout.id];
    return check?.address === payout.recipient && check.status === "registered";
  }));
  const checkingRecipient = payouts.some((payout) => registrationChecks[payout.id]?.status === "checking");

  const refreshWalletBalance = async (activeConfig = config) => {
    if (!activeConfig || !wallet) { setWalletBalance(null); return null; }
    const balance = await readWalletAssetBalance(activeConfig, wallet);
    setWalletBalance(balance);
    return balance;
  };

  useEffect(() => {
    let current = true;
    if (!config || !wallet) { setWalletBalance(null); return; }
    setWalletBalance(null);
    void readWalletAssetBalance(config, wallet)
      .then((balance) => current && setWalletBalance(balance))
      .catch(() => current && setWalletBalance(null));
    return () => { current = false; };
  }, [config, wallet]);

  useEffect(() => {
    if (!config) return;
    for (const payout of payouts) {
      const address = payout.recipient.trim();
      const existing = registrationChecks[payout.id];
      // Preserve completed checks for untouched rows; only a changed/new address
      // receives a fresh debounce timer and registry lookup.
      if (existing?.address === address && existing.status !== "idle") continue;
      if (!address || address.length < 38) {
        setRegistrationChecks((checks) => ({ ...checks, [payout.id]: { address, status: "idle" } }));
        continue;
      }
      setRegistrationChecks((checks) => ({ ...checks, [payout.id]: { address, status: "checking" } }));
      window.clearTimeout(registrationTimers.current[payout.id]);
      registrationTimers.current[payout.id] = window.setTimeout(() => {
        void resolveRecipient(config, address)
          .then((record) => {
            delete registrationTimers.current[payout.id];
            setRegistrationChecks((checks) => checks[payout.id]?.address === address
              ? { ...checks, [payout.id]: { address, status: record ? "registered" : "unregistered" } }
              : checks);
          })
          .catch(() => {
            delete registrationTimers.current[payout.id];
            setRegistrationChecks((checks) => checks[payout.id]?.address === address
              ? { ...checks, [payout.id]: { address, status: "error" } }
              : checks);
          });
      }, 350);
    }
    // The serialized address list prevents name or amount edits from repeating key lookups.
  }, [addressSignature, config?.registry]);

  useEffect(() => () => {
    Object.values(registrationTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (stage !== "processing") return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [stage]);

  const updatePayout = (id: string, field: "name" | "recipient" | "amount", value: string) => {
    if (field === "recipient") {
      window.clearTimeout(registrationTimers.current[id]);
      delete registrationTimers.current[id];
      setRegistrationChecks((checks) => ({ ...checks, [id]: { address: value.trim(), status: "idle" } }));
    }
    setPayouts((current) => current.map((payout) => payout.id === id
      ? { ...payout, [field]: field === "recipient" ? value.trim() : value }
      : payout));
  };

  const removePayout = (id: string) => {
    window.clearTimeout(registrationTimers.current[id]);
    delete registrationTimers.current[id];
    setRegistrationChecks((checks) => {
      const next = { ...checks };
      delete next[id];
      return next;
    });
    setPayouts((current) => current.filter((payout) => payout.id !== id));
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseDaoPayoutCsv(await file.text());
      if (parsed.length > 25) throw new Error("A batch can contain at most 25 contributors");
      const imported = parsed.map((payout) => ({ ...payout, id: newPayout().id }));
      const onlyBlank = payouts.length === 1 && !payouts[0].name && !payouts[0].recipient && !payouts[0].amount;
      if (!onlyBlank && payouts.length + imported.length > 25) {
        throw new Error("Import would exceed the 25-contributor batch limit");
      }
      setPayouts((current) => onlyBlank ? imported : [...current, ...imported]);
      notify({ kind: "success", message: `${imported.length} contributor payout${imported.length === 1 ? "" : "s"} imported from CSV.` });
    } catch (error) { notify({ kind: "error", message: message(error) }); }
  };

  const review = async () => {
    if (!wallet) return connect();
    if (!config || !draft.quote) return notify({ kind: "error", message: draft.error || "Complete every payout row" });
    setStage("validating");
    try {
      // Resolve the entire list before approval. One unregistered contributor blocks
      // the batch instead of falling back to their public wallet address.
      const registrations = await Promise.all(draft.quote.payouts.map((payout) => resolveRecipient(config, payout.recipient)));
      const missing = draft.quote.payouts.filter((_, index) => !registrations[index]).map((payout) => payout.name);
      if (missing.length) throw new Error(`Not registered for private receiving: ${missing.join(", ")}`);
      const [currentDeposit, currentWalletBalance] = await Promise.all([
        readRouterDeposit(config, wallet),
        readWalletAssetBalance(config, wallet),
      ]);
      setDeposit(currentDeposit);
      setWalletBalance(currentWalletBalance);
      if (draft.quote.totalAmount > currentDeposit + currentWalletBalance) {
        throw new Error(`Batch total exceeds the ${asset.symbol} available across your wallet and Privara balance`);
      }
      // Pin both the exact quote and relayer policy used to display it. Execution never
      // silently refreshes fees after this approval screen.
      setApproved({ quote: draft.quote, config, feeMode });
      setStage("review");
    } catch (error) {
      setStage("edit");
      notify({ kind: "error", message: message(error) });
    }
  };

  const execute = async () => {
    if (!wallet) return connect();
    if (!approved) return;
    setStage("processing");
    onProcessingChange(true);
    setFundingTxid("");
    const initial = Object.fromEntries(approved.quote.payouts.map((payout) => [payout.id, { status: "queued" as const }]));
    setResults(initial);
    try {
      const currentDeposit = await readRouterDeposit(approved.config, wallet);
      const required = paymentFundingShortfall(approved.quote.totalAmount, currentDeposit);
      if (required > 0n) {
        const currentWalletBalance = await refreshWalletBalance(approved.config);
        if (currentWalletBalance === null || currentWalletBalance < required) {
          throw new Error(`Your wallet does not have the ${formatUnits(required, asset.decimals)} ${asset.symbol} required to fund this batch`);
        }
        notify({ kind: "info", message: `Approve one funding transaction for ${formatUnits(required, asset.decimals)} ${asset.symbol}. Individual payout signatures follow.` });
        const fundingTransaction = await depositAsset(approved.config, wallet, required);
        setFundingTxid(fundingTransaction);
        await waitForTransaction(fundingTransaction);
        setDeposit(await readRouterDeposit(approved.config, wallet));
      }

      for (const payout of approved.quote.payouts) {
        setResults((current) => ({ ...current, [payout.id]: { status: "signing" } }));
        notify({ kind: "info", message: `Approve ${payout.name}'s exact payout in your wallet.` });
        let submittedTxid: string | undefined;
        let submittedStealthPrincipal: string | undefined;
        try {
          const result = await submitPrivatePayment({
            config: approved.config,
            walletAddress: wallet,
            recipient: payout.recipient,
            enteredAmount: payout.enteredAmount,
            feeMode: approved.feeMode,
          });
          submittedTxid = result.txid;
          submittedStealthPrincipal = result.stealthPrincipal;
          setResults((current) => ({ ...current, [payout.id]: { status: "confirming", txid: result.txid, stealthPrincipal: result.stealthPrincipal } }));
          await waitForTransaction(result.txid);
          setResults((current) => ({ ...current, [payout.id]: { status: "confirmed", txid: result.txid, stealthPrincipal: result.stealthPrincipal } }));
        } catch (error) {
          setResults((current) => ({ ...current, [payout.id]: { status: "failed", txid: submittedTxid, stealthPrincipal: submittedStealthPrincipal, error: message(error) } }));
          throw new Error(`${payout.name}'s payout needs review: ${message(error)}. Processing stopped to prevent an accidental duplicate.`);
        }
      }
      setDeposit(await readRouterDeposit(approved.config, wallet));
      await refreshWalletBalance(approved.config);
      setStage("done");
      notify({ kind: "success", message: `All ${approved.quote.payouts.length} private contributor payouts confirmed on ${NETWORK}.` });
    } catch (error) {
      setDeposit(await readRouterDeposit(approved.config, wallet).catch(() => deposit));
      setStage("done");
      notify({ kind: "error", message: message(error) });
    } finally {
      onProcessingChange(false);
    }
  };

  const activeQuote = approved?.quote ?? draft.quote;
  const confirmedCount = Object.values(results).filter((result) => result.status === "confirmed").length;
  const batchSucceeded = Boolean(stage === "done" && approved && confirmedCount === approved.quote.payouts.length);
  const resetBatch = () => {
    Object.values(registrationTimers.current).forEach((timer) => window.clearTimeout(timer));
    registrationTimers.current = {};
    setPayouts([newPayout()]);
    setRegistrationChecks({});
    setApproved(null);
    setResults({});
    setFundingTxid("");
    setStage("edit");
  };

  if (batchSucceeded && approved) return <>
    <PageTitle eyebrow="DAO payout complete" title="Every contributor payout is confirmed." copy={`${approved.quote.payouts.length} independently authorized ${asset.symbol} settlements are now confirmed on Stacks ${NETWORK}.`} />
    <section className="panel dao-success">
      <span className="success-mark"><Check /></span>
      <span className="eyebrow">Batch completed</span>
      <h2>{formatUnits(approved.quote.recipientTotal, asset.decimals, asset.decimals)} {asset.symbol} delivered privately.</h2>
      <p>Each registered contributor received their payout at a fresh one-time address. Save these transaction links with your treasury records.</p>
      <div className="dao-success-summary"><div><span>Contributors paid</span><strong>{approved.quote.payouts.length}</strong></div><div><span>Settlement fees</span><strong>{formatUnits(approved.quote.feeTotal, asset.decimals, asset.decimals)} {asset.symbol}</strong></div><div><span>Total authorized</span><strong>{formatUnits(approved.quote.totalAmount, asset.decimals, asset.decimals)} {asset.symbol}</strong></div></div>
      <div className="dao-success-transactions">
        {fundingTxid && <a className="funding-transaction" href={explorer(fundingTxid)} target="_blank" rel="noreferrer"><span><strong>Router funding</strong><small>{short(fundingTxid, 14, 10)}</small></span><ExternalLink size={15} /></a>}
        {approved.quote.payouts.map((payout) => { const result = results[payout.id]; return <a href={explorer(result.txid!)} target="_blank" rel="noreferrer" key={payout.id}><span className="contributor-avatar">{payout.name.slice(0, 1).toUpperCase()}</span><span><strong>{payout.name}</strong><small>{formatUnits(payout.recipientAmount, asset.decimals, asset.decimals)} {asset.symbol} · {short(result.stealthPrincipal!, 8, 6)}</small></span><span className="confirmed-label"><CircleCheck size={13} /> Confirmed</span><ExternalLink size={15} /></a>; })}
      </div>
      <div className="info-box"><Info size={16} /><p>The settlement destinations do not reveal contributors' registered wallets. Amounts, DAO payer activity, and links created by later withdrawals remain observable.</p></div>
      <button className="primary-wide" onClick={resetBatch}>Create another payout batch <ArrowRight size={16} /></button>
    </section>
  </>;

  return <>
    <PageTitle eyebrow="Teams & DAOs" title="Private contributor payouts." copy="Prepare and review several payouts together. Privara funds the total once, then asks for one explicit wallet signature per contributor before settling to fresh one-time addresses." />
    {stage === "edit" || stage === "validating" ? <>
      <section className="dao-metrics">
        <div><span><Users /></span><div><small>Contributors</small><strong>{payouts.length}</strong></div></div>
        <div><span><Wallet /></span><div><small>Available balance</small><strong>{available === null ? "Checking…" : <>{formatUnits(available, asset.decimals, asset.decimals)} {asset.symbol} <FiatEstimate amount={available} asset={asset} /></>}</strong></div></div>
        <div className={batchDeficit > 0n ? "invalid" : ""}><span><Zap /></span><div><small>Estimated total</small><strong>{draft.quote ? <>{formatUnits(draft.quote.totalAmount, asset.decimals, asset.decimals)} {asset.symbol} <FiatEstimate amount={draft.quote.totalAmount} asset={asset} /></> : "Complete the list"}</strong>{batchDeficit > 0n && <em>{formatUnits(batchDeficit, asset.decimals, asset.decimals)} {asset.symbol} over balance</em>}</div></div>
      </section>
      <section className="panel payout-card dao-builder">
        <div className="dao-toolbar"><div><h2>Contributor list</h2><p>Add payouts manually or import a CSV with <code>name,address,amount</code>.</p></div><div><label className="light-button csv-button"><Upload size={14} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { void importCsv(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button className="light-button" onClick={() => setPayouts((current) => current.length < 25 ? [...current, newPayout()] : current)} disabled={payouts.length >= 25}><Plus size={14} /> Add contributor</button></div></div>
        <div className="payout-head"><span>Contributor</span><span>Registered address</span><span>Amount</span><span /></div>
        {payouts.map((payout, index) => { const check = registrationChecks[payout.id]; const checkStatus = check?.address === payout.recipient ? check.status : "idle"; const statusLabel = checkStatus === "checking" ? "Checking P/V registration" : checkStatus === "registered" ? "P/V keys registered" : checkStatus === "unregistered" ? "P/V keys not registered" : checkStatus === "error" ? "Registration check failed" : ""; const overBudget = overBudgetPayoutIds.has(payout.id); return <div className="payout-row payout-editor" key={payout.id}><div><span className="contributor-avatar">{payout.name.trim().slice(0, 1).toUpperCase() || index + 1}</span><input aria-label={`Contributor ${index + 1} name`} placeholder="Contributor name" value={payout.name} onChange={(event) => updatePayout(payout.id, "name", event.target.value)} /></div><div className={`payout-address-field ${checkStatus}`}><input aria-label={`${payout.name || `Contributor ${index + 1}`} address`} className="mono-input" placeholder="ST…" value={payout.recipient} onChange={(event) => updatePayout(payout.id, "recipient", event.target.value)} aria-invalid={checkStatus === "unregistered" || checkStatus === "error"} />{payout.recipient && statusLabel && <span className="payout-address-status" role="status" aria-label={statusLabel} title={statusLabel}>{checkStatus === "checking" ? <RefreshCw className="spin" /> : checkStatus === "registered" ? <CircleCheck /> : <TriangleAlert />}</span>}</div><div className={`payout-amount ${overBudget ? "invalid" : ""}`}><input aria-label={`${payout.name || `Contributor ${index + 1}`} amount`} inputMode="decimal" placeholder="0.00" value={payout.amount} onChange={(event) => updatePayout(payout.id, "amount", event.target.value)} aria-invalid={overBudget} /><span>{asset.symbol}</span></div><button aria-label={`Remove ${payout.name || `contributor ${index + 1}`}`} onClick={() => removePayout(payout.id)} disabled={payouts.length === 1}><Trash2 /></button></div>; })}
        <div className="dao-fee-choice"><span>Settlement fee</span><div className="segmented"><button className={feeMode === "added" ? "active" : ""} onClick={() => setFeeMode("added")}>Add fee on top</button><button className={feeMode === "included" ? "active" : ""} onClick={() => setFeeMode("included")}>Include in amounts</button></div></div>
        {draft.error && <p className="batch-error"><TriangleAlert size={14} /> {draft.error}</p>}
        {batchDeficit > 0n && <p className="batch-balance-error"><TriangleAlert size={14} /> Reduce the highlighted payout amount by at least {formatUnits(batchDeficit, asset.decimals, asset.decimals)} {asset.symbol}.</p>}
        <div className="batch-summary"><div><Info size={15} /><span>{shortfall > 0n ? `One funding approval for ${formatUnits(shortfall, asset.decimals)} ${asset.symbol}, then ${payouts.length} payout signature${payouts.length === 1 ? "" : "s"}.` : `No funding approval needed; ${payouts.length} payout signature${payouts.length === 1 ? "" : "s"} required.`}</span></div><button className="primary-action" onClick={() => void review()} disabled={stage === "validating" || !draft.quote || !everyRecipientRegistered || available === null || Boolean(draft.quote && available !== null && draft.quote.totalAmount > available)}>{stage === "validating" ? <><RefreshCw className="spin" size={15} /> Rechecking registrations…</> : checkingRecipient ? <><RefreshCw className="spin" size={15} /> Checking recipient keys…</> : draft.quote && !everyRecipientRegistered ? <>All recipients need registered P/V keys</> : <>Review batch <ArrowRight size={15} /></>}</button></div>
      </section>
    </> : <section className="panel payout-card dao-review">
      <div className="dao-review-head"><div><span className="eyebrow">{stage === "review" ? "Final approval" : stage === "processing" ? "Processing batch" : "Batch result"}</span><h2>{stage === "done" ? `${confirmedCount} of ${approved?.quote.payouts.length ?? 0} payouts confirmed` : `${approved?.quote.payouts.length ?? 0} independently signed payouts`}</h2></div>{stage === "review" && <button className="back-link" onClick={() => { setApproved(null); setStage("edit"); }}>← Edit contributor list</button>}</div>
      <div className="payout-head"><span>Contributor</span><span>Private route</span><span>Authorized total</span><span /></div>
      {approved?.quote.payouts.map((payout, index) => { const result = results[payout.id]; return <div className="payout-row" key={payout.id}><div><span className="contributor-avatar">{payout.name.slice(0, 1).toUpperCase()}</span><span><strong>{payout.name}</strong><small>{short(payout.recipient, 8, 6)}</small></span></div><div className="payout-route-cell"><span className="private-route"><LockKeyhole size={13} /> Fresh one-time address</span>{result?.txid && <a className="payout-tx" href={explorer(result.txid)} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a>}{result?.error && <small className="payout-failure">{result.error}</small>}</div><span><strong>{formatUnits(payout.recipientAmount, asset.decimals, asset.decimals)} {asset.symbol}</strong><small>+ {formatUnits(payout.settlementFee, asset.decimals)} fee</small></span><span className={`payout-status ${result?.status ?? "queued"}`}>{result?.status === "signing" || result?.status === "confirming" ? <RefreshCw className="spin" /> : result?.status === "confirmed" ? <CircleCheck /> : result?.status === "failed" ? <TriangleAlert /> : index + 1}</span></div>; })}
      <div className="dao-total"><div><span>Contributors receive</span><strong>{activeQuote ? formatUnits(activeQuote.recipientTotal, asset.decimals, asset.decimals) : "—"} {asset.symbol}</strong></div><div><span>Settlement fees</span><strong>{activeQuote ? formatUnits(activeQuote.feeTotal, asset.decimals, asset.decimals) : "—"} {asset.symbol}</strong></div><div><span>Total authorized</span><strong>{activeQuote ? formatUnits(activeQuote.totalAmount, asset.decimals, asset.decimals) : "—"} {asset.symbol}</strong></div></div>
      <div className="warning-box"><TriangleAlert size={16} /><p>Amounts and DAO payer activity remain public. Each contributor receives through a fresh address, but later withdrawals can create new links.</p></div>
      {stage === "review" && <button className="primary-wide" onClick={() => void execute()}><Wallet size={16} /> Start {approved?.quote.payouts.length} individually signed payouts</button>}
      {stage === "processing" && <button className="primary-wide" disabled><RefreshCw className="spin" size={16} /> Keep this page open while payouts confirm</button>}
      {stage === "done" && <button className="primary-wide" onClick={resetBatch}>Create another batch after reviewing failures</button>}
    </section>}
  </>;
}

function PrivaraGuide({ config }: { config: PublicRelayerConfig | null }) {
  const settlementFee = config ? `${config.settlementFeeBps / 100}%` : "the fee shown at review";
  const sip010Policies = SUPPORTED_ASSETS
    .filter((candidate) => candidate.kind === "sip010")
    .map((candidate) => ({ asset: candidate, policy: config && assetContract(candidate) ? configForSip010Asset(config, assetContract(candidate)!) : null }));
  return <>
    <PageTitle eyebrow="Product guide" title="Use Privara safely." copy="A practical guide to wallet connection, private receiving, routed payments, recovery, fees, spending, and the information that remains public." />
    <div className="guide-layout">
      <aside className="panel guide-contents"><span className="eyebrow">On this page</span><a href="#guide-overview">What Privara does</a><a href="#guide-start">Before you begin</a><a href="#guide-receive">Receive privately</a><a href="#guide-send">Send privately</a><a href="#guide-scan">Scan and spend</a><a href="#guide-dao">DAO payouts</a><a href="#guide-fees">Fees and approvals</a><a href="#guide-keys">Keys and recovery</a><a href="#guide-chain">Privacy and visibility</a><a href="#guide-limits">Wallet hygiene</a></aside>
      <article className="panel guide-document">
        <section id="guide-overview"><span className="guide-number">01</span><div><h2>What Privara does</h2><p>Privara lets a sender use a recipient's familiar Stacks address or BNS name while settling the payment to a fresh one-time Stacks address. The sender's asset moves through an asset-specific router, and the settlement transaction publishes an encrypted announcement that only the intended privacy identity can recognize.</p><p>The asset menu shows native STX and every SIP-010 token supported by this app. A token can be selected only when the relayer advertises the exact token and router policy pinned by the app.</p><div className="guide-callout"><LockKeyhole size={18} /><p><strong>The precise privacy benefit.</strong> The recipient's registered long-term wallet is not the onchain settlement destination. Payment amounts, the payer's activity, router interaction, network requests, and links created by later spending remain observable.</p></div></div></section>

        <section id="guide-start"><span className="guide-number">02</span><div><h2>Before you begin</h2><ul><li><strong>Use the correct network.</strong> This deployment operates on Stacks {networkLabel}. {NETWORK === "mainnet" ? "Transactions use real assets and are irreversible." : "Testnet assets have no monetary value."}</li><li><strong>Connect Leather or Xverse.</strong> Privara asks the wallet for your Stacks address and later requests explicit approvals; it never receives the wallet's seed phrase or private key.</li><li><strong>Select the asset you intend to use.</strong> Sending, router balances, scanning, activity, decimals, and fee policy all follow the selected asset.</li></ul></div></section>

        <section id="guide-receive"><span className="guide-number">03</span><div><h2>Set up private receiving</h2><ol><li>Connect the long-term Stacks address people will use to identify you.</li><li>Create a separate Privara privacy identity and protect its encrypted JSON recovery file with a password of at least 12 characters.</li><li>Download the backup, then restore and verify that same file. Privara will not enable registration before this recovery check succeeds.</li><li>Approve one wallet transaction to register only the public spending key P and public viewing key V.</li><li>Share your registered Stacks address or BNS name. Senders do not need your backup, private keys, or a one-time address.</li></ol><p>If public P/V keys are already registered for the connected wallet, Privara requires the matching backup and refuses to silently replace that identity with a different seed.</p><div className="guide-callout warning"><TriangleAlert size={18} /><p><strong>Your wallet cannot recover these funds.</strong> Leather, Xverse, a hardware wallet, and the wallet mnemonic do not contain the independent Privara privacy seed. Keep both the encrypted JSON and its password safe.</p></div></div></section>

        <section id="guide-send"><span className="guide-number">04</span><div><h2>Send privately</h2><ol><li>Select sBTC, USDCx, or native STX. An unavailable asset remains disabled until its exact production policy is served.</li><li>Enter the recipient's registered Stacks address or BNS name. Privara resolves a mainnet BNS name, checks its P/V registration, and shows <strong>Ready to receive</strong> only after that succeeds.</li><li>Enter what the recipient should receive. Choose <strong>Add fee on top</strong> for an exact recipient amount or <strong>Include fee in amount</strong> to deduct the settlement fee from the entered total.</li><li>Privara checks the sum of the wallet balance and the sender's existing router balance. If funding is needed, it requests only the exact shortfall, waits for confirmation, and continues automatically. There is no separate deposit step to manage.</li><li>Review the resolved address, amount, settlement fee, total, unordered nonce, and expiry before signing. If a BNS name resolves differently before submission, the payment is stopped for a fresh review.</li><li>The relayer submits the signed intent. The router transfers the asset to a newly derived one-time address and emits the encrypted announcement atomically.</li></ol><p>The connected wallet authorizes the payment intent, but it does not control the recipient's one-time address.</p></div></section>

        <section id="guide-scan"><span className="guide-number">05</span><div><h2>Scan, discover, and spend</h2><ol><li>Select the asset you want to find, open <strong>Receive &amp; scan</strong>, and unlock the verified privacy backup for this browser session.</li><li>Scan announcements. Public history is downloaded and tested locally with the private viewing key; invalid announcements are skipped without stopping the rest of the scan.</li><li>Switch assets and scan again to discover balances held under another router. Results and the Activity page describe only the currently selected asset and browser session.</li><li>Choose a spendable one-time address. Privara never combines multiple one-time balances automatically.</li></ol><dl><div><dt>SIP-010 spending</dt><dd>For sBTC and USDCx, the one-time key signs locally. The exact token sponsorship fee, fee recipient, destination, and amount are shown and pinned before the relayer pays the STX network fee.</dd></div><div><dt>Native STX spending</dt><dd>The one-time address already owns STX, so it signs and pays its own displayed network fee. No sponsor fee is charged. <strong>Move all</strong> subtracts the estimated network fee automatically.</dd></div><div><dt>Destinations</dt><dd>Pay a Stacks address directly. Native STX spending also accepts a BNS name. Sending to the registered long-term wallet creates a clear onchain link and is deliberately not the default.</dd></div></dl></div></section>

        <section id="guide-dao"><span className="guide-number">06</span><div><h2>DAO and contributor payouts</h2><p>Batch payouts are available for supported SIP-010 assets, currently sBTC and any enabled USDCx policy. Native STX currently uses individual private payments.</p><p>Add contributors manually or import a CSV with <code>name,address,amount</code>. Names are local workflow labels; the address, amount, intent, and resulting transaction are what matter to settlement. Every address is checked independently for registered P/V keys, and editing one row rechecks only that row.</p><p>Privara can request one combined router-funding transaction, followed by one explicit intent signature per contributor. Every payout remains an independent settlement with its own unordered nonce, encrypted announcement, one-time address, fee, and transaction ID. Processing stops after an uncertain failure so the treasury can inspect the chain before retrying.</p></div></section>

        <section id="guide-fees"><span className="guide-number">07</span><div><h2>Fees and wallet approvals</h2><dl><div><dt>Private-payment settlement fee</dt><dd>{settlementFee}. The sender chooses whether this is added on top or included in the entered amount.</dd></div>{sip010Policies.map(({ asset: supportedAsset, policy }) => <div key={supportedAsset.id}><dt>{supportedAsset.symbol} sponsored spending</dt><dd>{policy ? `${formatUnits(BigInt(policy.sponsorFee ?? supportedAsset.sponsorFeeAtomic), supportedAsset.decimals, supportedAsset.decimals)} ${supportedAsset.symbol}` : "Not currently advertised by the connected relayer"}. This separate fee applies when moving a detected one-time token balance.</dd></div>)}<div><dt>Native STX spending</dt><dd>No sponsorship fee. The one-time STX address pays the exact network fee shown before signing.</dd></div></dl><p>The sender pays the network fee for any router-funding transaction. The relayer pays the network fee for the later router settlement and for sponsored SIP-010 spending. A sponsorship quote cannot be silently refreshed after approval: changing its fee, recipient, destination, or amount invalidates the signed request.</p></div></section>

        <section id="guide-keys"><span className="guide-number">08</span><div><h2>Keys and recovery</h2><dl><div><dt>P and V</dt><dd>Public spending and viewing keys registered to the long-term wallet so senders can derive private payment destinations.</dd></div><div><dt>p and v</dt><dd>Private spending and viewing keys derived from the independent privacy seed. They are neither registered nor sent to the relayer.</dd></div><div><dt>Ephemeral public key</dt><dd>A new sender-generated public key published with one encrypted announcement. It helps the intended recipient detect and derive that payment.</dd></div><div><dt>One-time key</dt><dd>A fresh private key derived locally for one settlement address. This is different from the sender's ephemeral key and from the recipient's long-term wallet key.</dd></div></dl><p>The backup password decrypts the identity only for the current browser session. Closing, refreshing, or later returning to the app can require the password again; this limits how long private key material remains unlocked in memory.</p><div className="guide-callout warning"><TriangleAlert size={18} /><p><strong>The encrypted backup is essential.</strong> Losing the backup or its password can permanently remove access to stealth funds. A connected wallet seed cannot reconstruct the Privara privacy identity.</p></div></div></section>

        <section id="guide-chain"><span className="guide-number">09</span><div><h2>Privacy and onchain visibility</h2><p>Onchain observers can see the recipient's public P/V registration, router funding, the payer's Privara interaction, asset and amount, settlement fee, fresh destination, unordered nonce, expiry, ephemeral public key, encrypted announcement, and any later movement from that one-time address.</p><p>The privacy seed, p, v, backup password, decrypted announcement note, and derived one-time private key do not go onchain. The relayer receives signed public transaction data, not those private keys.</p><div className="guide-callout"><Info size={18} /><p><strong>What the claim does and does not mean.</strong> Privara hides the recipient's long-term wallet from the onchain settlement destination. It does not hide amounts, make the payer anonymous, conceal browser/API/network metadata, or prevent correlation created by later withdrawals.</p></div></div></section>

        <section id="guide-limits"><span className="guide-number">10</span><div><h2>Spending, withdrawals, and wallet hygiene</h2><p>Privara creates the one-time address automatically. How you use its balance afterward also matters:</p><ul><li><strong>Pay directly when possible.</strong> A one-time address is already a spendable Stacks account. Paying the intended person or merchant from it avoids an unnecessary intermediate transfer.</li><li><strong>Move to another Stacks address when needed.</strong> A fresh self-custody address can help with wallet access or operational separation, but it is not a privacy reset. The transfer remains visible and may be correlated through timing, amounts, consolidation, or later activity.</li><li><strong>Do not default to your public wallet.</strong> Moving funds to the long-term wallet registered with Privara creates a direct onchain link and is discouraged when separation matters.</li><li><strong>BTC conversion is coming.</strong> Privara plans to integrate the official sBTC withdrawal protocol so a one-time key can authorize conversion to BTC for a chosen Bitcoin destination, including a compatible exchange deposit address. The key will continue to sign locally; Privara will facilitate the request rather than take custody of the funds.</li><li>Until that integration is available, this app accepts only Stacks <code>SP…</code> destinations for spending. Do not enter a Bitcoin <code>bc1…</code> address or send sBTC to an exchange unless it explicitly supports the official token on the Stacks network.</li><li>Treat every one-time address as a separate balance and do not deliberately reuse it for another private payment.</li><li>Avoid combining several one-time balances into one transaction or destination, because consolidation can suggest common ownership.</li><li>Be mindful of distinctive amounts and immediate withdrawals. Changing timing or amounts may reduce simple correlation, but it is not a cryptographic guarantee.</li><li>Keep your encrypted privacy backup separate from your everyday wallet backup and store its password safely. Leather, Xverse, and hardware wallets cannot recover it.</li></ul><div className="guide-callout"><Info size={18} /><p><strong>Planned Bitcoin off-ramp.</strong> Direct sBTC deposits are not broadly supported by centralized exchanges today. The planned flow will use the official sBTC peg-out to deliver BTC to a user-selected Bitcoin address instead.</p></div><p>Privara protects the recipient's long-term wallet from appearing as the settlement destination. Amounts and payer activity remain visible onchain, while RPC providers, relayers, browsers, and network observers may still observe connection metadata.</p><p>This application operates on Stacks {NETWORK}. {NETWORK === "testnet" ? "Testnet assets have no real monetary value, but backups and transaction habits should still be treated carefully." : "Mainnet transactions use real assets and are irreversible; verify every address, amount, and fee before signing."}</p></div></section>

      </article>
    </div>
  </>;
}

function SuccessState({ asset, amount, tx, detail, action, compact = false }: { asset: Sip010Asset; amount: string; tx: string; detail?: string; action: () => void; compact?: boolean }) {
  return <section className={`success-state ${compact ? "compact" : ""}`}><span className="success-mark"><Check /></span><span className="eyebrow">Broadcast accepted</span><h2>{amount} {asset.symbol} is on its way.</h2><p>{detail || `The ${NETWORK} node accepted the transaction. Track it until final confirmation.`}</p><a className="success-tx" href={explorer(tx)} target="_blank" rel="noreferrer"><div><small>Transaction ID</small><strong>{short(tx, 16, 12)}</strong></div><ExternalLink size={16} /></a><button className="primary-wide" onClick={action}>{compact ? "Done" : "View activity"}<ArrowRight size={16} /></button></section>;
}
