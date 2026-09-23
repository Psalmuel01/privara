import { useEffect, useMemo, useState } from "react";
import { connect, request } from "@stacks/connect";
import { STACKS_MAINNET } from "@stacks/network";
import {
  Cl,
  ClarityType,
  Pc,
  fetchCallReadOnlyFunction,
  type ContractIdString,
} from "@stacks/transactions";
import {
  assertBnsResolutionUnchanged,
  attachStealthIntentSignature,
  fetchSip010Balance,
  fetchStealthKeys,
  preparePrivateIntent,
  privateIntentEnvelope,
  resolveMainnetRecipient,
  stealthIntentDomainCV,
  stealthIntentMessageCV,
  type PreparedPrivateIntentResult,
  type ResolvedRecipient,
  type SettlementFeeMode,
  type StealthRegistryRecord,
} from "@privara-stacks/sdk";

const RELAYER_URL = (import.meta.env.VITE_PRIVARA_RELAYER_URL || "/privara-api").replace(/\/$/, "");
const STACKS_API_URL = (import.meta.env.VITE_STACKS_API_URL || "https://api.hiro.so").replace(/\/$/, "");
const EXPECTED_DEPLOYMENT = {
  coreAddress: "SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE",
  registry: "SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-stealth-registry",
  assets: {
    sbtc: {
      router: "SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-router-m2-sbtc",
      asset: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
    },
    usdcx: {
      router: "SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-router-m2-usdcx",
      asset: "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx",
    },
  },
} as const;

interface AssetPolicy {
  id: string;
  symbol: string;
  decimals: number;
  router: string;
  asset: string;
  tokenName: string;
  sponsorFee: string;
  maxIntentAmount: string;
}

interface DeploymentConfig {
  version: 1;
  network: "mainnet";
  coreAddress: string;
  registry: string;
  router: string;
  asset: string;
  tokenName: string;
  relayerAddress: string;
  settlementFeeBps: number;
  feeRecipient: string;
  assets?: AssetPolicy[];
}

interface ReadyRecipient extends ResolvedRecipient {
  keys: StealthRegistryRecord;
}

interface PaymentReview {
  policy: AssetPolicy;
  recipient: ReadyRecipient;
  prepared: PreparedPrivateIntentResult;
  relayerAddress: string;
  existingDeposit: bigint;
  walletBalance: bigint;
  fundingShortfall: bigint;
}

type RecipientState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "error"; message: string }
  | { status: "ready"; recipient: ReadyRecipient };

const short = (value: string, start = 7, end = 6) =>
  value.length > start + end ? `${value.slice(0, start)}…${value.slice(-end)}` : value;

function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function parseUnits(value: string, decimals: number): bigint {
  if (!/^\d+(?:\.\d*)?$/.test(value.trim())) throw new Error("Enter a valid amount");
  const [whole, fraction = ""] = value.trim().split(".");
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(body.message || `Request failed with HTTP ${response.status}`);
  return body;
}

function validateDeployment(config: DeploymentConfig): DeploymentConfig {
  if (
    config.version !== 1 ||
    config.network !== "mainnet" ||
    config.coreAddress !== EXPECTED_DEPLOYMENT.coreAddress ||
    config.registry !== EXPECTED_DEPLOYMENT.registry
  ) {
    throw new Error("Privara deployment does not match the principals pinned by this app");
  }
  for (const [id, expected] of Object.entries(EXPECTED_DEPLOYMENT.assets)) {
    const policy = config.assets?.find((candidate) => candidate.id === id);
    if (!policy || policy.router !== expected.router || policy.asset !== expected.asset) {
      throw new Error(`${id} policy does not match the deployment pinned by this app`);
    }
  }
  return config;
}

async function routerDeposit(policy: AssetPolicy, user: string): Promise<bigint> {
  const [contractAddress, contractName] = policy.router.split(".");
  const value = await fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: "get-deposit",
    functionArgs: [Cl.principal(user), Cl.principal(policy.asset)],
    senderAddress: user,
    network: STACKS_MAINNET,
  });
  if (value.type !== ClarityType.UInt) throw new Error("Unable to read the router deposit");
  return BigInt(value.value);
}

async function waitForTransaction(txid: string): Promise<void> {
  const deadline = Date.now() + 5 * 60_000;
  const normalized = txid.replace(/^0x/, "");
  while (Date.now() < deadline) {
    const response = await fetch(`${STACKS_API_URL}/extended/v1/tx/0x${normalized}`);
    if (response.ok) {
      const tx = await response.json() as { tx_status?: string; tx_result?: { repr?: string } };
      if (tx.tx_status === "success") return;
      if (tx.tx_status?.startsWith("abort_")) {
        throw new Error(`Funding failed: ${tx.tx_result?.repr || tx.tx_status}`);
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 4_000));
  }
  throw new Error("Funding is still pending. Check the explorer before retrying");
}

export default function App() {
  const [config, setConfig] = useState<DeploymentConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [wallet, setWallet] = useState("");
  const [assetId, setAssetId] = useState("sbtc");
  const [recipientInput, setRecipientInput] = useState("");
  const [recipientState, setRecipientState] = useState<RecipientState>({ status: "idle" });
  const [amount, setAmount] = useState("0.00001");
  const [feeMode, setFeeMode] = useState<SettlementFeeMode>("added");
  const [review, setReview] = useState<PaymentReview | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ txid: string; destination: string; amount: bigint } | null>(null);

  const policies = useMemo(() => config?.assets?.length
    ? config.assets
    : config ? [{
      id: "sbtc",
      symbol: "sBTC",
      decimals: 8,
      router: config.router,
      asset: config.asset,
      tokenName: config.tokenName,
      sponsorFee: "0",
      maxIntentAmount: "0",
    }] : [], [config]);
  const policy = policies.find((item) => item.id === assetId) ?? policies[0];

  useEffect(() => {
    let active = true;
    void fetch(`${RELAYER_URL}/v1/config`)
      .then((response) => json<DeploymentConfig>(response))
      .then((untrusted) => {
        const next = validateDeployment(untrusted);
        if (active) {
          setConfig(next);
          setAssetId(next.assets?.[0]?.id || "sbtc");
        }
      })
      .catch((cause) => active && setConfigError(cause instanceof Error ? cause.message : String(cause)));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setReview(null);
    setSuccess(null);
    const value = recipientInput.trim();
    if (!config || !value) {
      setRecipientState({ status: "idle" });
      return;
    }
    let active = true;
    setRecipientState({ status: "checking" });
    const timer = window.setTimeout(() => {
      void resolveMainnetRecipient(value)
        .then(async (resolved) => {
          const keys = await fetchStealthKeys({ registry: config.registry, user: resolved.address, network: "mainnet" });
          if (!keys) throw new Error("This recipient has not registered Privara privacy keys");
          if (active) setRecipientState({ status: "ready", recipient: { ...resolved, keys } });
        })
        .catch((cause) => active && setRecipientState({ status: "error", message: cause instanceof Error ? cause.message : String(cause) }));
    }, 450);
    return () => { active = false; window.clearTimeout(timer); };
  }, [config, recipientInput]);

  useEffect(() => {
    if (!policy) return;
    setAmount(policy.id === "sbtc" ? "0.00001" : "1");
    setReview(null);
    setSuccess(null);
  }, [policy?.id]);

  async function connectWallet() {
    setError("");
    setBusy("Opening wallet…");
    try {
      const result = await connect();
      const address = result.addresses.map((entry) => entry.address.toUpperCase()).find((entry) => entry.startsWith("SP"));
      if (!address) throw new Error("Select a Stacks mainnet account");
      setWallet(address);
      setReview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  async function prepareReview() {
    setError("");
    setSuccess(null);
    if (!config || !policy) return setError("Privara configuration is unavailable");
    if (!wallet) return setError("Connect a wallet first");
    if (recipientState.status !== "ready") return setError("Enter a registered Privara recipient");
    setBusy("Preparing private route…");
    try {
      const enteredAmount = parseUnits(amount, policy.decimals);
      if (enteredAmount <= 0n) throw new Error("Amount must be greater than zero");
      const info = await json<{ stacks_tip_height: number }>(await fetch(`${STACKS_API_URL}/v2/info`));
      const prepared = await preparePrivateIntent({
        registry: config.registry,
        recipient: recipientState.recipient.address,
        recipientKeys: recipientState.recipient.keys,
        network: "mainnet",
        router: policy.router,
        asset: policy.asset,
        relayer: config.relayerAddress,
        enteredAmount,
        settlementFeeBps: BigInt(config.settlementFeeBps),
        feeMode,
        expiry: info.stacks_tip_height + 200,
      });
      if (prepared.quote.totalAmount > BigInt(policy.maxIntentAmount)) {
        throw new Error(`Payment exceeds the hosted ${policy.symbol} limit`);
      }
      const existingDeposit = await routerDeposit(policy, wallet);
      const fundingShortfall = prepared.quote.totalAmount > existingDeposit
        ? prepared.quote.totalAmount - existingDeposit
        : 0n;
      const walletBalance = await fetchSip010Balance({
        assetContract: policy.asset,
        principal: wallet,
        network: "mainnet",
        stacksApiUrl: STACKS_API_URL,
      });
      if (fundingShortfall > walletBalance) {
        throw new Error(`Wallet needs ${formatUnits(fundingShortfall, policy.decimals)} ${policy.symbol}, but only ${formatUnits(walletBalance, policy.decimals)} is available`);
      }
      setReview({
        policy,
        recipient: recipientState.recipient,
        prepared,
        relayerAddress: config.relayerAddress,
        existingDeposit,
        walletBalance,
        fundingShortfall,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  async function confirmPayment() {
    if (!config || !wallet || !review) return;
    setError("");
    setBusy(review.fundingShortfall > 0n ? "Waiting for router funding…" : "Requesting intent signature…");
    try {
      if (review.fundingShortfall > 0n) {
        const funding = await request("stx_callContract", {
          address: wallet,
          network: "mainnet",
          contract: review.policy.router as `${string}.${string}`,
          functionName: "deposit",
          functionArgs: [Cl.principal(review.policy.asset), Cl.uint(review.fundingShortfall)],
          postConditionMode: "deny",
          postConditions: [
            Pc.origin().willSendEq(review.fundingShortfall).ft(
              review.policy.asset as ContractIdString,
              review.policy.tokenName,
            ),
          ],
        });
        if (!funding.txid) throw new Error("Wallet did not return a funding transaction ID");
        await waitForTransaction(funding.txid);
        setBusy("Funding confirmed. Requesting intent signature…");
      }

      await assertBnsResolutionUnchanged(review.recipient);
      const signed = await request("stx_signStructuredMessage", {
        domain: stealthIntentDomainCV("mainnet", review.policy.router),
        message: stealthIntentMessageCV(review.prepared.intent),
      });
      const intent = attachStealthIntentSignature(
        review.prepared.intent,
        signed.signature,
        "mainnet",
        review.policy.router,
      );
      if (intent.user !== wallet) throw new Error("The wallet account changed before signing");
      setBusy("Submitting signed payment…");
      const result = await json<{ txid: string }>(await fetch(`${RELAYER_URL}/v1/intents/settle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(privateIntentEnvelope({ ...review.prepared, intent }, "mainnet")),
      }));
      setSuccess({
        txid: result.txid,
        destination: review.prepared.announcement.stealthPrincipal,
        amount: review.prepared.quote.recipientAmount,
      });
      setReview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  return <main>
    <header className="topbar">
      <a className="brand" href="https://www.useprivara.xyz" target="_blank" rel="noreferrer"><span>F</span> Fieldnote</a>
      <div className="network"><i /> Stacks mainnet</div>
      <button className="wallet-button" onClick={() => void connectWallet()} disabled={Boolean(busy)}>
        {wallet ? short(wallet) : "Connect wallet"}
      </button>
    </header>

    <section className="intro">
      <div><span className="kicker">Independent integration experiment</span><h1>Pay a contributor without exposing their public wallet.</h1><p>This fictional product uses Privara's published SDK and hosted relayer. Nothing is imported from the main Privara app.</p></div>
      <div className="powered"><span>P</span><div><small>Privacy route</small><strong>Powered by Privara</strong></div></div>
    </section>

    <div className="workspace">
      <section className="checkout">
        <div className="section-heading"><span>Private payout</span><p>The recipient gets a fresh one-time settlement address.</p></div>

        <label>Asset</label>
        <div className="asset-tabs">{policies.map((item) => <button key={item.id} className={item.id === policy?.id ? "active" : ""} onClick={() => setAssetId(item.id)}><span>{item.id === "sbtc" ? "₿" : "$"}</span>{item.symbol}</button>)}</div>

        <label htmlFor="recipient">Recipient's Stacks address or BNS name</label>
        <div className={`field recipient-field ${recipientState.status}`}>
          <input id="recipient" value={recipientInput} onChange={(event) => setRecipientInput(event.target.value)} placeholder="bob.btc or SP…" />
          <span>{recipientState.status === "checking" ? "Checking…" : recipientState.status === "ready" ? "✓ Registered" : ""}</span>
        </div>
        {recipientState.status === "error" && <p className="field-error">{recipientState.message}</p>}
        {recipientState.status === "ready" && <p className="resolved">Resolves to {short(recipientState.recipient.address, 10, 8)} · P/V keys found</p>}

        <div className="amount-row">
          <div><label htmlFor="amount">Recipient receives</label><div className="field amount-field"><input id="amount" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setReview(null); }} /><span>{policy?.symbol || "—"}</span></div></div>
          <div><label>Fee handling</label><div className="mode-switch"><button className={feeMode === "added" ? "active" : ""} onClick={() => { setFeeMode("added"); setReview(null); }}>Add on top</button><button className={feeMode === "included" ? "active" : ""} onClick={() => { setFeeMode("included"); setReview(null); }}>Include</button></div></div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {configError && <div className="error-banner">Relayer unavailable: {configError}</div>}

        {!review && !success && <button className="primary" onClick={() => void prepareReview()} disabled={Boolean(busy) || !config}>{busy || "Review private payment"}<span>→</span></button>}

        {review && <section className="review">
          <div className="review-title"><span>Exact review</span><button onClick={() => setReview(null)}>Edit</button></div>
          <dl>
            <div><dt>Recipient receives</dt><dd>{formatUnits(review.prepared.quote.recipientAmount, review.policy.decimals)} {review.policy.symbol}</dd></div>
            <div><dt>Settlement fee</dt><dd>{formatUnits(review.prepared.quote.settlementFee, review.policy.decimals)} {review.policy.symbol}</dd></div>
            <div><dt>Total authorized</dt><dd>{formatUnits(review.prepared.quote.totalAmount, review.policy.decimals)} {review.policy.symbol}</dd></div>
            <div><dt>Fresh destination</dt><dd title={review.prepared.announcement.stealthPrincipal}>{short(review.prepared.announcement.stealthPrincipal, 10, 8)}</dd></div>
            <div><dt>Settlement relayer</dt><dd title={review.relayerAddress}>{short(review.relayerAddress, 10, 8)}</dd></div>
            <div><dt>Wallet balance</dt><dd>{formatUnits(review.walletBalance, review.policy.decimals)} {review.policy.symbol}</dd></div>
            <div><dt>Existing router deposit</dt><dd>{formatUnits(review.existingDeposit, review.policy.decimals)} {review.policy.symbol}</dd></div>
            <div><dt>Router funding needed</dt><dd>{formatUnits(review.fundingShortfall, review.policy.decimals)} {review.policy.symbol}</dd></div>
          </dl>
          <p>{review.fundingShortfall > 0n ? "The wallet will first approve the exact router shortfall. After confirmation, it will sign the private payment intent." : "Your existing router balance covers this payment. Only the private intent signature is needed."}</p>
          <button className="primary" onClick={() => void confirmPayment()} disabled={Boolean(busy)}>{busy || (review.fundingShortfall > 0n ? "Fund and send privately" : "Sign and send privately")}<span>→</span></button>
        </section>}

        {success && policy && <section className="success">
          <span className="success-mark">✓</span><small>Relayer accepted the payment</small><h2>{formatUnits(success.amount, policy.decimals)} {policy.symbol} is on its way.</h2><p>Settlement destination: {short(success.destination, 11, 8)}</p><a href={`https://explorer.hiro.so/txid/0x${success.txid.replace(/^0x/, "")}?chain=mainnet`} target="_blank" rel="noreferrer">View transaction ↗</a><button onClick={() => { setSuccess(null); setRecipientInput(""); }}>Create another payout</button>
        </section>}
      </section>

      <aside>
        <section className="progress-card">
          <span className="kicker">Integration state</span>
          <h2>What the host app owns</h2>
          <ol>
            <li className={config ? "done" : ""}><span>{config ? "✓" : "1"}</span><div><strong>Trust deployment</strong><small>Fetch and pin Privara's public policy.</small></div></li>
            <li className={wallet ? "done" : ""}><span>{wallet ? "✓" : "2"}</span><div><strong>Connect payer</strong><small>The host app owns wallet UX.</small></div></li>
            <li className={recipientState.status === "ready" ? "done" : ""}><span>{recipientState.status === "ready" ? "✓" : "3"}</span><div><strong>Resolve recipient</strong><small>BNS plus registered P/V validation.</small></div></li>
            <li className={review || success ? "done" : ""}><span>{review || success ? "✓" : "4"}</span><div><strong>Collect consent</strong><small>Show exact amount, fee, route, and network.</small></div></li>
          </ol>
        </section>
        <section className="friction-card"><span className="kicker">What we learned</span><h2>The SDK is only one layer.</h2><ul><li>Wallet connection and approval screens remain the host's responsibility.</li><li>Browser origins need hosted-relayer CORS approval.</li><li>Router shortfalls introduce a funding transaction and confirmation wait.</li><li>BNS must be resolved again immediately before signing.</li><li>Integrators need clear pending, failure, and retry states.</li></ul></section>
        <section className="privacy-card"><strong>Precise privacy boundary</strong><p>The settlement destination does not reveal the recipient's registered long-term wallet. Amounts, payer activity, and later withdrawal links remain visible.</p></section>
      </aside>
    </div>
  </main>;
}
