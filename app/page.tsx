"use client";

import { ChangeEvent, useMemo, useState } from "react";

type Relation = "above" | "below" | "unclear";
type Slope = "rising" | "falling" | "flat";
type YesNo = "yes" | "no";
type Direction = "CALL" | "PUT" | null;
type Status =
  | "DATA UNCERTAIN"
  | "NO TRADE"
  | "WAIT FOR PULLBACK"
  | "WAIT FOR CONFIRMATION"
  | "CALL READY"
  | "PUT READY";

function UploadCard({ label, hint, file, onChange }: {
  label: string; hint: string; file: File | null; onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  function updateFile(next: File | null) {
    onChange(next);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(next ? URL.createObjectURL(next) : null);
  }
  return (
    <label className={`upload-card ${file ? "has-file" : ""}`}>
      <input type="file" accept="image/png,image/jpeg,image/webp"
        onChange={(event: ChangeEvent<HTMLInputElement>) => updateFile(event.target.files?.[0] ?? null)} />
      {preview ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt={`${label} preview`} />
      </> : <span className="upload-icon">↥</span>}
      <span className="upload-copy">
        <strong>{file ? file.name : label}</strong>
        <small>{file ? "Tap to replace screenshot" : hint}</small>
      </span>
      {file && <button type="button" className="remove-file" onClick={(event) => {
        event.preventDefault(); updateFile(null);
      }} aria-label={`Remove ${label}`}>×</button>}
    </label>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return <li><span className={`check-dot ${ok ? "pass" : "fail"}`}>{ok ? "✓" : "×"}</span>
    <span><strong>{label}</strong><small>{detail}</small></span></li>;
}

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export default function Home() {
  const [chart15, setChart15] = useState<File | null>(null);
  const [chart5, setChart5] = useState<File | null>(null);
  const [chain, setChain] = useState<File | null>(null);
  const [sampleMode, setSampleMode] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [nifty, setNifty] = useState(24628);
  const [relation, setRelation] = useState<Relation>("above");
  const [slope, setSlope] = useState<Slope>("rising");
  const [adx, setAdx] = useState(24.6);
  const [plusDi, setPlusDi] = useState(29.2);
  const [minusDi, setMinusDi] = useState(17.4);
  const [pullback, setPullback] = useState<YesNo>("yes");
  const [rejection, setRejection] = useState<YesNo>("yes");
  const [confirmation, setConfirmation] = useState<YesNo>("no");
  const [trigger, setTrigger] = useState(24635);
  const [invalidation, setInvalidation] = useState(24598);
  const [expiry, setExpiry] = useState("18 Aug 2026");
  const [premium, setPremium] = useState(58);
  const [stopPremium, setStopPremium] = useState(54);
  const [fresh, setFresh] = useState(true);
  const [correctFrames, setCorrectFrames] = useState(true);
  const [expiryDay, setExpiryDay] = useState(false);
  const [tradedToday, setTradedToday] = useState(false);

  const result = useMemo(() => {
    const hasCharts = sampleMode || Boolean(chart15 && chart5);
    const bullish = relation === "above" && slope === "rising" && adx > 20 && plusDi > minusDi;
    const bearish = relation === "below" && slope === "falling" && adx > 20 && minusDi > plusDi;
    const direction: Direction = bullish ? "CALL" : bearish ? "PUT" : null;
    const atm = Math.round(nifty / 50) * 50;
    const strike = direction === "CALL" ? atm + 50 : direction === "PUT" ? atm - 50 : atm;
    const capital = premium * 65;
    const riskPoints = Math.max(0, premium - stopPremium);
    const maxLoss = riskPoints * 65;
    const target2 = premium + riskPoints * 2;
    const target3 = premium + riskPoints * 3;
    const safety = {
      charts: hasCharts, frames: correctFrames, freshness: fresh,
      weekly: expiry.trim().length > 0, notExpiryDay: !expiryDay,
      affordable: capital <= 5000, stopValid: stopPremium > 0 && stopPremium < premium,
      risk: maxLoss > 0 && maxLoss <= 300, oneTrade: !tradedToday,
    };
    let status: Status = "NO TRADE";
    let action = "Trend rules are not aligned. Stand aside.";
    if (!hasCharts || !correctFrames || !fresh) {
      status = "DATA UNCERTAIN"; action = "Do not act until both charts and fresh data are verified.";
    } else if (!direction) {
      status = "NO TRADE"; action = "The 15-minute trend filter does not qualify.";
    } else if (pullback === "no") {
      status = "WAIT FOR PULLBACK"; action = "Trend is valid. Wait for a 5-minute pullback toward EMA22.";
    } else if (rejection === "no" || confirmation === "no") {
      status = "WAIT FOR CONFIRMATION";
      action = confirmation === "no"
        ? `Do not buy yet. Wait for NIFTY beyond ${money.format(trigger)}.`
        : "Wait for a clear rejection candle at the setup area.";
    } else {
      const safe = Object.values(safety).every(Boolean);
      status = safe ? (direction === "CALL" ? "CALL READY" : "PUT READY") : "NO TRADE";
      action = safe ? "Eligible for a one-lot paper learning trade. Manual execution only."
        : "Technical setup is ready, but a safety rule blocks the trade.";
    }
    return { status, action, direction, atm, strike, capital, maxLoss, target2, target3, safety };
  }, [adx, chart15, chart5, confirmation, correctFrames, expiry, expiryDay, fresh, minusDi, nifty,
    plusDi, premium, pullback, rejection, relation, sampleMode, slope, stopPremium, tradedToday, trigger]);

  const isReady = result.status === "CALL READY" || result.status === "PUT READY";
  const tone = result.status.includes("READY") ? "ready" : result.status.startsWith("WAIT") ? "wait"
    : result.status === "DATA UNCERTAIN" ? "uncertain" : "blocked";

  function loadSample() {
    setSampleMode(true); setNifty(24628); setRelation("above"); setSlope("rising");
    setAdx(24.6); setPlusDi(29.2); setMinusDi(17.4); setPullback("yes");
    setRejection("yes"); setConfirmation("no"); setTrigger(24635); setInvalidation(24598);
    setPremium(58); setStopPremium(54); setFresh(true); setCorrectFrames(true);
    setExpiryDay(false); setTradedToday(false); setAnalyzed(true);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark">N</span>
          <span>NIFTY Options Lab<small>Learning dashboard</small></span></a>
        <div className="top-actions"><span className="market-pill"><i /> Learning mode · Manual only</span>
          <button className="ghost-button" type="button" onClick={loadSample}>Load sample</button></div>
      </header>
      <div className="page-shell" id="top">
        <section className="intro"><div>
          <p className="eyebrow">NIFTY · nearest weekly · exactly 1 OTM · 1 lot</p>
          <h1>Turn chart facts into a disciplined decision.</h1>
          <p>Upload what you see, verify the extracted facts, and let fixed rules—not impulse—decide whether to wait or act.</p>
        </div><div className="capital-card"><span>Learning capital</span><strong>₹5,000</strong>
          <small>Maximum intended risk ₹300 / trade</small></div></section>

        <div className="workflow-strip"><span className="active"><b>1</b> Upload charts</span><i />
          <span className={analyzed ? "active" : ""}><b>2</b> Verify facts</span><i />
          <span className={analyzed ? "active" : ""}><b>3</b> Decision & risk</span></div>

        <div className="dashboard-grid">
          <section className="work-panel">
            <div className="section-heading"><div><span className="step-number">01</span><h2>Upload chart evidence</h2></div>
              <span className="privacy-note">Processed in this browser</span></div>
            <div className="upload-grid">
              <UploadCard label="15-minute NIFTY chart" hint="Required · EMA22, ADX and DI visible"
                file={chart15} onChange={(file) => { setChart15(file); setSampleMode(false); }} />
              <UploadCard label="5-minute NIFTY chart" hint="Required · pullback and candle visible"
                file={chart5} onChange={(file) => { setChart5(file); setSampleMode(false); }} />
              <UploadCard label="Option-chain screenshot" hint="Optional · verify expiry and premium" file={chain} onChange={setChain} />
            </div>
            {sampleMode && <div className="sample-banner"><span>●</span> Sample evidence loaded. Edit any fact below to test the rule engine.</div>}

            <div className="section-heading facts-heading"><div><span className="step-number">02</span><h2>Verify chart facts</h2></div>
              <span className="required-note">Never accept an unclear reading</span></div>

            <div className="fact-block">
              <div className="fact-title"><span>15m</span><div><strong>Trend filter</strong>
                <small>Answers “should I be bullish or bearish?”</small></div></div>
              <div className="fields three">
                <Field label="Price vs EMA22"><select value={relation} onChange={(e) => setRelation(e.target.value as Relation)}>
                  <option value="above">Above EMA22</option><option value="below">Below EMA22</option><option value="unclear">Unclear</option></select></Field>
                <Field label="EMA22 slope"><select value={slope} onChange={(e) => setSlope(e.target.value as Slope)}>
                  <option value="rising">Rising</option><option value="falling">Falling</option><option value="flat">Flat</option></select></Field>
                <Field label="ADX (14)" hint="Must be above 20"><input type="number" step="0.1" value={adx} onChange={(e) => setAdx(Number(e.target.value))} /></Field>
                <Field label="+DI"><input type="number" step="0.1" value={plusDi} onChange={(e) => setPlusDi(Number(e.target.value))} /></Field>
                <Field label="−DI"><input type="number" step="0.1" value={minusDi} onChange={(e) => setMinusDi(Number(e.target.value))} /></Field>
                <Field label="NIFTY spot"><input type="number" step="0.05" value={nifty} onChange={(e) => setNifty(Number(e.target.value))} /></Field>
              </div>
            </div>

            <div className="fact-block">
              <div className="fact-title violet"><span>5m</span><div><strong>Entry setup</strong>
                <small>Answers “is this the right moment?”</small></div></div>
              <div className="fields three">
                <Field label="Pullback near EMA22"><select value={pullback} onChange={(e) => setPullback(e.target.value as YesNo)}>
                  <option value="yes">Yes</option><option value="no">No</option></select></Field>
                <Field label="Rejection candle"><select value={rejection} onChange={(e) => setRejection(e.target.value as YesNo)}>
                  <option value="yes">Yes</option><option value="no">No</option></select></Field>
                <Field label="Breakout confirmed"><select value={confirmation} onChange={(e) => setConfirmation(e.target.value as YesNo)}>
                  <option value="yes">Yes</option><option value="no">Not yet</option></select></Field>
                <Field label="Confirmation level"><input type="number" value={trigger} onChange={(e) => setTrigger(Number(e.target.value))} /></Field>
                <Field label="NIFTY invalidation"><input type="number" value={invalidation} onChange={(e) => setInvalidation(Number(e.target.value))} /></Field>
                <Field label="Data check"><select value={fresh && correctFrames ? "valid" : "invalid"}
                  onChange={(e) => { const ok = e.target.value === "valid"; setFresh(ok); setCorrectFrames(ok); }}>
                  <option value="valid">Fresh · correct timeframes</option><option value="invalid">Uncertain / stale</option></select></Field>
              </div>
            </div>

            <div className="fact-block compact">
              <div className="fact-title amber"><span>₹</span><div><strong>Contract & risk</strong>
                <small>One affordable weekly contract only</small></div></div>
              <div className="fields three">
                <Field label="Nearest weekly expiry"><input value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
                <Field label="1 OTM premium ₹"><input type="number" step="0.05" value={premium} onChange={(e) => setPremium(Number(e.target.value))} /></Field>
                <Field label="Option stop ₹"><input type="number" step="0.05" value={stopPremium} onChange={(e) => setStopPremium(Number(e.target.value))} /></Field>
              </div>
              <div className="toggle-row">
                <label><input type="checkbox" checked={expiryDay} onChange={(e) => setExpiryDay(e.target.checked)} /><span /> Today is expiry day</label>
                <label><input type="checkbox" checked={tradedToday} onChange={(e) => setTradedToday(e.target.checked)} /><span /> I already traded today</label>
              </div>
            </div>
            <button className="analyze-button" type="button" onClick={() => setAnalyzed(true)}><span>Analyze setup</span><b>→</b></button>
          </section>

          <aside className="decision-column" aria-live="polite">
            <section className={`decision-card ${tone}`}>
              <div className="decision-top"><span>Rule-engine decision</span><span className="paper-badge">PAPER FIRST</span></div>
              <div className="status-orb"><i /><span>{analyzed ? result.status : "READY TO ANALYZE"}</span></div>
              <h2>{analyzed ? result.action : "Add both charts or load the guided sample."}</h2>
              {analyzed && result.status === "WAIT FOR CONFIRMATION" && <div className="trigger-box"><span>Next action</span>
                <strong>Wait for NIFTY {result.direction === "PUT" ? "below" : "above"} {money.format(trigger)}</strong>
                <small>Re-check only after a completed 5-minute candle.</small></div>}
              {analyzed && <div className="trend-summary">
                <div><span>15m bias</span><strong>{result.direction ? (result.direction === "CALL" ? "Bullish" : "Bearish") : "Not valid"}</strong></div>
                <div><span>ADX</span><strong>{adx.toFixed(1)} <small>{adx > 20 ? "PASS" : "FAIL"}</small></strong></div>
                <div><span>5m setup</span><strong>{pullback === "yes" ? (confirmation === "yes" ? "Confirmed" : "Forming") : "Waiting"}</strong></div>
              </div>}
            </section>

            <section className="contract-card">
              <div className="card-heading"><span>Contract plan</span><small>Auto-resolved from spot</small></div>
              <div className="contract-name"><span>{result.direction ?? "—"}</span>
                <strong>{result.direction ? `${money.format(result.strike)} ${result.direction === "CALL" ? "CE" : "PE"}` : "No contract yet"}</strong>
                <small>{expiry || "Add weekly expiry"} · 1 OTM</small></div>
              <div className="metric-grid">
                <div><span>ATM strike</span><strong>{money.format(result.atm)}</strong></div>
                <div><span>Quantity</span><strong>1 lot <small>× 65</small></strong></div>
                <div><span>Premium</span><strong>₹{premium.toFixed(2)}</strong></div>
                <div><span>Capital</span><strong>₹{money.format(result.capital)}</strong></div>
                <div><span>Stop</span><strong>₹{stopPremium.toFixed(2)}</strong></div>
                <div><span>Max loss</span><strong className={result.maxLoss <= 300 ? "good" : "bad"}>₹{money.format(result.maxLoss)}</strong></div>
              </div>
              <div className="targets"><div><span>2R exit</span><strong>₹{result.target2.toFixed(2)}</strong></div>
                <div><span>Track 3R</span><strong>₹{result.target3.toFixed(2)}</strong></div></div>
              <p className="structure-note">NIFTY invalidation <strong>{money.format(invalidation)}</strong>. The option stop is a learning estimate; use the underlying structure as the primary invalidation.</p>
            </section>

            <section className="safety-card">
              <div className="card-heading"><span>Safety gate</span><small>{Object.values(result.safety).filter(Boolean).length}/9 passed</small></div>
              <ul>
                <CheckRow ok={result.safety.charts} label="Chart evidence" detail="Both required timeframes present" />
                <CheckRow ok={result.safety.frames && result.safety.freshness} label="Data quality" detail="Fresh and correct timeframes" />
                <CheckRow ok={result.safety.weekly && result.safety.notExpiryDay} label="Weekly contract" detail="Nearest expiry; not expiry day" />
                <CheckRow ok={result.safety.affordable} label="Fits ₹5,000" detail={`Required ₹${money.format(result.capital)}`} />
                <CheckRow ok={result.safety.stopValid && result.safety.risk} label="Risk within limit" detail={`Estimated ₹${money.format(result.maxLoss)} / ₹300`} />
                <CheckRow ok={result.safety.oneTrade} label="Daily discipline" detail="No earlier trade today" />
              </ul>
            </section>
            <div className={`execution-note ${isReady ? "eligible" : ""}`}><span>{isReady ? "✓" : "i"}</span><p>
              <strong>{isReady ? "Eligible for paper execution" : "Manual decision support only"}</strong>
              {isReady ? "Record the hypothetical fill before watching P/L." : "This tool does not place orders or guarantee outcomes."}</p></div>
          </aside>
        </div>
        <footer><span>NIFTY Options Lab · v0.1</span><p>Built for disciplined learning, not trade frequency. Contract size must be re-verified before any live trade.</p></footer>
      </div>
    </main>
  );
}
