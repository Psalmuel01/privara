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
import { quoteSettlementFee, type PrivacyIdentity } from "@privara/sdk";
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
          close={() => setSelectedPayment(null)}
          notify={setNotice}
          onComplete={(result) => {
            const spent = BigInt(result.paymentAmount) + BigInt(result.tokenSponsorFee);
            setPayments((current) => current.map((item) => item.transactionId === selectedPayment.transactionId
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
    <PageTitle eyebrow="Private workspace" title="Your money, quietly received." copy="The figures below come from the live testnet router and the one-time addresses detected by your unlocked privacy identity." action={<button className="primary-action" onClick={() => wallet ? go("send") : connect()}><Send size={16} /> {wallet ? "New private payment" : "Connect wallet"}</button>} />
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
  const [funding, setFunding] = useState<"mint" | "deposit" | null>(null);
  const [txid, setTxid] = useState("");
  const [stealthPrincipal, setStealthPrincipal] = useState("");
  const quote = useMemo(() => {
    try { return quoteSettlementFee({ amount: parseUnits(amount, asset.decimals), feeBps: BigInt(config?.settlementFeeBps ?? 100), mode: feeMode }); } catch { return null; }
  }, [amount, asset.decimals, config?.settlementFeeBps, feeMode]);
  const format = (value?: bigint) => value === undefined ? "—" : formatUnits(value, asset.decimals, asset.decimals);

  useEffect(() => {
    setRoute("idle");
    if (!config || recipient.length < 20) return;
    const timer = window.setTimeout(() => {
      setRoute("checking");
      void resolveRecipient(config, recipient).then((record) => setRoute(record ? "found" : "missing")).catch(() => setRoute("missing"));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [config, recipient]);

  const fund = async (kind: "mint" | "deposit") => {
    if (!wallet) return connect();
    if (!config) return notify({ kind: "error", message: "Relayer configuration is unavailable." });
    try {
      setFunding(kind);
      const atomic = parseUnits(fundAmount, asset.decimals);
      const id = kind === "mint" ? await mintMock(config, wallet, atomic) : await depositMock(config, wallet, atomic);
      notify({ kind: "info", message: `${kind === "mint" ? "Mint" : "Deposit"} broadcast: ${short(id, 10, 8)}. Waiting for confirmation…` });
      await waitForTransaction(id);
      if (kind === "deposit") setDeposit(await readRouterDeposit(config, wallet));
      notify({ kind: "success", message: `${kind === "mint" ? "Mint" : "Deposit"} confirmed on testnet.` });
    } catch (error) { notify({ kind: "error", message: message(error) }); } finally { setFunding(null); }
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
    <PageTitle eyebrow="Live private payment" title="Send without exposing who receives." copy="Fund your router deposit, enter a registered recipient, then sign the exact SIP-018 intent in Leather or Xverse." />
    <section className="funding-strip panel">
      <div><span className="eyebrow">Router deposit</span><strong>{formatUnits(deposit, asset.decimals)} {asset.symbol}</strong><small>Both faucet mint and deposit are separate on-chain transactions.</small></div>
      <div className="funding-actions"><div className="funding-controls"><input aria-label="Funding amount" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} inputMode="decimal" /><button className="light-button" onClick={() => fund("mint")} disabled={funding !== null}>{funding === "mint" ? <RefreshCw className="spin" size={14} /> : null} 1. Mint to wallet</button><button className="dark-button" onClick={() => fund("deposit")} disabled={funding !== null}>{funding === "deposit" ? <RefreshCw className="spin" size={14} /> : null} 2. Deposit to router</button></div><small>The amount applies to either action. Each requires a separate wallet approval.</small></div>
    </section>
    <div className="flow-layout">
      <section className="flow-card">
        {stage === "edit" ? <>
          <label className="field-label">Recipient’s Stacks testnet address</label><div className="address-input"><input value={recipient} onChange={(event) => setRecipient(event.target.value.trim())} placeholder="ST…" />{route !== "idle" && <span className={`resolved ${route === "missing" ? "missing" : ""}`}>{route === "checking" ? "Checking…" : route === "found" ? <><CircleCheck size={14} /> P/V found</> : "Not registered"}</span>}</div>
          <label className="field-label">Amount recipient should receive</label><div className="amount-input"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /><button><AssetIcon asset={asset} small /> {asset.symbol}</button></div>
          <div className="fee-choice"><button className={feeMode === "added" ? "selected" : ""} onClick={() => setFeeMode("added")}><span>{feeMode === "added" && <Check size={12} />}</span><div><strong>Add fee on top</strong><small>Recipient receives exactly {amount || "0"} {asset.symbol}</small></div><em>Recommended</em></button><button className={feeMode === "included" ? "selected" : ""} onClick={() => setFeeMode("included")}><span>{feeMode === "included" && <Check size={12} />}</span><div><strong>Include fee in amount</strong><small>Settlement fee comes out of the entered amount</small></div></button></div>
          <button className="primary-wide" disabled={!quote || route !== "found" || !wallet || !config || deposit < quote.totalAmount} onClick={() => setStage("review")}>{!wallet ? "Connect wallet first" : deposit < (quote?.totalAmount ?? 0n) ? "Deposit more MOCK" : "Review private payment"} <ArrowRight size={16} /></button>
        </> : <div className="review-block"><button className="back-link" onClick={() => setStage("edit")}>← Edit payment</button><div className="route-visual"><div><span className="route-avatar">A</span><small>Your router deposit</small></div><ArrowRight /><div className="stealth-destination"><span><LockKeyhole size={20} /></span><small>Derived after signing</small><strong>Fresh P′</strong></div></div><div className="review-lines"><div><span>Recipient receives</span><strong>{format(quote?.recipientAmount)} {asset.symbol}</strong></div><div><span>Privara settlement fee</span><strong>{format(quote?.settlementFee)} {asset.symbol}</strong></div><div className="total"><span>Total authorized</span><strong>{format(quote?.totalAmount)} {asset.symbol}</strong></div></div><div className="info-box"><Info size={16} /><p>Your wallet signs a SIP-018 message, not a token transfer. The relayer verifies that signature and submits the bound settlement.</p></div><button className="primary-wide" onClick={submit} disabled={stage === "signing"}>{stage === "signing" ? <><RefreshCw className="spin" size={16} /> Waiting for wallet and relayer…</> : <><Wallet size={16} /> Sign and submit</>}</button></div>}
      </section>
      <aside className="summary-card"><span className="eyebrow">Live policy</span><h3>Payment summary</h3><dl><div><dt>Relayer</dt><dd>{config ? short(config.relayerAddress, 8, 6) : "Offline"}</dd></div><div><dt>Settlement fee</dt><dd>{format(quote?.settlementFee)} {asset.symbol}</dd></div><div><dt>Fee handling</dt><dd>{feeMode === "added" ? "Added" : "Included"}</dd></div><div><dt>Expiry</dt><dd>≈ 200 blocks</dd></div><div><dt>Nonce</dt><dd>Unordered random</dd></div></dl></aside>
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
  const backupExists = wallet ? hasPrivacyBackup(wallet) : false;

  const privacyAction = async (kind: "create" | "unlock" | "register") => {
    if (!wallet) return connect();
    if (!config) return notify({ kind: "error", message: "Relayer configuration is unavailable." });
    try {
      setBusy(kind);
      let active = identity;
      if (kind === "create") active = (await createPrivacyIdentity(wallet, password)).identity;
      if (kind === "unlock") active = await unlockPrivacyIdentity(wallet, password);
      if (!active) throw new Error("Create or unlock the privacy identity first");
      setIdentity(active);
      if (kind === "register" || kind === "create") {
        const result = await registerPrivacyIdentity(config, wallet, active);
        if (result.txid) {
          notify({ kind: "info", message: `Privacy registration broadcast: ${short(result.txid, 10, 8)}. Waiting for confirmation…` });
          await waitForTransaction(result.txid);
        }
        notify({ kind: "success", message: result.alreadyRegistered ? "On-chain P/V registration already matches this backup." : "Privacy P/V registration confirmed on testnet." });
      } else notify({ kind: "success", message: "Encrypted privacy identity unlocked for this browser session." });
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
    try { setBusy("import"); const active = await importPrivacyIdentity(wallet, await file.text(), password); setIdentity(active); notify({ kind: "success", message: "Encrypted backup imported and unlocked. Verify its on-chain registration next." }); setPassword(""); }
    catch (error) { notify({ kind: "error", message: message(error) }); } finally { setBusy(null); }
  };

  const scan = async () => {
    if (!identity || !config) return notify({ kind: "error", message: "Unlock your privacy identity and connect the relayer first." });
    try { setBusy("scan"); const result = await scanPrivatePayments(config, identity); setChecked(result.checked); setPayments(result.payments); notify({ kind: "success", message: `Scanned ${result.checked} announcement(s); detected ${result.payments.length} payment(s).` }); }
    catch (error) { notify({ kind: "error", message: message(error) }); } finally { setBusy(null); }
  };

  return <>
    <PageTitle eyebrow="Receive & discover" title="One public identity. Private arrivals." copy="The encrypted backup stays on this device. Unlocking happens locally; only P and V are registered on-chain." action={<button className="primary-action" onClick={scan} disabled={busy !== null || !identity}>{busy === "scan" ? <RefreshCw className="spin" size={16} /> : <Search size={16} />} Scan announcements</button>} />
    {!wallet ? <section className="panel empty-state"><Wallet size={28} /><h2>Connect a testnet wallet</h2><p>Your privacy backup is stored separately for each wallet address.</p><button className="primary-action" onClick={connect}>Connect Leather or Xverse</button></section> : <section className="setup-grid">
      <article className="panel setup-card"><div className="section-head"><div><span className="eyebrow">Privacy identity</span><h2>{identity ? "Unlocked locally" : backupExists ? "Encrypted and locked" : "Not created on this device"}</h2></div><span className={`ready-badge ${identity ? "" : "locked"}`}>{identity ? <CircleCheck size={14} /> : <LockKeyhole size={14} />}{identity ? "Ready" : "Locked"}</span></div>
        {!identity && <><label className="field-label">Backup password (minimum 12 characters)</label><div className="address-input compact"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Never sent to Privara" /></div><small className="field-help">Enter the password used to create this backup, then choose its JSON file.</small><div className="privacy-actions">{backupExists ? <button className="dark-button" onClick={() => privacyAction("unlock")} disabled={password.length < 12 || busy !== null}>Unlock backup</button> : <button className="dark-button" onClick={() => privacyAction("create")} disabled={password.length < 12 || busy !== null}>Create and register P/V</button>}<label className="light-button file-button"><FileKey size={15} /> Import backup<input type="file" accept="application/json" onChange={(event) => { void importBackup(event.target.files?.[0]); event.target.value = ""; }} disabled={busy !== null} /></label></div></>}
        {identity && <><div className="key-list"><div><span>Spending public key · P</span><code>{short(publicKeyLabel(identity, "spending"), 12, 10)}</code><button onClick={() => void copyText(publicKeyLabel(identity, "spending"), notify, "Spending public key")} aria-label="Copy spending public key"><Copy size={13} /></button></div><div><span>Viewing public key · V</span><code>{short(publicKeyLabel(identity, "viewing"), 12, 10)}</code><button onClick={() => void copyText(publicKeyLabel(identity, "viewing"), notify, "Viewing public key")} aria-label="Copy viewing public key"><Copy size={13} /></button></div></div><div className="privacy-actions"><button className="dark-button" onClick={() => privacyAction("register")} disabled={busy !== null}><KeyRound size={15} /> Verify/register on-chain</button><button className="light-button" onClick={() => { exportStoredBackup(wallet); notify({ kind: "success", message: "Encrypted privacy backup downloaded." }); }}><FileKey size={15} /> Download encrypted backup</button></div></>}
      </article>
      <article className="panel scan-card"><div className="scan-radar"><Radio size={28} /><i /><i /></div><span className="eyebrow">Local scanner</span><h2>{payments.length ? `${payments.length} payment(s) detected` : "Your keys, your inbox"}</h2><p>Public announcements are downloaded from the Stacks API. Matching and one-time spending-key derivation happen inside this browser.</p><div className="scan-stat"><div><strong>{checked}</strong><small>Announcements checked</small></div><div><strong>{payments.length}</strong><small>Payments detected</small></div></div></article>
    </section>}
    <section className="panel payment-list"><div className="section-head"><div><span className="eyebrow">Detected balances</span><h2>One-time addresses</h2></div><span className="muted-label">{payments.filter((payment) => payment.balance > 0n).length} spendable</span></div>{payments.length === 0 ? <div className="inline-empty">Unlock and scan to load live balances.</div> : payments.map((payment) => <div className="private-payment" key={payment.transactionId}><span className="payment-symbol"><ArrowDownLeft /></span><div><strong>{formatUnits(payment.balance, asset.decimals, asset.decimals)} {asset.symbol}</strong><small>{short(payment.stealthPrincipal, 10, 8)} · {short(payment.transactionId, 10, 8)}</small></div><span className="zero-stx">0 STX</span><button onClick={() => openSpend(payment)} disabled={payment.balance === 0n}>Spend <ArrowUpRight size={14} /></button></div>)}</section>
  </>;
}

function SponsoredSpend({ asset, config, wallet, payment, close, notify, onComplete }: {
  asset: Sip010Asset; config: PublicRelayerConfig; wallet: string; payment: LivePayment; close: () => void; notify: (notice: Notice) => void;
  onComplete: (result: SpendResult) => void;
}) {
  const [kind, setKind] = useState<"send" | "withdraw">("send");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SpendResult | null>(null);
  const paymentAmount = (() => { try { return parseUnits(amount, asset.decimals); } catch { return 0n; } })();
  const submit = async () => {
    try {
      setSubmitting(true);
      notify({ kind: "info", message: "One-time signature created locally. The relayer is validating and sponsoring the transaction…" });
      const response = await spendPrivatePayment({ config, payment, destination: kind === "withdraw" ? wallet : destination, fullBalance: kind === "withdraw", amount: kind === "send" ? paymentAmount : undefined });
      setResult(response);
      onComplete(response);
      notify({ kind: "success", message: `Sponsored spend accepted and broadcast as ${short(response.txid, 10, 8)}.` });
    }
    catch (error) { notify({ kind: "error", message: message(error) }); } finally { setSubmitting(false); }
  };
  const closeSafely = () => { if (!submitting) close(); };
  return <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeSafely()}><section className="spend-drawer" role="dialog" aria-modal="true" aria-labelledby="spend-title" aria-busy={submitting}><button className="close-button" onClick={closeSafely} disabled={submitting} aria-label={submitting ? "Transaction submission in progress" : "Close"}><X /></button>{result ? <SuccessState asset={asset} amount={formatUnits(BigInt(result.paymentAmount), asset.decimals, asset.decimals)} tx={result.txid} detail={`Token service fee ${formatUnits(BigInt(result.tokenSponsorFee), asset.decimals)} ${asset.symbol}; sponsor paid ${result.networkFeePaid} µSTX`} action={close} compact /> : <><span className="eyebrow">Live sponsored spend</span><h2 id="spend-title">Move private balance</h2><p className="drawer-copy">The one-time key signs locally. The relayer receives only the serialized origin-signed transaction.</p><div className="source-account"><div><span className="source-lock"><LockKeyhole size={18} /></span><div><small>From one-time address</small><strong>{short(payment.stealthPrincipal, 10, 8)}</strong></div></div><span><strong>{formatUnits(payment.balance, asset.decimals, asset.decimals)}</strong><small>{asset.symbol} available</small></span></div><div className="segmented"><button className={kind === "send" ? "active" : ""} onClick={() => setKind("send")} disabled={submitting}>Pay someone</button><button className={kind === "withdraw" ? "active" : ""} onClick={() => setKind("withdraw")} disabled={submitting}>Withdraw all</button></div><label className="field-label">Destination</label><div className="address-input compact"><input value={kind === "withdraw" ? wallet : destination} onChange={(event) => setDestination(event.target.value.trim())} readOnly={kind === "withdraw" || submitting} placeholder="ST…" /></div>{kind === "send" && <><label className="field-label">Amount recipient receives</label><div className="amount-input"><input value={amount} onChange={(event) => setAmount(event.target.value)} readOnly={submitting} /><button><AssetIcon asset={asset} small /> {asset.symbol}</button></div></>}<div className="warning-box"><TriangleAlert size={16} /><p>Sending from a one-time address reveals the destination and amount. Withdrawing to your normal wallet creates an observable link.</p></div><button className="primary-wide" onClick={submit} disabled={submitting || (kind === "send" && (!destination || paymentAmount <= 0n))}>{submitting ? <><RefreshCw className="spin" size={16} /> Relayer is sponsoring and broadcasting…</> : <><Zap size={16} /> Sign locally and sponsor</>}</button>{submitting && <p className="submission-note">Keep this panel open. A transaction ID and success confirmation will appear here.</p>}</> }</section></div>;
}

function ActivityView({ asset, payments }: { asset: Sip010Asset; payments: LivePayment[] }) {
  return <><PageTitle eyebrow="Live on-chain history" title="Detected activity" copy="This list is rebuilt from public router announcements after you unlock and scan; Privara does not upload a private activity database." /><section className="panel activity-page">{payments.length === 0 ? <div className="inline-empty">No scanned activity in this session.</div> : payments.map((payment) => <a className="activity-live-row" href={explorer(payment.transactionId)} target="_blank" rel="noreferrer" key={payment.transactionId}><span className="activity-type"><ArrowDownLeft /></span><div><strong>Private payment detected</strong><small>{payment.stealthPrincipal}</small></div><strong>+{formatUnits(payment.receivedAmount, asset.decimals)} {asset.symbol}</strong><ExternalLink size={14} /></a>)}</section></>;
}

function Payouts({ asset, goSend }: { asset: Sip010Asset; goSend: () => void }) {
  return <><PageTitle eyebrow="Teams & DAOs" title="Private contributor payouts." copy="The live base version executes one independently authorized private intent at a time. Batch orchestration will reuse the same verified single-payment path." /><section className="panel empty-state"><Users size={30} /><h2>Single live flow first</h2><p>Use Send privately for each registered contributor. This avoids presenting a simulated batch as a completed on-chain feature.</p><button className="primary-action" onClick={goSend}>Send a live {asset.symbol} payment <ArrowRight size={15} /></button></section></>;
}

function SuccessState({ asset, amount, tx, detail, action, compact = false }: { asset: Sip010Asset; amount: string; tx: string; detail?: string; action: () => void; compact?: boolean }) {
  return <section className={`success-state ${compact ? "compact" : ""}`}><span className="success-mark"><Check /></span><span className="eyebrow">Broadcast accepted</span><h2>{amount} {asset.symbol} is on its way.</h2><p>{detail || "The testnet node accepted the transaction. Track it until final confirmation."}</p><a className="success-tx" href={explorer(tx)} target="_blank" rel="noreferrer"><div><small>Transaction ID</small><strong>{short(tx, 16, 12)}</strong></div><ExternalLink size={16} /></a><button className="primary-wide" onClick={action}>{compact ? "Done" : "View activity"}<ArrowRight size={16} /></button></section>;
}
