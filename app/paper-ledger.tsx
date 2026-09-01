"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./paper-ledger.module.css";

type CallType = "CE" | "PE";
type PnlFilter = "ALL" | "PROFIT" | "LOSS";
type SortDir = "asc" | "desc";
type Source = "BACKTEST" | "PAPER";
type StrategyMode = "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9" | "V10" | "V11";
type DataSource = "proxy" | "published" | null;
type SessionThread = "BASE" | "V4";

type PaperTrade = {
  source?: Source; strategy?: string; strategyVersion?: string; date: string; indexStockName: string; weeklyExpiry: string;
  lots: number; callType: CallType; strikePrice: number; startTarget: number; startStopLoss: number; endStopLoss: number;
  entryTime: string; exitTime: string; stopLossAdjustments: number; totalPnl: number; entryPremium?: number; peakPremium?: number;
  maxFavorableMove?: number; trailStepPoints?: number; trailGapPoints?: number; breakevenReached?: boolean; exitPremium?: number;
  exitReason?: string; grossPnl?: number; charges?: number;
};

type SessionContract = { symbol: string; strike?: number; optionType?: CallType; premium?: number };
type PaperSession = {
  date: string; thread: SessionThread; strategyVersions: string[]; status: string; reason?: string | null; updatedAt?: string | null;
  spot925?: number | null; expiry?: string | null; referencePremium?: number | null; ce?: SessionContract | null; pe?: SessionContract | null;
  side?: CallType | null; strike?: number | null; entry?: number | null; entryTime?: string | null; signalSource?: string | null;
  tradeCount: number; totalPnl?: number | null; strategyOutcomes?: Record<string, { tradeCount: number; totalPnl: number | null }>;
};

type SortKey = "rowNo" | keyof PaperTrade;

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const V2 = "NIFTY ₹180 Momentum V2";
const V3 = "NIFTY ₹180 Stepped Trail V3";
const V4 = "NIFTY ₹180 NIFTY-Confirmed Fail-Fast V4";
const V5 = "NIFTY ₹180 NIFTY-Confirmed Stepped Trail V5";
const V6 = "NIFTY ₹180 Fixed 2R V6";
const V7 = "NIFTY ₹180 15-Minute Failure Exit V7";
const V8 = "NIFTY ₹180 Capped-Risk Stepped Trail V8";
const V9 = "NIFTY ₹180 170/210 Momentum Trail V9";
const V10 = "NIFTY ₹180 170/210 Stepped Trail V10";
const V11 = "NIFTY ₹180 170-Stop Fixed 2R V11";
const strategyNames: Record<StrategyMode, string> = { V2, V3, V4, V5, V6, V7, V8, V9, V10, V11 };

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "rowNo", label: "#" }, { key: "date", label: "Date" }, { key: "indexStockName", label: "Index / Stock" },
  { key: "weeklyExpiry", label: "Weekly Expiry" }, { key: "lots", label: "Lots" }, { key: "callType", label: "Call Type" },
  { key: "strikePrice", label: "Trade Entry Strike" }, { key: "entryPremium", label: "Entry Premium" }, { key: "peakPremium", label: "Peak Premium" },
  { key: "maxFavorableMove", label: "Max Favorable Move" }, { key: "trailStepPoints", label: "Trail Step" }, { key: "trailGapPoints", label: "Trail Gap" },
  { key: "breakevenReached", label: "BE Reached" }, { key: "startTarget", label: "BE / Start Target" }, { key: "startStopLoss", label: "Start Stop Loss" },
  { key: "endStopLoss", label: "End Stop Loss" }, { key: "entryTime", label: "Trade Entry Time" }, { key: "exitTime", label: "Trade Exit Time" },
  { key: "exitPremium", label: "Exit Premium" }, { key: "exitReason", label: "Exit Reason" }, { key: "stopLossAdjustments", label: "SL Adjustments" },
  { key: "grossPnl", label: "Gross P/L" }, { key: "charges", label: "Charges" }, { key: "totalPnl", label: "Net P/L" },
];

function optionalNumber(value: unknown) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? undefined : Number(value);
}
function normalizeTrade(value: unknown): PaperTrade | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PaperTrade>;
  if (!row.date || !row.indexStockName || !row.weeklyExpiry || (row.callType !== "CE" && row.callType !== "PE")) return null;
  for (const key of ["lots", "strikePrice", "startTarget", "startStopLoss", "endStopLoss", "stopLossAdjustments", "totalPnl"] as const)
    if (!Number.isFinite(Number(row[key]))) return null;
  const source: Source = row.source === "PAPER" ? "PAPER" : "BACKTEST";
  return {
    source, strategy: row.strategy ? String(row.strategy) : source === "BACKTEST" ? V2 : V3, strategyVersion: row.strategyVersion ? String(row.strategyVersion) : undefined,
    date: String(row.date), indexStockName: String(row.indexStockName), weeklyExpiry: String(row.weeklyExpiry), lots: Number(row.lots), callType: row.callType,
    strikePrice: Number(row.strikePrice), startTarget: Number(row.startTarget), startStopLoss: Number(row.startStopLoss), endStopLoss: Number(row.endStopLoss),
    entryTime: String(row.entryTime ?? ""), exitTime: String(row.exitTime ?? ""), stopLossAdjustments: Number(row.stopLossAdjustments), totalPnl: Number(row.totalPnl),
    entryPremium: optionalNumber(row.entryPremium), peakPremium: optionalNumber(row.peakPremium), maxFavorableMove: optionalNumber(row.maxFavorableMove),
    trailStepPoints: optionalNumber(row.trailStepPoints), trailGapPoints: optionalNumber(row.trailGapPoints), breakevenReached: typeof row.breakevenReached === "boolean" ? row.breakevenReached : undefined,
    exitPremium: optionalNumber(row.exitPremium), exitReason: row.exitReason ? String(row.exitReason) : undefined, grossPnl: optionalNumber(row.grossPnl), charges: optionalNumber(row.charges),
  };
}
function normalizeContract(value: unknown): SessionContract | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<SessionContract>;
  if (!row.symbol) return null;
  const optionType = row.optionType === "CE" || row.optionType === "PE" ? row.optionType : undefined;
  return { symbol: String(row.symbol), strike: optionalNumber(row.strike), optionType, premium: optionalNumber(row.premium) };
}
function normalizeSession(value: unknown): PaperSession | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PaperSession>;
  if (!row.date || (row.thread !== "BASE" && row.thread !== "V4") || !row.status) return null;
  const side = row.side === "CE" || row.side === "PE" ? row.side : null;
  const strategyOutcomes = row.strategyOutcomes && typeof row.strategyOutcomes === "object" ? Object.fromEntries(Object.entries(row.strategyOutcomes).map(([key, value]) => {
    const outcome = value && typeof value === "object" ? value as { tradeCount?: unknown; totalPnl?: unknown } : {};
    return [key, { tradeCount: Number.isFinite(Number(outcome.tradeCount)) ? Number(outcome.tradeCount) : 0, totalPnl: optionalNumber(outcome.totalPnl) ?? null }];
  })) : undefined;
  return {
    date: String(row.date), thread: row.thread, strategyVersions: Array.isArray(row.strategyVersions) ? row.strategyVersions.map(String) : [],
    status: String(row.status), reason: row.reason ? String(row.reason) : null, updatedAt: row.updatedAt ? String(row.updatedAt) : null,
    spot925: optionalNumber(row.spot925) ?? null, expiry: row.expiry ? String(row.expiry) : null, referencePremium: optionalNumber(row.referencePremium) ?? null,
    ce: normalizeContract(row.ce), pe: normalizeContract(row.pe), side, strike: optionalNumber(row.strike) ?? null, entry: optionalNumber(row.entry) ?? null,
    entryTime: row.entryTime ? String(row.entryTime) : null, signalSource: row.signalSource ? String(row.signalSource) : null,
    tradeCount: Number.isFinite(Number(row.tradeCount)) ? Number(row.tradeCount) : 0, totalPnl: optionalNumber(row.totalPnl) ?? null, strategyOutcomes,
  };
}
function compareValues(a: unknown, b: unknown) {
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "en", { numeric: true });
}
const premium = (value?: number | null) => value === undefined || value === null ? "—" : `₹${num.format(value)}`;
const pnl = (value?: number | null) => value === undefined || value === null ? "—" : `${value >= 0 ? "+" : "−"}₹${money.format(Math.abs(value))}`;
const strategyName = (mode: StrategyMode) => strategyNames[mode];
const threadFor = (mode: StrategyMode): SessionThread => mode === "V4" || mode === "V5" ? "V4" : "BASE";

function rankedContracts(session: PaperSession) {
  const reference = session.referencePremium ?? 180;
  return [session.ce, session.pe].filter((row): row is SessionContract => Boolean(row && row.premium !== undefined)).sort((a, b) => {
    const distance = Math.abs((a.premium ?? Infinity) - reference) - Math.abs((b.premium ?? Infinity) - reference);
    if (distance !== 0) return distance;
    if ((a.premium ?? 0) !== (b.premium ?? 0)) return (b.premium ?? 0) - (a.premium ?? 0);
    return String(a.optionType ?? "").localeCompare(String(b.optionType ?? ""));
  });
}
function contractLabel(row?: SessionContract | null) {
  if (!row) return "—";
  return `${row.strike === undefined ? "?" : num.format(row.strike)} ${row.optionType ?? ""} @ ${premium(row.premium)}`;
}
function statusTone(status: string) {
  if (status === "CLOSED") return styles.sessionGood;
  if (["OPEN", "WAITING_SIGNAL", "STARTING"].includes(status)) return styles.sessionLive;
  if (status === "NO_TRADE") return styles.sessionNeutral;
  return styles.sessionWarn;
}

export default function PaperLedger() {
  const [rows, setRows] = useState<PaperTrade[]>([]);
  const [sessions, setSessions] = useState<PaperSession[]>([]);
  const [year, setYear] = useState("ALL"); const [month, setMonth] = useState("ALL");
  const [callType, setCallType] = useState<"ALL" | CallType>("ALL"); const [strategyMode, setStrategyMode] = useState<StrategyMode>("V2");
  const [trailStep, setTrailStep] = useState("5"); const [pnlFilter, setPnlFilter] = useState<PnlFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("date"); const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [lastUpdated, setLastUpdated] = useState("—"); const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [dataSource, setDataSource] = useState<DataSource>(null);

  useEffect(() => {
    let active = true;
    const applyPayload = (payload: unknown, source: Exclude<DataSource, null>) => {
      const object = payload && typeof payload === "object" ? payload as { trades?: unknown[]; sessions?: unknown[] } : {};
      const nextRows = (Array.isArray(object.trades) ? object.trades : []).map(normalizeTrade).filter(Boolean) as PaperTrade[];
      const nextSessions = (Array.isArray(object.sessions) ? object.sessions : []).map(normalizeSession).filter(Boolean) as PaperSession[];
      if (!nextRows.length && !nextSessions.length) return false;
      if (active) {
        setRows(nextRows); setSessions(nextSessions); setLastUpdated(new Date().toLocaleString("en-IN")); setLoadState("ok"); setDataSource(source);
      }
      return true;
    };
    const load = async () => {
      try {
        const response = await fetch(`/api/paper-trades?t=${Date.now()}`, { cache: "no-store" });
        if (response.ok && applyPayload(await response.json(), "proxy")) return;
      } catch { /* use published files */ }
      try {
        const [ledgerResponse, sessionsResponse] = await Promise.all([
          fetch(`/paper/trades.json?t=${Date.now()}`, { cache: "no-store" }),
          fetch(`/paper/sessions.json?t=${Date.now()}`, { cache: "no-store" }),
        ]);
        if (!ledgerResponse.ok) throw new Error("published ledger unavailable");
        const ledger = await ledgerResponse.json();
        const sessionJournal = sessionsResponse.ok ? await sessionsResponse.json() : { sessions: [] };
        if (applyPayload({ trades: ledger.trades ?? ledger, sessions: sessionJournal.sessions ?? [] }, "published")) return;
      } catch { /* surface unavailable state */ }
      if (active) { setLoadState("error"); setDataSource(null); }
    };
    load(); const timer = window.setInterval(load, 60_000); return () => { active = false; window.clearInterval(timer); };
  }, []);

  const allDates = useMemo(() => [...rows.map((r) => r.date), ...sessions.map((s) => s.date)], [rows, sessions]);
  const years = useMemo(() => Array.from(new Set(allDates.map((date) => date.slice(0, 4)))).sort().reverse(), [allDates]);
  const months = useMemo(() => Array.from(new Set(allDates.filter((date) => year === "ALL" || date.startsWith(`${year}-`)).map((date) => date.slice(0, 7)))).sort().reverse(), [allDates, year]);
  const trailSteps = useMemo(() => Array.from(new Set(rows.filter((r) => r.strategy === strategyName(strategyMode)).map((r) => r.trailStepPoints).filter((v): v is number => v !== undefined))).sort((a,b) => a-b), [rows, strategyMode]);
  const effectiveTrailStep = trailSteps.includes(Number(trailStep)) ? Number(trailStep) : (trailSteps[0] ?? 5);

  const displayed = useMemo(() => {
    const wantedStrategy = strategyName(strategyMode);
    const base = rows.map((trade, index) => ({ trade, originalRow: index + 1 })).filter(({ trade }) => {
      if (trade.strategy !== wantedStrategy) return false;
      if ((strategyMode === "V3" || strategyMode === "V10") && trade.trailStepPoints !== effectiveTrailStep) return false;
      if (year !== "ALL" && !trade.date.startsWith(`${year}-`)) return false;
      if (month !== "ALL" && !trade.date.startsWith(month)) return false;
      if (callType !== "ALL" && trade.callType !== callType) return false;
      if (pnlFilter === "PROFIT" && trade.totalPnl <= 0) return false;
      if (pnlFilter === "LOSS" && trade.totalPnl >= 0) return false;
      return true;
    });
    base.sort((a,b) => { const av = sortKey === "rowNo" ? a.originalRow : a.trade[sortKey as keyof PaperTrade]; const bv = sortKey === "rowNo" ? b.originalRow : b.trade[sortKey as keyof PaperTrade]; const result = compareValues(av,bv); return sortDir === "asc" ? result : -result; });
    return base;
  }, [rows, year, month, callType, strategyMode, effectiveTrailStep, pnlFilter, sortKey, sortDir]);

  const latestSession = useMemo(() => sessions.filter((session) => {
    if (session.thread !== threadFor(strategyMode)) return false;
    if (year !== "ALL" && !session.date.startsWith(`${year}-`)) return false;
    if (month !== "ALL" && !session.date.startsWith(month)) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0] ?? null, [sessions, strategyMode, year, month]);

  const totalPnl = displayed.reduce((s,r) => s + r.trade.totalPnl, 0); const profits = displayed.filter((r) => r.trade.totalPnl > 0).length;
  const losses = displayed.filter((r) => r.trade.totalPnl < 0); const beReached = displayed.filter((r) => r.trade.breakevenReached === true).length;
  const lossMfe10 = losses.filter((r) => (r.trade.maxFavorableMove ?? -Infinity) >= 10).length; const lossMfe20 = losses.filter((r) => (r.trade.maxFavorableMove ?? -Infinity) >= 20).length; const lossMfe30 = losses.filter((r) => (r.trade.maxFavorableMove ?? -Infinity) >= 30).length;
  function sortBy(key: SortKey) { if (key === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); } }

  const ranked = latestSession ? rankedContracts(latestSession) : [];
  const primary = ranked[0] ?? null; const backup = ranked[1] ?? null;
  const outcomeKey = strategyMode === "V3" || strategyMode === "V10" ? `${strategyMode}-${effectiveTrailStep}` : strategyMode;
  const selectedOutcome = latestSession?.strategyOutcomes?.[outcomeKey];
  const selectedSessionTrade = latestSession ? rows.find((trade) => trade.date === latestSession.date && trade.strategy === strategyName(strategyMode)
    && (strategyMode !== "V3" && strategyMode !== "V10" || trade.trailStepPoints === effectiveTrailStep)) : null;
  const resolvedOutcome = selectedOutcome ?? (selectedSessionTrade ? { tradeCount: 1, totalPnl: selectedSessionTrade.totalPnl } : undefined);

  return <section className={styles.ledger} id="trade-ledger">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Backtest + live paper journal</p><h2>Trade ledger</h2>
      <p>Compare the original ₹160/₹220 family with the new ₹170/₹210 paper cohort. Session outcomes are journalled even when no trade is taken, so NO_TRADE and data-boundary days remain visible.</p></div>
      <div className={styles.status}><span className={loadState === "ok" ? styles.ok : styles.warn} />{loadState === "loading" ? "Loading…" : loadState === "error" ? "Journal unavailable" : `${dataSource === "proxy" ? "Live GitHub journal" : "Published snapshot"} · Updated ${lastUpdated}`}</div></div>

    <div className={styles.filters}>
      <label><span>Strategy</span><select value={strategyMode} onChange={(e) => setStrategyMode(e.target.value as StrategyMode)}><option value="V2">V2 · 160/220 momentum trail</option><option value="V3">V3 · 160-based stepped trail</option><option value="V4">V4 · NIFTY-confirmed fail-fast</option><option value="V5">V5 · Confirmed + stepped</option><option value="V6">V6 · 160-stop fixed 2R</option><option value="V7">V7 · 15-minute failure exit</option><option value="V8">V8 · Capped-risk stepped trail</option><option value="V9">V9 · 170/210 momentum trail</option><option value="V10">V10 · 170/210 stepped trail</option><option value="V11">V11 · 170-stop fixed 2R</option></select></label>
      {(strategyMode === "V3" || strategyMode === "V10") && <label><span>Stepped points</span><select value={String(effectiveTrailStep)} onChange={(e) => setTrailStep(e.target.value)}>{trailSteps.map((v) => <option key={v} value={String(v)}>{num.format(v)} pts</option>)}</select></label>}
      <label><span>Year</span><select value={year} onChange={(e) => { setYear(e.target.value); setMonth("ALL"); }}><option value="ALL">All years</option>{years.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>Month</span><select value={month} onChange={(e) => setMonth(e.target.value)}><option value="ALL">All months</option>{months.map((v) => <option key={v} value={v}>{new Date(`${v}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>)}</select></label>
      <label><span>Call type</span><select value={callType} onChange={(e) => setCallType(e.target.value as "ALL" | CallType)}><option value="ALL">All</option><option value="CE">CE</option><option value="PE">PE</option></select></label>
      <label><span>Profit / Loss</span><select value={pnlFilter} onChange={(e) => setPnlFilter(e.target.value as PnlFilter)}><option value="ALL">All trades</option><option value="PROFIT">Profit only</option><option value="LOSS">Loss only</option></select></label>
    </div>

    {latestSession ? <div className={styles.sessionCard}>
      <div className={styles.sessionHeader}><div><span>Latest journalled session</span><strong>{latestSession.date} · {strategyMode === "V3" || strategyMode === "V10" ? `${strategyMode}-${effectiveTrailStep}` : strategyMode}</strong></div><span className={`${styles.sessionBadge} ${statusTone(latestSession.status)}`}>{latestSession.status}</span></div>
      <div className={styles.sessionGrid}>
        <div><span>Weekly expiry</span><strong>{latestSession.expiry ?? "—"}</strong></div>
        <div><span>NIFTY 09:25</span><strong>{latestSession.spot925 === null || latestSession.spot925 === undefined ? "—" : num.format(latestSession.spot925)}</strong></div>
        {strategyMode === "V4" || strategyMode === "V5" ? <><div><span>Primary</span><strong>{contractLabel(primary)}</strong></div><div><span>Backup</span><strong>{contractLabel(backup)}</strong></div></> : <div><span>Monitored contract</span><strong>{contractLabel(primary)}</strong></div>}
        <div><span>Trade count</span><strong>{resolvedOutcome?.tradeCount ?? 0}</strong></div>
        <div><span>Variant P/L</span><strong className={(resolvedOutcome?.totalPnl ?? 0) >= 0 ? styles.profit : styles.loss}>{pnl(resolvedOutcome?.totalPnl ?? null)}</strong></div>
        {latestSession.signalSource && <div><span>Signal source</span><strong>{latestSession.signalSource}</strong></div>}
      </div>
      {latestSession.reason && <p className={styles.sessionReason}><strong>Reason:</strong> {latestSession.reason}</p>}
    </div> : <div className={styles.sessionCard}><p className={styles.sessionReason}>No session journal row is available for this strategy and date filter yet.</p></div>}

    <div className={styles.summary}><div><span>Visible trades</span><strong>{displayed.length}</strong></div><div><span>Profitable</span><strong>{profits}</strong></div><div><span>Losing</span><strong>{losses.length}</strong></div><div><span>BE cushion reached</span><strong>{beReached}</strong></div><div><span>Losses after +10</span><strong>{lossMfe10}</strong></div><div><span>Losses after +20</span><strong>{lossMfe20}</strong></div><div><span>Losses after +30</span><strong>{lossMfe30}</strong></div><div><span>Visible net P/L</span><strong className={totalPnl >= 0 ? styles.profit : styles.loss}>{pnl(totalPnl)}</strong></div></div>

    <div className={styles.tableWrap}><table><thead><tr>{columns.map((c) => <th key={c.key}><button type="button" onClick={() => sortBy(c.key)}>{c.label}<span>{sortKey === c.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span></button></th>)}</tr></thead><tbody>
      {displayed.map(({ trade, originalRow }, i) => <tr key={`${trade.date}-${trade.callType}-${trade.strikePrice}-${trade.strategy}-${trade.trailStepPoints ?? 0}-${originalRow}`}><td>{i+1}</td><td>{trade.date}</td><td>{trade.indexStockName}</td><td>{trade.weeklyExpiry}</td><td>{trade.lots}</td><td><span className={`${styles.optionBadge} ${trade.callType === "CE" ? styles.ce : styles.pe}`}>{trade.callType}</span></td><td>{num.format(trade.strikePrice)}</td><td>{premium(trade.entryPremium)}</td><td>{premium(trade.peakPremium)}</td><td>{premium(trade.maxFavorableMove)}</td><td>{trade.trailStepPoints === undefined ? "—" : `${num.format(trade.trailStepPoints)} pts`}</td><td>{trade.trailGapPoints === undefined ? "—" : `${num.format(trade.trailGapPoints)} pts`}</td><td>{trade.breakevenReached === undefined ? "—" : trade.breakevenReached ? "Yes" : "No"}</td><td>₹{num.format(trade.startTarget)}</td><td>₹{num.format(trade.startStopLoss)}</td><td>₹{num.format(trade.endStopLoss)}</td><td>{trade.entryTime || "—"}</td><td>{trade.exitTime || "—"}</td><td>{premium(trade.exitPremium)}</td><td>{trade.exitReason || "—"}</td><td>{trade.stopLossAdjustments}</td><td className={(trade.grossPnl ?? 0) >= 0 ? styles.profit : styles.loss}>{pnl(trade.grossPnl)}</td><td>{trade.charges === undefined ? "—" : `₹${money.format(trade.charges)}`}</td><td className={trade.totalPnl >= 0 ? styles.profit : styles.loss}>{pnl(trade.totalPnl)}</td></tr>)}
      {!displayed.length && <tr><td className={styles.empty} colSpan={24}>No validated trades are available for this strategy/step selection. Check the session card above for NO_TRADE or data-quality outcomes.</td></tr>}
    </tbody></table></div>
    <p className={styles.footnote}>Paper/research mode only. V2–V11 are counterfactual alternatives, never additive account profit. The ₹170/₹210 cohort begins 1 September 2026 and is not retroactively added to earlier paper sessions. No broker order is placed.</p>
  </section>;
}
