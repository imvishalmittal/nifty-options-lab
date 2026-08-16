"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./paper-ledger.module.css";

type CallType = "CE" | "PE";
type PnlFilter = "ALL" | "PROFIT" | "LOSS";
type SortDir = "asc" | "desc";
type Source = "BACKTEST" | "PAPER";
type StrategyMode = "V2" | "V3";
type DataSource = "proxy" | "published" | null;

type PaperTrade = {
  source?: Source; strategy?: string; strategyVersion?: string; date: string; indexStockName: string; weeklyExpiry: string;
  lots: number; callType: CallType; strikePrice: number; startTarget: number; startStopLoss: number; endStopLoss: number;
  entryTime: string; exitTime: string; stopLossAdjustments: number; totalPnl: number; entryPremium?: number; peakPremium?: number;
  maxFavorableMove?: number; trailStepPoints?: number; trailGapPoints?: number; breakevenReached?: boolean; exitPremium?: number;
  exitReason?: string; grossPnl?: number; charges?: number;
};
type SortKey = "rowNo" | keyof PaperTrade;

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const V2 = "NIFTY ₹180 Momentum V2";
const V3 = "NIFTY ₹180 Stepped Trail V3";

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
function compareValues(a: unknown, b: unknown) {
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "en", { numeric: true });
}
const premium = (value?: number) => value === undefined ? "—" : `₹${num.format(value)}`;
const pnl = (value?: number) => value === undefined ? "—" : `${value >= 0 ? "+" : "−"}₹${money.format(Math.abs(value))}`;

export default function PaperLedger() {
  const [rows, setRows] = useState<PaperTrade[]>([]);
  const [year, setYear] = useState("ALL"); const [month, setMonth] = useState("ALL");
  const [callType, setCallType] = useState<"ALL" | CallType>("ALL"); const [strategyMode, setStrategyMode] = useState<StrategyMode>("V2");
  const [trailStep, setTrailStep] = useState("5"); const [pnlFilter, setPnlFilter] = useState<PnlFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("date"); const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [lastUpdated, setLastUpdated] = useState("—"); const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [dataSource, setDataSource] = useState<DataSource>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      for (const candidate of [{ url: `/api/paper-trades?t=${Date.now()}`, source: "proxy" as const }, { url: `/paper/trades.json?t=${Date.now()}`, source: "published" as const }]) {
        try {
          const response = await fetch(candidate.url, { cache: "no-store" }); if (!response.ok) continue;
          const payload = await response.json();
          const next = (Array.isArray(payload) ? payload : payload.trades ?? []).map(normalizeTrade).filter(Boolean) as PaperTrade[];
          if (!next.length) continue;
          if (active) { setRows(next); setLastUpdated(new Date().toLocaleString("en-IN")); setLoadState("ok"); setDataSource(candidate.source); }
          return;
        } catch { /* try published snapshot */ }
      }
      if (active) { setLoadState("error"); setDataSource(null); }
    };
    load(); const timer = window.setInterval(load, 60_000); return () => { active = false; window.clearInterval(timer); };
  }, []);

  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.date.slice(0, 4)))).sort().reverse(), [rows]);
  const months = useMemo(() => Array.from(new Set(rows.filter((r) => year === "ALL" || r.date.startsWith(`${year}-`)).map((r) => r.date.slice(0, 7)))).sort().reverse(), [rows, year]);
  const trailSteps = useMemo(() => Array.from(new Set(rows.filter((r) => r.strategy === V3).map((r) => r.trailStepPoints).filter((v): v is number => v !== undefined))).sort((a,b) => a-b), [rows]);
  const effectiveTrailStep = trailSteps.includes(Number(trailStep)) ? Number(trailStep) : (trailSteps[0] ?? 5);

  const displayed = useMemo(() => {
    const wantedStrategy = strategyMode === "V2" ? V2 : V3;
    const base = rows.map((trade, index) => ({ trade, originalRow: index + 1 })).filter(({ trade }) => {
      if (trade.strategy !== wantedStrategy) return false;
      if (strategyMode === "V3" && trade.trailStepPoints !== effectiveTrailStep) return false;
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

  const totalPnl = displayed.reduce((s,r) => s + r.trade.totalPnl, 0); const profits = displayed.filter((r) => r.trade.totalPnl > 0).length;
  const losses = displayed.filter((r) => r.trade.totalPnl < 0); const beReached = displayed.filter((r) => r.trade.breakevenReached === true).length;
  const lossMfe10 = losses.filter((r) => (r.trade.maxFavorableMove ?? -Infinity) >= 10).length; const lossMfe20 = losses.filter((r) => (r.trade.maxFavorableMove ?? -Infinity) >= 20).length; const lossMfe30 = losses.filter((r) => (r.trade.maxFavorableMove ?? -Infinity) >= 30).length;
  function sortBy(key: SortKey) { if (key === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); } }

  return <section className={styles.ledger} id="trade-ledger">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Backtest + live paper journal</p><h2>Trade ledger</h2>
      <p>Select V2 or V3. V3 then applies the selected stepped-stop rule to the same research trade cohort, so exit, stop adjustments and P/L reflect that rule only.</p></div>
      <div className={styles.status}><span className={loadState === "ok" ? styles.ok : styles.warn} />{loadState === "loading" ? "Loading…" : loadState === "error" ? "Journal unavailable" : `${dataSource === "proxy" ? "Live GitHub ledger" : "Published snapshot"} · Updated ${lastUpdated}`}</div></div>

    <div className={styles.filters}>
      <label><span>Strategy</span><select value={strategyMode} onChange={(e) => setStrategyMode(e.target.value as StrategyMode)}><option value="V2">V2 · Momentum trail</option><option value="V3">V3 · Stepped trail</option></select></label>
      {strategyMode === "V3" && <label><span>Stepped points</span><select value={String(effectiveTrailStep)} onChange={(e) => setTrailStep(e.target.value)}>{trailSteps.map((v) => <option key={v} value={String(v)}>{num.format(v)} pts</option>)}</select></label>}
      <label><span>Year</span><select value={year} onChange={(e) => { setYear(e.target.value); setMonth("ALL"); }}><option value="ALL">All years</option>{years.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>Month</span><select value={month} onChange={(e) => setMonth(e.target.value)}><option value="ALL">All months</option>{months.map((v) => <option key={v} value={v}>{new Date(`${v}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>)}</select></label>
      <label><span>Call type</span><select value={callType} onChange={(e) => setCallType(e.target.value as "ALL" | CallType)}><option value="ALL">All</option><option value="CE">CE</option><option value="PE">PE</option></select></label>
      <label><span>Profit / Loss</span><select value={pnlFilter} onChange={(e) => setPnlFilter(e.target.value as PnlFilter)}><option value="ALL">All trades</option><option value="PROFIT">Profit only</option><option value="LOSS">Loss only</option></select></label>
    </div>

    <div className={styles.summary}><div><span>Visible trades</span><strong>{displayed.length}</strong></div><div><span>Profitable</span><strong>{profits}</strong></div><div><span>Losing</span><strong>{losses.length}</strong></div><div><span>BE cushion reached</span><strong>{beReached}</strong></div><div><span>Losses after +10</span><strong>{lossMfe10}</strong></div><div><span>Losses after +20</span><strong>{lossMfe20}</strong></div><div><span>Losses after +30</span><strong>{lossMfe30}</strong></div><div><span>Visible net P/L</span><strong className={totalPnl >= 0 ? styles.profit : styles.loss}>{pnl(totalPnl)}</strong></div></div>

    <div className={styles.tableWrap}><table><thead><tr>{columns.map((c) => <th key={c.key}><button type="button" onClick={() => sortBy(c.key)}>{c.label}<span>{sortKey === c.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span></button></th>)}</tr></thead><tbody>
      {displayed.map(({ trade, originalRow }, i) => <tr key={`${trade.date}-${trade.callType}-${trade.strikePrice}-${trade.strategy}-${trade.trailStepPoints ?? 0}-${originalRow}`}><td>{i+1}</td><td>{trade.date}</td><td>{trade.indexStockName}</td><td>{trade.weeklyExpiry}</td><td>{trade.lots}</td><td><span className={`${styles.optionBadge} ${trade.callType === "CE" ? styles.ce : styles.pe}`}>{trade.callType}</span></td><td>{num.format(trade.strikePrice)}</td><td>{premium(trade.entryPremium)}</td><td>{premium(trade.peakPremium)}</td><td>{premium(trade.maxFavorableMove)}</td><td>{trade.trailStepPoints === undefined ? "—" : `${num.format(trade.trailStepPoints)} pts`}</td><td>{trade.trailGapPoints === undefined ? "—" : `${num.format(trade.trailGapPoints)} pts`}</td><td>{trade.breakevenReached === undefined ? "—" : trade.breakevenReached ? "Yes" : "No"}</td><td>₹{num.format(trade.startTarget)}</td><td>₹{num.format(trade.startStopLoss)}</td><td>₹{num.format(trade.endStopLoss)}</td><td>{trade.entryTime || "—"}</td><td>{trade.exitTime || "—"}</td><td>{premium(trade.exitPremium)}</td><td>{trade.exitReason || "—"}</td><td>{trade.stopLossAdjustments}</td><td className={(trade.grossPnl ?? 0) >= 0 ? styles.profit : styles.loss}>{pnl(trade.grossPnl)}</td><td>{trade.charges === undefined ? "—" : `₹${money.format(trade.charges)}`}</td><td className={trade.totalPnl >= 0 ? styles.profit : styles.loss}>{pnl(trade.totalPnl)}</td></tr>)}
      {!displayed.length && <tr><td className={styles.empty} colSpan={24}>No validated trades are available for this strategy/step selection.</td></tr>}
    </tbody></table></div>
    <p className={styles.footnote}>Paper/research mode only. V2 preserves the original historical exits. V3 uses the selected stepped-stop backtest outcome for the same validated entry cohort. No broker order is placed.</p>
  </section>;
}