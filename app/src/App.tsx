import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Database,
  ExternalLink,
  FileKey,
  History,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { quoteSettlementFee } from "@privara/sdk";
import {
  SUPPORTED_ASSETS,
  formatUnits,
  parseUnits,
  type Sip010Asset,
} from "./config/assets";

type View = "overview" | "send" | "receive" | "activity" | "payouts";
type FeeMode = "added" | "included";

const walletAddress = "ST16H55CE41DBKFY9QDHESXQT2GD110WKT7VW9EPR";
const short = (value: string, start = 6, end = 5) => `${value.slice(0, start)}…${value.slice(-end)}`;

const baseActivity = [
  { type: "receive", title: "Private payment received", detail: "One-time address · 18 min ago", amount: "+0.25000000", asset: "sBTC", status: "Spendable", tx: "8a3aa853…560d" },
  { type: "send", title: "Sponsored merchant payment", detail: "To ST2CY5…K9AG · Yesterday", amount: "−0.04001200", asset: "sBTC", status: "Confirmed", tx: "8d4dcb85…aeb2" },
  { type: "receive", title: "DAO contributor payout", detail: "One-time address · Sep 4", amount: "+0.87500000", asset: "sBTC", status: "Spendable", tx: "16c7bebe…ae99" },
  { type: "send", title: "Private balance withdrawal", detail: "To ST3RFS…0D8P · Sep 1", amount: "−0.30001200", asset: "sBTC", status: "Confirmed", tx: "d3e46715…3374" },
];

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "send", label: "Send privately", icon: Send },
  { id: "receive", label: "Receive & scan", icon: Inbox },
  { id: "activity", label: "Activity", icon: History },
  { id: "payouts", label: "DAO payouts", icon: Users },
];

function AssetIcon({ asset, small = false }: { asset: Sip010Asset; small?: boolean }) {
  return <span className={`asset-icon ${asset.tone} ${small ? "small" : ""}`}>{asset.icon}</span>;
}

function App() {
  const [view, setView] = useState<View>("overview");
  const [assetId, setAssetId] = useState("sbtc");
  const [assetMenu, setAssetMenu] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const asset = SUPPORTED_ASSETS.find((item) => item.id === assetId)!;

  const copyAddress = async () => {
    await navigator.clipboard?.writeText(walletAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("overview")} aria-label="Privara overview">
          <span className="brand-mark">P</span><span>privara</span>
        </button>
        <div className="demo-chip"><span />Interactive testnet demo</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => setView(id)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="privacy-live"><span className="status-dot" /><div><strong>Privacy keys active</strong><small>Encrypted on this device</small></div></div>
          <button className="settings-link"><Settings size={16} /> Settings</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="network-status"><span className="pulse" /> Stacks testnet <span>·</span> Block 281,928</div>
          <div className="top-actions">
            <div className="asset-select-wrap">
              <button className="asset-select" onClick={() => setAssetMenu(!assetMenu)} aria-expanded={assetMenu}>
                <AssetIcon asset={asset} small /> {asset.symbol}<ChevronDown size={14} />
              </button>
              {assetMenu && <div className="asset-menu">
                <span className="menu-label">Supported SIP-010 assets</span>
                {SUPPORTED_ASSETS.map((item) => <button key={item.id} onClick={() => { setAssetId(item.id); setAssetMenu(false); }}>
                  <AssetIcon asset={item} small /><span><strong>{item.symbol}</strong><small>{item.name}</small></span>{assetId === item.id && <Check size={15} />}
                </button>)}
                <div className="coming-soon"><Plus size={13} /> More assets via policy</div>
              </div>}
            </div>
            <button className="wallet-pill" onClick={copyAddress}><span className="wallet-avatar">S</span><span>{short(walletAddress)}</span>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          </div>
        </header>

        {view === "overview" && <Overview asset={asset} go={setView} openSpend={() => setSpendOpen(true)} />}
        {view === "send" && <SendPrivate asset={asset} onDone={() => setView("activity")} />}
        {view === "receive" && <ReceiveAndScan asset={asset} openSpend={() => setSpendOpen(true)} />}
        {view === "activity" && <ActivityView />}
        {view === "payouts" && <Payouts asset={asset} />}
      </main>

      {spendOpen && <SponsoredSpend asset={asset} close={() => setSpendOpen(false)} />}
    </div>
  );
}

function PageTitle({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function Overview({ asset, go, openSpend }: { asset: Sip010Asset; go: (view: View) => void; openSpend: () => void }) {
  const balance = formatUnits(asset.demoBalanceAtomic, asset.decimals, asset.decimals);
  const usd = Number(formatUnits(asset.demoBalanceAtomic, asset.decimals)) * asset.usdPrice;
  return <>
    <PageTitle eyebrow="Private workspace" title="Your money, quietly received." copy="Receive to unlinkable one-time addresses. Spend directly without funding them with STX." action={<button className="primary-action" onClick={() => go("send")}><Send size={16} /> New private payment</button>} />
    <section className="balance-grid">
      <article className="balance-card">
        <div className="card-head"><span>Available privately</span><span className="balance-asset"><AssetIcon asset={asset} small />{asset.symbol}</span></div>
        <p className="balance-number">{balance} <small>{asset.symbol}</small></p>
        <p className="balance-fiat">≈ ${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} · across 3 one-time addresses</p>
        <div className="action-row"><button className="dark-button" onClick={openSpend}><ArrowUpRight size={15} /> Send from private balance</button><button className="light-button" onClick={openSpend}><Wallet size={15} /> Withdraw</button></div>
        <div className="privacy-orbit" aria-hidden="true"><i /><i /><i /></div>
      </article>
      <article className="posture-card">
        <div className="posture-top"><span className="eyebrow on-dark">Privacy posture</span><ShieldCheck size={23} /></div>
        <div className="score"><strong>Protected</strong><span>3 / 3</span></div><div className="meter"><i /></div>
        <ul><li><CircleCheck /> Fresh address per payment</li><li><CircleCheck /> Keys stay on this device</li><li><CircleCheck /> Sponsored spends need 0 STX</li></ul>
      </article>
    </section>
    <section className="overview-grid">
      <article className="panel activity-card"><div className="section-head"><div><span className="eyebrow">Latest</span><h2>Private activity</h2></div><button className="text-button" onClick={() => go("activity")}>View all <ArrowRight size={14} /></button></div><ActivityRows rows={baseActivity.slice(0, 3)} /></article>
      <article className="panel address-card"><div className="address-art"><div className="key-node"><KeyRound size={24} /></div><span className="r-line">R</span><span className="p-line">P′</span></div><span className="eyebrow">One identity, fresh destinations</span><h2>Bob shares one address. Every sender derives a new one.</h2><p>Your registered P/V keys let senders create addresses only you can detect and spend.</p><button className="text-button" onClick={() => go("receive")}>See how discovery works <ArrowRight size={14} /></button></article>
    </section>
    <section className="proof-strip"><div><span className="proof-icon"><Zap size={17} /></span><div><strong>Live testnet proof</strong><small>Paid v2 sponsored withdrawal confirmed at block 281,928</small></div></div><a href="https://explorer.hiro.so/txid/0x8d4dcb85038232e02462f3b000dd59f6da136703692fd6c5c5b6309e5b9aaeb2?chain=testnet" target="_blank" rel="noreferrer">8d4dcb85…aeb2 <ExternalLink size={13} /></a></section>
  </>;
}

function SendPrivate({ asset, onDone }: { asset: Sip010Asset; onDone: () => void }) {
  const [recipient, setRecipient] = useState("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG");
  const [amount, setAmount] = useState("1");
  const [feeMode, setFeeMode] = useState<FeeMode>("added");
  const [stage, setStage] = useState<"edit" | "review" | "signing" | "done">("edit");
  const quote = useMemo(() => {
    try { return quoteSettlementFee({ amount: parseUnits(amount, asset.decimals), feeBps: 100n, mode: feeMode }); } catch { return null; }
  }, [amount, asset, feeMode]);
  const format = (value?: bigint) => value === undefined ? "—" : formatUnits(value, asset.decimals, asset.decimals);
  const submit = () => { setStage("signing"); window.setTimeout(() => setStage("done"), 1300); };
  if (stage === "done") return <SuccessState asset={asset} amount={format(quote?.recipientAmount)} tx="0x7f36…c921" action={onDone} />;
  return <>
    <PageTitle eyebrow="Private payment" title="Send without exposing who receives." copy="Enter Bob’s normal Stacks address. Privara resolves his public privacy keys and derives a fresh destination locally." />
    <div className="flow-layout">
      <section className="flow-card">
        <div className="stepper"><span className="current">1 <i>Payment</i></span><b /><span className={stage === "review" || stage === "signing" ? "current" : ""}>2 <i>Review</i></span><b /><span>3 <i>Sign</i></span></div>
        {stage === "edit" ? <>
          <label className="field-label">Recipient’s Stacks address</label><div className="address-input"><input value={recipient} onChange={(event) => setRecipient(event.target.value)} /><span className="resolved"><CircleCheck size={14} /> Privacy keys found</span></div>
          <div className="resolved-card"><span className="resolved-icon"><LockKeyhole size={18} /></span><div><strong>Private routing is available</strong><small>P and V found · Registry epoch 1</small></div><span className="privacy-tag">Recipient unlinkability</span></div>
          <label className="field-label">Amount Bob should receive</label><div className="amount-input"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /><button><AssetIcon asset={asset} small /> {asset.symbol}<ChevronDown size={14} /></button></div>
          <div className="fee-choice"><button className={feeMode === "added" ? "selected" : ""} onClick={() => setFeeMode("added")}><span>{feeMode === "added" && <Check size={12} />}</span><div><strong>Add fee on top</strong><small>Bob receives exactly {amount || "0"} {asset.symbol}</small></div><em>Recommended</em></button><button className={feeMode === "included" ? "selected" : ""} onClick={() => setFeeMode("included")}><span>{feeMode === "included" && <Check size={12} />}</span><div><strong>Include fee in amount</strong><small>The fee is deducted from the entered total</small></div></button></div>
          <button className="primary-wide" disabled={!quote || !recipient} onClick={() => setStage("review")}>Review private payment <ArrowRight size={16} /></button>
        </> : <div className="review-block"><button className="back-link" onClick={() => setStage("edit")}>← Edit payment</button><div className="route-visual"><div><span className="route-avatar">A</span><small>Your deposit</small></div><ArrowRight /><div className="stealth-destination"><span><LockKeyhole size={20} /></span><small>Fresh one-time address</small><strong>ST3JY8…3AZD</strong></div></div><div className="review-lines"><div><span>Bob receives</span><strong>{format(quote?.recipientAmount)} {asset.symbol}</strong></div><div><span>Privara settlement fee · 1%</span><strong>{format(quote?.settlementFee)} {asset.symbol}</strong></div><div className="total"><span>Total you authorize</span><strong>{format(quote?.totalAmount)} {asset.symbol}</strong></div></div><div className="info-box"><Info size={16} /><p>The one-time address and encrypted announcement are bound to your signature. The relayer cannot redirect this payment.</p></div><button className="primary-wide" onClick={submit} disabled={stage === "signing"}>{stage === "signing" ? <><RefreshCw className="spin" size={16} /> Waiting for wallet signature…</> : <><Wallet size={16} /> Sign with wallet</>}</button></div>}
      </section>
      <aside className="summary-card"><span className="eyebrow">Before you sign</span><h3>Payment summary</h3><div className="summary-amount"><AssetIcon asset={asset} /><div><strong>{format(quote?.recipientAmount)}</strong><small>{asset.symbol} to Bob</small></div></div><dl><div><dt>Settlement fee</dt><dd>{format(quote?.settlementFee)} {asset.symbol}</dd></div><div><dt>Fee handling</dt><dd>{feeMode === "added" ? "Added on top" : "Included"}</dd></div><div><dt>Recipient address</dt><dd>Fresh P′</dd></div><div><dt>Amounts on-chain</dt><dd>Public</dd></div></dl><div className="summary-note"><ShieldCheck size={18} /><span>Bob’s long-term wallet is not included in the signed intent or announcement.</span></div></aside>
    </div>
  </>;
}

function ReceiveAndScan({ asset, openSpend }: { asset: Sip010Asset; openSpend: () => void }) {
  const [scanning, setScanning] = useState(false); const [scanned, setScanned] = useState(false);
  const runScan = () => { setScanning(true); window.setTimeout(() => { setScanning(false); setScanned(true); }, 1200); };
  return <><PageTitle eyebrow="Receive & discover" title="One public identity. Private arrivals." copy="Your wallet registers only P and V. Detection and spend-key derivation happen locally after you unlock your encrypted backup." action={<button className="primary-action" onClick={runScan} disabled={scanning}>{scanning ? <RefreshCw className="spin" size={16} /> : <Search size={16} />}{scanning ? "Scanning index…" : "Scan for payments"}</button>} />
    <section className="setup-grid"><article className="panel setup-card"><div className="section-head"><div><span className="eyebrow">Privacy setup</span><h2>Ready to receive</h2></div><span className="ready-badge"><CircleCheck size={14} /> Registered</span></div><div className="setup-flow"><div><span><Wallet /></span><strong>Stacks wallet</strong><small>{short(walletAddress, 8, 6)}</small></div><ArrowRight /><div><span><KeyRound /></span><strong>Public P / V</strong><small>Registry epoch 1</small></div><ArrowRight /><div><span><FileKey /></span><strong>Encrypted backup</strong><small>Stored on device</small></div></div><div className="key-list"><div><span>Spending public key · P</span><code>03a81f…92c771</code><button><Copy size={13} /></button></div><div><span>Viewing public key · V</span><code>028c45…9ef024</code><button><Copy size={13} /></button></div></div><button className="light-button"><FileKey size={15} /> Export encrypted backup</button></article>
      <article className="panel scan-card"><div className="scan-radar"><Radio size={28} /><i /><i /></div><span className="eyebrow">Local scanner</span><h2>{scanned ? "1 new payment found" : "Your keys, your inbox"}</h2><p>{scanned ? "The indexed announcement matched your viewing key. The spending key stayed locked until needed." : "Privara downloads public announcements. Your device checks which one-time addresses belong to you."}</p><div className="scan-stat"><div><strong>{scanned ? "248" : "247"}</strong><small>Announcements checked</small></div><div><strong>{scanned ? "4" : "3"}</strong><small>Payments detected</small></div></div></article></section>
    <section className="panel payment-list"><div className="section-head"><div><span className="eyebrow">Detected balances</span><h2>One-time addresses</h2></div><span className="muted-label">3 spendable</span></div><div className="private-payment"><span className="payment-symbol"><ArrowDownLeft /></span><div><strong>0.25000000 {asset.symbol}</strong><small>ST24B2…XN6AY · detected 18 min ago</small></div><span className="zero-stx">0 STX</span><button onClick={openSpend}>Spend <ArrowUpRight size={14} /></button></div><div className="private-payment"><span className="payment-symbol"><ArrowDownLeft /></span><div><strong>0.87500000 {asset.symbol}</strong><small>STF048…XJEB9 · detected Sep 4</small></div><span className="zero-stx">0 STX</span><button onClick={openSpend}>Spend <ArrowUpRight size={14} /></button></div></section>
  </>;
}

function SponsoredSpend({ asset, close }: { asset: Sip010Asset; close: () => void }) {
  const balance = 25_000_000n; const [kind, setKind] = useState<"send" | "withdraw">("send"); const [amount, setAmount] = useState("0.04"); const [done, setDone] = useState(false); const [submitting, setSubmitting] = useState(false);
  const payment = kind === "withdraw" ? balance - asset.sponsorFeeAtomic : (() => { try { return parseUnits(amount, asset.decimals); } catch { return 0n; } })();
  const total = payment + asset.sponsorFeeAtomic; const valid = payment > 0n && total <= balance;
  const confirm = () => { setSubmitting(true); window.setTimeout(() => { setSubmitting(false); setDone(true); }, 1250); };
  return <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="spend-drawer" role="dialog" aria-modal="true" aria-labelledby="spend-title"><button className="close-button" onClick={close} aria-label="Close"><X /></button>{done ? <SuccessState asset={asset} amount={formatUnits(payment, asset.decimals, asset.decimals)} tx="0x9b7d…12af" action={close} compact /> : <><span className="eyebrow">Sponsored v2 spend</span><h2 id="spend-title">Move private balance</h2><p className="drawer-copy">Sign with the one-time key on this device. Privara pays the STX network fee.</p><div className="source-account"><div><span className="source-lock"><LockKeyhole size={18} /></span><div><small>From one-time address</small><strong>ST24B2…XN6AY</strong></div></div><span><strong>{formatUnits(balance, asset.decimals, asset.decimals)}</strong><small>{asset.symbol} available</small></span></div><div className="segmented"><button className={kind === "send" ? "active" : ""} onClick={() => setKind("send")}>Pay someone</button><button className={kind === "withdraw" ? "active" : ""} onClick={() => setKind("withdraw")}>Withdraw all</button></div><label className="field-label">{kind === "send" ? "Destination" : "Connected wallet"}</label><div className="address-input compact"><input value={kind === "send" ? "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG" : walletAddress} readOnly /></div>{kind === "send" && <><label className="field-label">Amount to send</label><div className="amount-input"><input value={amount} onChange={(event) => setAmount(event.target.value)} /><button><AssetIcon asset={asset} small /> {asset.symbol}</button></div></>}<div className="fee-breakdown"><div><span>{kind === "send" ? "Recipient gets" : "You receive"}</span><strong>{formatUnits(payment, asset.decimals, asset.decimals)} {asset.symbol}</strong></div><div><span>Privara sponsor fee</span><strong>{formatUnits(asset.sponsorFeeAtomic, asset.decimals, asset.decimals)} {asset.symbol}</strong></div><div><span>STX required from you</span><strong className="free">0 STX</strong></div><div className="total"><span>Total deducted</span><strong>{formatUnits(total, asset.decimals, asset.decimals)} {asset.symbol}</strong></div></div>{kind === "withdraw" && <div className="warning-box"><TriangleAlert size={17} /><p>Withdrawing directly to your public wallet may publicly link this stealth payment to that wallet.</p></div>}<div className="signed-fields"><ShieldCheck size={16} /><span>You sign the destination, payment, exact token fee, and expected sponsor. Privara cannot change them.</span></div><button className="primary-wide" disabled={!valid || submitting} onClick={confirm}>{submitting ? <><RefreshCw className="spin" size={16} /> Adding sponsor signature…</> : <><Zap size={16} /> Sign & request sponsorship</>}</button></>}</section></div>;
}

function ActivityRows({ rows }: { rows: typeof baseActivity }) { return <div className="activity-list">{rows.map((item) => <div className="activity-row" key={item.tx}><span className={`activity-type ${item.type}`}>{item.type === "receive" ? <ArrowDownLeft /> : <ArrowUpRight />}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><span className={`status-label ${item.status === "Spendable" ? "spendable" : ""}`}>{item.status}</span><strong className="row-amount">{item.amount} <small>{item.asset}</small></strong><button className="more-button"><MoreHorizontal /></button></div>)}</div>; }

function ActivityView() { const [filter, setFilter] = useState("All"); return <><PageTitle eyebrow="On-chain history" title="Activity" copy="Every amount and one-time address is public. Privara keeps the long-term recipient relationship out of the settlement." /><section className="panel activity-page"><div className="activity-tools"><div className="filter-tabs">{["All", "Received", "Sent"].map((item) => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "active" : ""}>{item}</button>)}</div><button className="light-button"><ExternalLink size={14} /> Explorer</button></div><ActivityRows rows={baseActivity.filter((item) => filter === "All" || (filter === "Received" ? item.type === "receive" : item.type === "send"))} /></section></>; }

function Payouts({ asset }: { asset: Sip010Asset }) { const [sent, setSent] = useState(false); return <><PageTitle eyebrow="Teams & DAOs" title="Private contributor payouts." copy="Pay normal Stacks identities while routing each payout to a fresh one-time address." action={<button className="primary-action"><Plus size={16} /> Add recipient</button>} /><section className="dao-metrics"><div><span><Building2 /></span><div><small>Batch total</small><strong>1.375 {asset.symbol}</strong></div></div><div><span><Users /></span><div><small>Recipients</small><strong>3 contributors</strong></div></div><div><span><LockKeyhole /></span><div><small>Private routing</small><strong>3 / 3 available</strong></div></div></section><section className="panel payout-card"><div className="payout-head"><span>Recipient</span><span>Private route</span><span>Amount</span><span /></div>{[["Amina O.", "ST3AMN…Q9D2", "0.500"], ["Kojo Labs", "ST2KJ0…81VV", "0.625"], ["Lena R.", "ST1LNA…4F8C", "0.250"]].map(([name, address, amount]) => <div className="payout-row" key={name}><div><span className="contributor-avatar">{name[0]}</span><div><strong>{name}</strong><small>{address}</small></div></div><span className="private-route"><ShieldCheck size={14} /> Fresh P′ ready</span><strong>{amount} {asset.symbol}</strong><button><MoreHorizontal /></button></div>)}<div className="batch-summary"><div><Info size={16} /><span>Each recipient gets a different one-time address. Amounts and your payer wallet remain public.</span></div><button className="primary-action" onClick={() => setSent(true)}>{sent ? <><CircleCheck size={16} /> Batch prepared</> : <>Review 3 payouts <ArrowRight size={16} /></>}</button></div></section></>; }

function SuccessState({ asset, amount, tx, action, compact = false }: { asset: Sip010Asset; amount: string; tx: string; action: () => void; compact?: boolean }) { return <section className={`success-state ${compact ? "compact" : ""}`}><span className="success-mark"><Check /></span><span className="eyebrow">Broadcast accepted</span><h2>{amount} {asset.symbol} is on its way.</h2><p>The signed transaction was accepted by the testnet node. Track it to finality in the explorer.</p><div className="success-tx"><div><small>Transaction ID</small><strong>{tx}</strong></div><ExternalLink size={16} /></div><button className="primary-wide" onClick={action}>{compact ? "Done" : "View activity"}<ArrowRight size={16} /></button></section>; }

export default App;
