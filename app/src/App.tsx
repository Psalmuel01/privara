import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
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
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  quoteSettlementFee,
  type PreparedSponsoredSpend,
  type PrivacyIdentity,
} from "@privara/sdk";
import {
  SUPPORTED_ASSETS,
  formatUnits,
  parseUnits,
  type Sip010Asset,
} from "./config/assets";
import {
  RELAYER_URL,
  STACKS_API_URL,
  connectWallet,
  createPrivacyIdentity,
  depositMock,
  disconnectWallet,
  exportStoredBackup,
  fetchPublicConfig,
  hasPrivacyBackup,
  importPrivacyIdentity,
  mintMock,
  preparePrivateSpend,
  privacyBackupStatus,
  publicKeyLabel,
  readRouterDeposit,
  registerPrivacyIdentity,
  resolveRecipient,
  scanPrivatePayments,
  spendPrivatePayment,
  storedWalletAddress,
  submitPrivatePayment,
  unlockPrivacyIdentity,
  waitForTransaction,
  type LivePayment,
  type PublicRelayerConfig,
} from "./lib/live";
import { PrivacyBackupConflictError } from "./lib/privacy-backup";
import { paymentFundingShortfall } from "./lib/payment-funding";

type View = "overview" | "send" | "receive" | "activity" | "payouts";
type FeeMode = "added" | "included";
type Notice = { kind: "success" | "error" | "info"; message: string } | null;
type SpendResult = { txid: string; paymentAmount: string; tokenSponsorFee: string; networkFeePaid: string };

const short = (value: string, start = 6, end = 5) =>
  `${value.slice(0, start)}…${value.slice(-end)}`;
const explorer = (txid: string) =>
  `https://explorer.hiro.so/txid/0x${txid.replace(/^0x/, "")}?chain=testnet`;

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
  const [view, setView] = useState<View>("overview");
  const [assetId, setAssetId] = useState("mock");
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
  const configErrorNotified = useRef(false);
  const asset = SUPPORTED_ASSETS.find((item) => item.id === assetId)!;

  useEffect(() => {
    const loadConfig = () => void fetchPublicConfig()
      .then((value) => {
        setConfig(value);
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
    if (!config || !walletAddress) return;
    void readRouterDeposit(config, walletAddress).then(setDeposit).catch(() => setDeposit(0n));
  }, [config, walletAddress]);

  const connect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const address = await connectWallet();
      setWalletAddress(address);
      setIdentity(null);
      setPayments([]);
      setNotice({ kind: "success", message: "Wallet connected to Stacks testnet." });
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
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("overview")} aria-label="Privara overview">
          <span className="brand-mark">P</span><span>privara</span>
        </button>
        <div className="demo-chip"><span />Live testnet app</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => setView(id)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="privacy-live">
            <span className={`status-dot ${identity ? "" : "inactive"}`} />
            <div><strong>{identity ? "Privacy keys unlocked" : "Privacy keys locked"}</strong><small>{identity ? "Held in this browser session" : "Unlock from Receive & scan"}</small></div>
          </div>
          {walletAddress && <button className="settings-link" onClick={disconnect}><LogOut size={16} /> Disconnect</button>}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="network-status"><span className="pulse" /> Stacks testnet <span>·</span> {tip ? `Block ${tip.toLocaleString()}` : "Connecting…"}</div>
          <div className="top-actions">
            <div className="asset-select-wrap">
              <button className="asset-select" onClick={() => setAssetMenu(!assetMenu)} aria-expanded={assetMenu}>
                <AssetIcon asset={asset} small /> {asset.symbol}<ChevronDown size={14} />
              </button>
              {assetMenu && <div className="asset-menu">
                <span className="menu-label">SIP-010 assets</span>
                {SUPPORTED_ASSETS.map((item) => (
                  <button key={item.id} disabled={!item.liveTestnet} onClick={() => { setAssetId(item.id); setAssetMenu(false); }}>
                    <AssetIcon asset={item} small />
                    <span><strong>{item.symbol}</strong><small>{item.liveTestnet ? "Live on current router" : "Requires sBTC router deployment"}</small></span>
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

        {view === "overview" && <Overview asset={asset} wallet={walletAddress} identity={identity} deposit={deposit} payments={payments} go={setView} openSpend={(payment) => setSelectedPayment(payment)} connect={connect} />}
        {view === "send" && <SendPrivate asset={asset} config={config} wallet={walletAddress} deposit={deposit} setDeposit={setDeposit} notify={setNotice} connect={connect} onDone={() => setView("activity")} />}
        {view === "receive" && <ReceiveAndScan asset={asset} config={config} wallet={walletAddress} identity={identity} setIdentity={setIdentity} payments={payments} setPayments={setPayments} notify={setNotice} connect={connect} openSpend={setSelectedPayment} />}
        {view === "activity" && <ActivityView asset={asset} payments={payments} />}
        {view === "payouts" && <Payouts asset={asset} goSend={() => setView("send")} />}
      </main>

      {selectedPayment && config && walletAddress && (
        <SponsoredSpend
          asset={asset}
          config={config}
          wallet={walletAddress}
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
        <p className="balance-fiat">Across {payments.filter((payment) => payment.balance > 0n).length} spendable one-time address(es)</p>
        <div className="action-row"><button className="dark-button" onClick={() => go("receive")}><Search size={15} /> Scan blockchain</button>{payments.find((payment) => payment.balance > 0n) && <button className="light-button" onClick={() => openSpend(payments.find((payment) => payment.balance > 0n)!)}><Wallet size={15} /> Spend</button>}</div>
        <div className="privacy-orbit" aria-hidden="true"><i /><i /><i /></div>
      </article>
      <article className="posture-card">
        <div className="posture-top"><span className="eyebrow on-dark">Live readiness</span><ShieldCheck size={23} /></div>
        <div className="score"><strong>{wallet && identity ? "Ready" : "Setup needed"}</strong><span>{wallet && identity ? "3 / 3" : wallet ? "1 / 3" : "0 / 3"}</span></div><div className="meter"><i style={{ width: wallet && identity ? "100%" : wallet ? "34%" : "0%" }} /></div>
        <ul><li><CircleCheck /> {wallet ? `Wallet ${short(wallet)}` : "Connect a testnet wallet"}</li><li><CircleCheck /> {identity ? "Privacy identity unlocked" : "Unlock encrypted privacy backup"}</li><li><CircleCheck /> Router deposit: {formatUnits(deposit, asset.decimals)} {asset.symbol}</li></ul>
      </article>
    </section>
    <section className="proof-strip"><div><span className="proof-icon"><Zap size={17} /></span><div><strong>Connected service</strong><small>{RELAYER_URL}</small></div></div><a href={`${STACKS_API_URL}/v2/info`} target="_blank" rel="noreferrer">Stacks API <ExternalLink size={13} /></a></section>
  </>;
}

function SendPrivate({ asset, config, wallet, deposit, setDeposit, notify, connect, onDone }: {
  asset: Sip010Asset; config: PublicRelayerConfig | null; wallet: string | null; deposit: bigint;
  setDeposit: (value: bigint) => void; notify: (notice: Notice) => void; connect: () => void; onDone: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1");
  const [fundAmount, setFundAmount] = useState("10");
  const [feeMode, setFeeMode] = useState<FeeMode>("added");
  const [stage, setStage] = useState<"edit" | "review" | "signing" | "done">("edit");
  const [route, setRoute] = useState<"idle" | "checking" | "found" | "missing">("idle");
  const [funding, setFunding] = useState<"mint" | "payment" | null>(null);
  const [txid, setTxid] = useState("");
  const [stealthPrincipal, setStealthPrincipal] = useState("");
  const quote = useMemo(() => {
    try { return quoteSettlementFee({ amount: parseUnits(amount, asset.decimals), feeBps: BigInt(config?.settlementFeeBps ?? 100), mode: feeMode }); } catch { return null; }
  }, [amount, asset.decimals, config?.settlementFeeBps, feeMode]);
  const format = (value?: bigint) => value === undefined ? "—" : formatUnits(value, asset.decimals, asset.decimals);
  const shortfall = quote ? paymentFundingShortfall(quote.totalAmount, deposit) : 0n;

  useEffect(() => {
    setRoute("idle");
    if (!config || recipient.length < 20) return;
    const timer = window.setTimeout(() => {
      setRoute("checking");
      void resolveRecipient(config, recipient).then((record) => setRoute(record ? "found" : "missing")).catch(() => setRoute("missing"));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [config, recipient]);

  const mintTestTokens = async () => {
    if (!wallet) return connect();
    if (!config) return notify({ kind: "error", message: "Relayer configuration is unavailable." });
    try {
      setFunding("mint");
      const atomic = parseUnits(fundAmount, asset.decimals);
      const id = await mintMock(config, wallet, atomic);
      notify({ kind: "info", message: `Test MOCK mint broadcast: ${short(id, 10, 8)}. Waiting for confirmation…` });
      await waitForTransaction(id);
      notify({ kind: "success", message: `${formatUnits(atomic, asset.decimals)} MOCK minted to your testnet wallet. You can now fund the payment.` });
    } catch (error) { notify({ kind: "error", message: message(error) }); } finally { setFunding(null); }
  };

  const continueToReview = async () => {
    if (!wallet) return connect();
    if (!config || !quote || route !== "found") return;
    try {
      setFunding("payment");
      // Refresh immediately before funding so concurrent deposits never cause us to
      // request more than the exact shortfall for this payment.
      const currentDeposit = await readRouterDeposit(config, wallet);
      setDeposit(currentDeposit);
      const required = paymentFundingShortfall(quote.totalAmount, currentDeposit);
      if (required > 0n) {
        notify({ kind: "info", message: `Approve funding of ${formatUnits(required, asset.decimals)} ${asset.symbol}. Privara will continue to payment review after confirmation.` });
        const id = await depositMock(config, wallet, required);
        notify({ kind: "info", message: `Payment funding broadcast: ${short(id, 10, 8)}. Waiting for confirmation…` });
        await waitForTransaction(id);
        const fundedDeposit = await readRouterDeposit(config, wallet);
        setDeposit(fundedDeposit);
        if (fundedDeposit < quote.totalAmount) {
          throw new Error("Payment funding confirmed, but the available Privara balance is still insufficient");
        }
        notify({ kind: "success", message: "Payment funded. Review the exact recipient amount and settlement fee next." });
      }
      setStage("review");
    } catch (error) {
      notify({ kind: "error", message: `${message(error)} Testnet users can mint MOCK under Testnet tools if their wallet balance is insufficient.` });
    } finally { setFunding(null); }
  };

  const submit = async () => {
    if (!wallet) return connect();
    if (!config || !quote) return;
    setStage("signing");
    try {
      const result = await submitPrivatePayment({ config, walletAddress: wallet, recipient, enteredAmount: parseUnits(amount, asset.decimals), feeMode });
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
          <label className="field-label">Recipient’s Stacks testnet address</label><div className="address-input"><input value={recipient} onChange={(event) => setRecipient(event.target.value.trim())} placeholder="ST…" disabled={funding !== null} />{route !== "idle" && <span className={`resolved ${route === "missing" ? "missing" : ""}`}>{route === "checking" ? "Checking…" : route === "found" ? <><CircleCheck size={14} /> Ready to receive</> : "Not registered"}</span>}</div>
          <label className="field-label">Amount recipient should receive</label><div className="amount-input"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={funding !== null} /><button><AssetIcon asset={asset} small /> {asset.symbol}</button></div>
          <div className="fee-choice"><button className={feeMode === "added" ? "selected" : ""} onClick={() => setFeeMode("added")} disabled={funding !== null}><span>{feeMode === "added" && <Check size={12} />}</span><div><strong>Add fee on top</strong><small>Recipient receives exactly {amount || "0"} {asset.symbol}</small></div><em>Recommended</em></button><button className={feeMode === "included" ? "selected" : ""} onClick={() => setFeeMode("included")} disabled={funding !== null}><span>{feeMode === "included" && <Check size={12} />}</span><div><strong>Include fee in amount</strong><small>Settlement fee comes out of the entered amount</small></div></button></div>
          {shortfall > 0n && wallet && <div className="funding-note"><Wallet size={16} /><p><strong>One funding approval needed</strong><span>Privara will request exactly {format(shortfall)} {asset.symbol}, wait for confirmation, and continue automatically.</span></p></div>}
          <button className="primary-wide" disabled={!quote || route !== "found" || !config || funding !== null} onClick={continueToReview}>{funding === "payment" ? <><RefreshCw className="spin" size={16} /> Waiting for payment funding…</> : !wallet ? <>Connect wallet <ArrowRight size={16} /></> : shortfall > 0n ? <>Fund {format(shortfall)} {asset.symbol} & continue <ArrowRight size={16} /></> : <>Review payment <ArrowRight size={16} /></>}</button>
        </> : <div className="review-block"><button className="back-link" onClick={() => setStage("edit")}>← Edit payment</button><div className="route-visual"><div><span className="route-avatar">A</span><small>Your funded payment</small></div><ArrowRight /><div className="stealth-destination"><span><LockKeyhole size={20} /></span><small>Derived after signing</small><strong>Fresh P′</strong></div></div><div className="review-lines"><div><span>Recipient receives</span><strong>{format(quote?.recipientAmount)} {asset.symbol}</strong></div><div><span>Privara settlement fee</span><strong>{format(quote?.settlementFee)} {asset.symbol}</strong></div><div className="total"><span>Total authorized</span><strong>{format(quote?.totalAmount)} {asset.symbol}</strong></div></div><div className="info-box"><Info size={16} /><p>Your wallet signs the exact recipient, amount, fee, nonce, and expiry. The relayer then submits the settlement.</p></div><button className="primary-wide" onClick={submit} disabled={stage === "signing"}>{stage === "signing" ? <><RefreshCw className="spin" size={16} /> Waiting for wallet and relayer…</> : <><Wallet size={16} /> Sign and submit</>}</button></div>}
      </section>
      <aside className="summary-card"><span className="eyebrow">Payment details</span><h3>Summary</h3><dl><div><dt>Recipient receives</dt><dd>{format(quote?.recipientAmount)} {asset.symbol}</dd></div><div><dt>Settlement fee</dt><dd>{format(quote?.settlementFee)} {asset.symbol}</dd></div><div><dt>Total</dt><dd>{format(quote?.totalAmount)} {asset.symbol}</dd></div><div><dt>Funding approval</dt><dd>{shortfall > 0n ? `${format(shortfall)} ${asset.symbol}` : "Not needed"}</dd></div></dl><details className="testnet-tools"><summary>Testnet tools & advanced details</summary><p>MOCK minting exists only for this testnet demo. Available Privara balance: <strong>{formatUnits(deposit, asset.decimals)} {asset.symbol}</strong>.</p><div className="testnet-mint"><input aria-label="Test MOCK amount" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} inputMode="decimal" disabled={funding !== null} /><button className="light-button" onClick={mintTestTokens} disabled={funding !== null}>{funding === "mint" ? <RefreshCw className="spin" size={14} /> : null} Mint test MOCK</button></div><dl><div><dt>Relayer</dt><dd>{config ? short(config.relayerAddress, 8, 6) : "Offline"}</dd></div><div><dt>Expiry</dt><dd>≈ 200 blocks</dd></div><div><dt>Nonce</dt><dd>Unordered random</dd></div></dl></details></aside>
    </div>
  </>;
}

function ReceiveAndScan({ asset, config, wallet, identity, setIdentity, payments, setPayments, notify, connect, openSpend }: {
  asset: Sip010Asset; config: PublicRelayerConfig | null; wallet: string | null; identity: PrivacyIdentity | null;
  setIdentity: (identity: PrivacyIdentity | null) => void; payments: LivePayment[]; setPayments: (payments: LivePayment[]) => void;
  notify: (notice: Notice) => void; connect: () => void; openSpend: (payment: LivePayment) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [checked, setChecked] = useState(0);
  const [backupRevision, setBackupRevision] = useState(0);
  const backupExists = wallet ? hasPrivacyBackup(wallet) : false;
  // backupRevision intentionally makes localStorage workflow changes reactive.
  void backupRevision;
  const backupState = wallet ? privacyBackupStatus(wallet) : null;
  const backupVerified = Boolean(backupState?.exported && backupState.verified);

  const privacyAction = async (kind: "create" | "unlock" | "register") => {
    if (!wallet) return connect();
    if (kind === "register" && !config) return notify({ kind: "error", message: "Relayer configuration is unavailable." });
    try {
      setBusy(kind);
      if (kind === "create") {
        const created = await createPrivacyIdentity(wallet, password);
        exportStoredBackup(wallet);
        // Do not keep a newly generated identity active: restoring the downloaded file
        // is the recovery proof required before receiving or registration is enabled.
        created.identity.privacySeed.fill(0);
        created.identity.spendingPrivateKey.fill(0);
        created.identity.viewingPrivateKey.fill(0);
        setBackupRevision((value) => value + 1);
        setPassword("");
        notify({ kind: "success", message: "Encrypted backup downloaded. Import that JSON and enter its password to verify recovery before registration." });
        return;
      }
      let active = identity;
      if (kind === "unlock") active = await unlockPrivacyIdentity(wallet, password);
      if (!active) throw new Error("Create or unlock the privacy identity first");
      setIdentity(active);
      if (kind === "register") {
        if (!config) throw new Error("Relayer configuration is unavailable");
        const result = await registerPrivacyIdentity(config, wallet, active);
        if (result.txid) {
          notify({ kind: "info", message: `Privacy registration broadcast: ${short(result.txid, 10, 8)}. Waiting for confirmation…` });
          await waitForTransaction(result.txid);
        }
        notify({ kind: "success", message: result.alreadyRegistered ? "On-chain P/V registration already matches this backup." : "Privacy P/V registration confirmed on testnet." });
      } else notify({ kind: "success", message: "Verified privacy identity unlocked for this browser session." });
      setPassword("");
    } catch (error) { notify({ kind: "error", message: message(error) }); } finally { setBusy(null); }
  };

  const importBackup = async (file: File | undefined) => {
    if (!file || !wallet) return;
    // Backups are encrypted with this password, so validate it before reading the file.
    if (password.length < 12) {
      notify({ kind: "error", message: "Enter the backup password first (minimum 12 characters), then choose the JSON backup." });
      return;
    }
    const encoded = await file.text();
    try {
      setBusy("import");
      let active: PrivacyIdentity;
      try {
        active = await importPrivacyIdentity(wallet, encoded, password);
      } catch (error) {
        if (!(error instanceof PrivacyBackupConflictError)) throw error;
        const replace = window.confirm(
          "This JSON belongs to a different Privara privacy identity. Replace the encrypted backup stored for this wallet? The current file will be downloaded first."
        );
        if (!replace) throw new Error("Import cancelled; the existing privacy identity was preserved");
        exportStoredBackup(wallet);
        active = await importPrivacyIdentity(wallet, encoded, password, true);
      }
      setIdentity(active);
      setBackupRevision((value) => value + 1);
      notify({ kind: "success", message: "Backup restored and verified. Private receiving and P/V registration are now enabled." });
      setPassword("");
    }
    catch (error) { notify({ kind: "error", message: message(error) }); } finally { setBusy(null); }
  };

  const scan = async () => {
    if (!identity || !backupVerified || !config) return notify({ kind: "error", message: "Restore-verify your privacy backup and connect the relayer first." });
    try { setBusy("scan"); const result = await scanPrivatePayments(config, identity); setChecked(result.checked); setPayments(result.payments); notify({ kind: "success", message: `Scanned ${result.checked} announcement(s); detected ${result.payments.length} payment(s).` }); }
    catch (error) { notify({ kind: "error", message: message(error) }); } finally { setBusy(null); }
  };

  return <>
    <PageTitle eyebrow="Receive & discover" title="Find payments to your one-time addresses." copy="Privara hides your long-term wallet from the on-chain settlement destination. Amounts, payer activity, network requests, and later withdrawal links are not hidden." action={<button className="primary-action" onClick={scan} disabled={busy !== null || !identity || !backupVerified}>{busy === "scan" ? <RefreshCw className="spin" size={16} /> : <Search size={16} />} Scan announcements</button>} />
    {!wallet ? <section className="panel empty-state"><Wallet size={28} /><h2>Connect a testnet wallet</h2><p>Your privacy backup is stored separately for each wallet address.</p><button className="primary-action" onClick={connect}>Connect Leather or Xverse</button></section> : <section className="setup-grid">
      <article className="panel setup-card"><div className="section-head"><div><span className="eyebrow">Independent privacy identity</span><h2>{identity && backupVerified ? "Verified and unlocked" : backupVerified ? "Verified and locked" : backupExists ? "Backup verification required" : "Not created on this device"}</h2></div><span className={`ready-badge ${identity && backupVerified ? "" : "locked"}`}>{identity && backupVerified ? <CircleCheck size={14} /> : <LockKeyhole size={14} />}{identity && backupVerified ? "Ready" : "Locked"}</span></div>
        <div className="warning-box"><TriangleAlert size={16} /><p>Stealth funds are controlled by your independent Privara privacy seed—not by Leather, Xverse, or a connected hardware wallet. Those wallets cannot recover these funds. Keep the encrypted JSON and its password safe.</p></div>
        {!identity && <><label className="field-label">Backup password (minimum 12 characters)</label><div className="address-input compact"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Never sent to Privara" /></div><small className="field-help">{backupExists && !backupVerified ? "Download the stored backup, then import that JSON to prove it can be restored." : "The password encrypts your independent Privara privacy seed locally."}</small><div className="privacy-actions">{!backupExists ? <button className="dark-button" onClick={() => privacyAction("create")} disabled={password.length < 12 || busy !== null}>Create & download backup</button> : backupVerified ? <button className="dark-button" onClick={() => privacyAction("unlock")} disabled={password.length < 12 || busy !== null}>Unlock verified backup</button> : <button className="light-button" onClick={() => { exportStoredBackup(wallet); setBackupRevision((value) => value + 1); notify({ kind: "success", message: "Encrypted backup downloaded. Import this JSON next to verify recovery." }); }} disabled={busy !== null}><FileKey size={15} /> Download stored backup</button>}<label className="light-button file-button"><FileKey size={15} /> {backupExists && !backupVerified ? "Verify downloaded JSON" : "Import backup"}<input type="file" accept="application/json" onChange={(event) => { void importBackup(event.target.files?.[0]); event.target.value = ""; }} disabled={busy !== null} /></label></div></>}
        {identity && <><div className="key-list"><div><span>Spending public key · P</span><code>{short(publicKeyLabel(identity, "spending"), 12, 10)}</code><button onClick={() => void copyText(publicKeyLabel(identity, "spending"), notify, "Spending public key")} aria-label="Copy spending public key"><Copy size={13} /></button></div><div><span>Viewing public key · V</span><code>{short(publicKeyLabel(identity, "viewing"), 12, 10)}</code><button onClick={() => void copyText(publicKeyLabel(identity, "viewing"), notify, "Viewing public key")} aria-label="Copy viewing public key"><Copy size={13} /></button></div></div><div className="privacy-actions"><button className="dark-button" onClick={() => privacyAction("register")} disabled={busy !== null || !backupVerified}><KeyRound size={15} /> Verify/register on-chain</button><button className="light-button" onClick={() => { exportStoredBackup(wallet); setBackupRevision((value) => value + 1); notify({ kind: "success", message: "Encrypted privacy backup downloaded." }); }}><FileKey size={15} /> Download encrypted backup</button></div></>}
      </article>
      <article className="panel scan-card"><div className="scan-radar"><Radio size={28} /><i /><i /></div><span className="eyebrow">Local scanner</span><h2>{payments.length ? `${payments.length} payment(s) detected` : "Your keys, your inbox"}</h2><p>Public announcements are downloaded from the Stacks API. Matching and one-time spending-key derivation happen inside this browser.</p><div className="scan-stat"><div><strong>{checked}</strong><small>Announcements checked</small></div><div><strong>{payments.length}</strong><small>Payments detected</small></div></div></article>
    </section>}
    <section className="panel payment-list"><div className="section-head"><div><span className="eyebrow">Detected balances</span><h2>One-time addresses</h2></div><span className="muted-label">{payments.filter((payment) => payment.balance > 0n).length} spendable</span></div>{payments.length === 0 ? <div className="inline-empty">Unlock and scan to load live balances.</div> : payments.map((payment) => <div className="private-payment" key={payment.transactionId}><span className="payment-symbol"><ArrowDownLeft /></span><div><strong>{formatUnits(payment.balance, asset.decimals, asset.decimals)} {asset.symbol}</strong><small>{short(payment.stealthPrincipal, 10, 8)} · {short(payment.transactionId, 10, 8)}</small></div><span className="zero-stx">0 STX</span><button onClick={() => openSpend(payment)} disabled={payment.balance === 0n}>Spend <ArrowUpRight size={14} /></button></div>)}</section>
  </>;
}

function SponsoredSpend({ asset, config, wallet, payment, payments, close, notify, onComplete }: {
  asset: Sip010Asset; config: PublicRelayerConfig; wallet: string; payment: LivePayment; payments: LivePayment[];
  close: () => void; notify: (notice: Notice) => void; onComplete: (source: LivePayment, result: SpendResult) => void;
}) {
  const [kind, setKind] = useState<"send" | "withdraw">("send");
  const [sourceId, setSourceId] = useState(payment.transactionId);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [approved, setApproved] = useState<PreparedSponsoredSpend | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SpendResult | null>(null);
  const activePayment = payments.find((item) => item.transactionId === sourceId) ?? payment;
  const paymentAmount = (() => { try { return parseUnits(amount, asset.decimals); } catch { return 0n; } })();
  const exceedsBalance = kind === "send" && paymentAmount > activePayment.balance;
  const request = () => ({ config, payment: activePayment, destination: kind === "withdraw" ? wallet : destination, fullBalance: kind === "withdraw", amount: kind === "send" ? paymentAmount : undefined });
  const review = async () => {
    try {
      setReviewing(true);
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
  return <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeSafely()}><section className="spend-drawer" role="dialog" aria-modal="true" aria-labelledby="spend-title" aria-busy={submitting || reviewing}><button className="close-button" onClick={closeSafely} disabled={submitting} aria-label={submitting ? "Transaction submission in progress" : "Close"}><X /></button>{result ? <SuccessState asset={asset} amount={formatUnits(BigInt(result.paymentAmount), asset.decimals, asset.decimals)} tx={result.txid} detail={`Token service fee ${formatUnits(BigInt(result.tokenSponsorFee), asset.decimals)} ${asset.symbol}; sponsor paid ${result.networkFeePaid} µSTX`} action={close} compact /> : <><span className="eyebrow">Live sponsored spend</span><h2 id="spend-title">Move private balance</h2><p className="drawer-copy">Choose one spendable address. Its one-time key signs locally, and balances are never combined automatically.</p>{!approved ? <><div className="source-account"><div><span className="source-lock"><LockKeyhole size={18} /></span><div className="source-details"><small>Spend from one-time address</small><span className="source-picker"><select value={sourceId} onChange={(event) => setSourceId(event.target.value)} disabled={reviewing || payments.length < 2} aria-label="Spend from one-time address">{payments.map((item) => <option value={item.transactionId} key={item.transactionId}>{short(item.stealthPrincipal, 10, 8)} · {formatUnits(item.balance, asset.decimals, asset.decimals)} {asset.symbol}</option>)}</select><ChevronDown size={15} /></span></div></div><span><strong>{formatUnits(activePayment.balance, asset.decimals, asset.decimals)}</strong><small>{asset.symbol} available</small></span></div>{payments.length > 1 && <p className="source-help">This payment uses only the selected address. Choose another balance here when needed.</p>}<div className="segmented"><button className={kind === "send" ? "active" : ""} onClick={() => setKind("send")} disabled={reviewing}>Pay someone</button><button className={kind === "withdraw" ? "active" : ""} onClick={() => setKind("withdraw")} disabled={reviewing}>Withdraw all</button></div><label className="field-label">Destination</label><div className="address-input compact"><input value={kind === "withdraw" ? wallet : destination} onChange={(event) => setDestination(event.target.value.trim())} readOnly={kind === "withdraw" || reviewing} placeholder="ST…" /></div>{kind === "send" && <><label className="field-label">Amount recipient receives</label><div className={`amount-input ${exceedsBalance ? "invalid" : ""}`}><input value={amount} onChange={(event) => setAmount(event.target.value)} readOnly={reviewing} aria-invalid={exceedsBalance} /><button><AssetIcon asset={asset} small /> {asset.symbol}</button></div><small className={exceedsBalance ? "amount-error" : "amount-limit"}>The exact sponsorship fee and total will be fetched before confirmation.</small></>}<div className="warning-box"><TriangleAlert size={16} /><p>Sending from a one-time address reveals the destination and amount. Withdrawing to your normal wallet creates an observable link.</p></div><button className="primary-wide" onClick={review} disabled={reviewing || activePayment.balance <= 0n || (kind === "send" && (!destination || paymentAmount <= 0n || exceedsBalance))}>{reviewing ? <><RefreshCw className="spin" size={16} /> Fetching exact sponsor quote…</> : <><ArrowRight size={16} /> Review exact fee</>}</button></> : <><button className="back-link" onClick={() => setApproved(null)} disabled={submitting}>← Change payment</button><div className="review-lines"><div><span>Recipient receives</span><strong>{formatUnits(approved.paymentAmount, asset.decimals, asset.decimals)} {asset.symbol}</strong></div><div><span>Exact sponsorship fee</span><strong>{formatUnits(approved.sponsorFee, asset.decimals, asset.decimals)} {asset.symbol}</strong></div><div><span>Fee recipient</span><strong>{short(approved.policy.feeRecipient, 9, 7)}</strong></div><div><span>Destination</span><strong>{short(approved.destination, 9, 7)}</strong></div><div className="total"><span>Total signed outflow</span><strong>{formatUnits(approved.totalAmount, asset.decimals, asset.decimals)} {asset.symbol}</strong></div></div><div className="info-box"><Info size={16} /><p>This quote is pinned. Confirming signs exactly this destination, payment amount, fee recipient, and fee. If relayer policy changed, submission fails and you must review a new quote.</p></div><button className="primary-wide" onClick={submit} disabled={submitting}>{submitting ? <><RefreshCw className="spin" size={16} /> Relayer is validating and broadcasting…</> : <><Zap size={16} /> Approve exact fee & sign</>}</button>{submitting && <p className="submission-note">Keep this panel open. A transaction ID and success confirmation will appear here.</p>}</>}</> }</section></div>;
}

function ActivityView({ asset, payments }: { asset: Sip010Asset; payments: LivePayment[] }) {
  return <><PageTitle eyebrow="Live on-chain history" title="Detected activity" copy="This list is rebuilt from public router announcements after you unlock and scan; Privara does not upload a private activity database." /><section className="panel activity-page">{payments.length === 0 ? <div className="inline-empty">No scanned activity in this session.</div> : payments.map((payment) => <a className="activity-live-row" href={explorer(payment.transactionId)} target="_blank" rel="noreferrer" key={payment.transactionId}><span className="activity-type"><ArrowDownLeft /></span><div><strong>Private payment detected</strong><small>{payment.stealthPrincipal}</small></div><strong>+{formatUnits(payment.receivedAmount, asset.decimals)} {asset.symbol}</strong><ExternalLink size={14} /></a>)}</section></>;
}

function Payouts({ asset, goSend }: { asset: Sip010Asset; goSend: () => void }) {
  return <><PageTitle eyebrow="Teams & DAOs" title="One-time-address contributor payouts." copy="The live base version executes one independently authorized intent at a time. It does not hide amounts or payer activity." /><section className="panel empty-state"><Users size={30} /><h2>Single live flow first</h2><p>Use Send privately for each registered contributor. This avoids presenting a simulated batch as a completed on-chain feature.</p><button className="primary-action" onClick={goSend}>Send a live {asset.symbol} payment <ArrowRight size={15} /></button></section></>;
}

function SuccessState({ asset, amount, tx, detail, action, compact = false }: { asset: Sip010Asset; amount: string; tx: string; detail?: string; action: () => void; compact?: boolean }) {
  return <section className={`success-state ${compact ? "compact" : ""}`}><span className="success-mark"><Check /></span><span className="eyebrow">Broadcast accepted</span><h2>{amount} {asset.symbol} is on its way.</h2><p>{detail || "The testnet node accepted the transaction. Track it until final confirmation."}</p><a className="success-tx" href={explorer(tx)} target="_blank" rel="noreferrer"><div><small>Transaction ID</small><strong>{short(tx, 16, 12)}</strong></div><ExternalLink size={16} /></a><button className="primary-wide" onClick={action}>{compact ? "Done" : "View activity"}<ArrowRight size={16} /></button></section>;
}
