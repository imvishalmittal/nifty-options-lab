"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./paper-ledger.module.css";

type CallType = "CE" | "PE";
type PnlFilter = "ALL" | "PROFIT" | "LOSS";
type SortDir = "asc" | "desc";
type Source = "BACKTEST" | "PAPER";

type PaperTrade = {
  source?: Source;
  strategy?: string;
  date: string;
  indexStockName: string;
  weeklyExpiry: string;
  lots: number;
  callType: CallType;
  strikePrice: number;
  startTarget: number;
  startStopLoss: number;
  endStopLoss: number;
  entryTime: string;
  exitTime: string;
  stopLossAdjustments: number;
  totalPnl: number;
  entryPremium?: number;
  peakPremium?: number;
  maxFavorableMove?: number;
  trailStepPoints?: number;
  trailGapPoints?: number;
  breakevenReached?: boolean;
  exitPremium?: number;
  exitReason?: string;
  grossPnl?: number;
  charges?: number;
};

type SortKey = "rowNo" | keyof PaperTrade;

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "rowNo", label: "#" },
  { key: "date", label: "Date" },
  { key: "strategy", label: "Strategy" },
  { key: "indexStockName", label: "Index / Stock" },
  { key: "weeklyExpiry", label: "Weekly Expiry" },
  { key: "lots", label: "Lots" },
  { key: "callType", label: "Call Type" },
  { key: "strikePrice", label: "Trade Entry Strike" },
  { key: "entryPremium", label: "Entry Premium" },
  { key: "peakPremium", label: "Peak Premium" },
  { key: "maxFavorableMove", label: "Max Favorable Move" },
  { key: "trailStepPoints", label: "Trail Step" },
  { key: "trailGapPoints", label: "Trail Gap" },
  { key: "breakevenReached", label: "BE Reached" },
  { key: "startTarget", label: "BE / Start Target" },
  { key: "startStopLoss", label: "Start Stop Loss" },
  { key: "endStopLoss", label: "End Stop Loss" },
  { key: "entryTime", label: "Trade Entry Time" },
  { key: "exitTime", label: "Trade Exit Time" },
  { key: "exitPremium", label: "Exit Premium" },
  { key: "exitReason", label: "Exit Reason" },
  { key: "stopLossAdjustments", label: "SL Adjustments" },
  { key: "grossPnl", label: "Gross P/L" },
  { key: "charges", label: "Charges" },
  { key: "totalPnl", label: "Net P/L" },
];

function optionalNumber(value: unknown) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? undefined : Number(value);
}

function normalizeTrade(value: unknown): PaperTrade | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PaperTrade>;
  if (!row.date || !row.indexStockName || !row.weeklyExpiry || (row.callType !== "CE" && row.callType !== "PE")) return null;
  const numericKeys = ["lots", "strikePrice", "startTarget", "startStopLoss", "endStopLoss", "stopLossAdjustments", "totalPnl"] as const;
  for (const key of numericKeys) if (!Number.isFinite(Number(row[key]))) return null;
  const source: Source = row.source === "PAPER" ? "PAPER" : "BACKTEST";
  return {
    source,
    strategy: row.strategy ? String(row.strategy) : source === "BACKTEST" ? "NIFTY ₹180 Momentum V2" : "Paper",
    date: String(row.date), indexStockName: String(row.indexStockName), weeklyExpiry: String(row.weeklyExpiry),
    lots: Number(row.lots), callType: row.callType, strikePrice: Number(row.strikePrice), startTarget: Number(row.startTarget),
    startStopLoss: Number(row.startStopLoss), endStopLoss: Number(row.endStopLoss), entryTime: String(row.entryTime ?? ""),
    exitTime: String(row.exitTime ?? ""), stopLossAdjustments: Number(row.stopLossAdjustments), totalPnl: Number(row.totalPnl),
    entryPremium: optionalNumber(row.entryPremium), peakPremium: optionalNumber(row.peakPremium), maxFavorableMove: optionalNumber(row.maxFavorableMove),
    trailStepPoints: optionalNumber(row.trailStepPoints), trailGapPoints: optionalNumber(row.trailGapPoints),
    breakevenReached: typeof row.breakevenReached === "boolean" ? row.breakevenReached : undefined,
    exitPremium: optionalNumber(row.exitPremium), exitReason: row.exitReason ? String(row.exitReason) : undefined,
    grossPnl: optionalNumber(row.grossPnl), charges: optionalNumber(row.charges),
  };
}

function compareValues(a: unknown, b: unknown) {
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "en", { numeric: true });
}

function premium(value?: number) {
  return value === undefined ? "—" : `₹${num.format(value)}`;
}

function pnl(value?: number) {
  if (value === undefined) return "—";
  return `${value >= 0 ? "+" : "−"}₹${money.format(Math.abs(value))}`;
}

export default function PaperLedger() {
  const [rows, setRows] = useState<PaperTrade[]>([]);
  const [year, setYear] = useState("ALL");
  const [month, setMonth] = useState("ALL");
  const [callType, setCallType] = useState<"ALL" | CallType>("ALL");
  const [strategy, setStrategy] = useState("ALL");
  const [pnlFilter, setPnlFilter] = useState<PnlFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [lastUpdated, setLastUpdated] = useState("—");
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/paper/trades.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("trade journal unavailable");
        const payload = await response.json();
        const next = (Array.isArray(payload) ? payload : payload.trades ?? []).map(normalizeTrade).filter(Boolean) as PaperTrade[];
        if (active) { setRows(next); setLastUpdated(new Date().toLocaleString("en-IN")); setLoadState("ok"); }
      } catch {
        if (active) setLoadState("error");
      }
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const years = useMemo(() => Array.from(new Set(rows.map((row) => row.date.slice(0, 4)))).sort().reverse(), [rows]);
  const months = useMemo(() => Array.from(new Set(rows
    .filter((row) => year === "ALL" || row.date.startsWith(`${year}-`))
    .map((row) => row.date.slice(0, 7)))).sort().reverse(), [rows, year]);
  const strategies = useMemo(() => Array.from(new Set(rows.map((row) => row.strategy).filter(Boolean) as string[])).sort(), [rows]);

  const displayed = useMemo(() => {
    const base = rows.map((trade, index) => ({ trade, originalRow: index + 1 })).filter(({ trade }) => {
      if (year !== "ALL" && !trade.date.startsWith(`${year}-`)) return false;
      if (month !== "ALL" && !trade.date.startsWith(month)) return false;
      if (callType !== "ALL" && trade.callType !== callType) return false;
      if (strategy !== "ALL" && trade.strategy !== strategy) return false;
      if (pnlFilter === "PROFIT" && trade.totalPnl <= 0) return false;
      if (pnlFilter === "LOSS" && trade.totalPnl >= 0) return false;
      return true;
    });
    base.sort((a, b) => {
      const av = sortKey === "rowNo" ? a.originalRow : a.trade[sortKey as keyof PaperTrade];
      const bv = sortKey === "rowNo" ? b.originalRow : b.trade[sortKey as keyof PaperTrade];
      const result = compareValues(av, bv);
      return sortDir === "asc" ? result : -result;
    });
    return base;
  }, [rows, year, month, callType, strategy, pnlFilter, sortKey, sortDir]);

  const totalPnl = displayed.reduce((sum, row) => sum + row.trade.totalPnl, 0);
  const profits = displayed.filter((row) => row.trade.totalPnl > 0).length;
  const beReached = displayed.filter((row) => row.trade.breakevenReached === true).length;

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); }
  }

  return <section className={styles.ledger} id="trade-ledger">
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>Backtest + live paper journal</p><h2>Trade ledger</h2>
        <p>Historical V2 rows stay reproducible. V3 paper rows expose stepped-trail behavior, breakeven progress, exit reason, charges, and net outcome.</p></div>
      <div className={styles.status}><span className={loadState === "ok" ? styles.ok : styles.warn} />
        {loadState === "loading" ? "Loading…" : loadState === "error" ? "Journal unavailable" : `Updated ${lastUpdated}`}</div>
    </div>

    <div className={styles.filters}>
      <label><span>Year</span><select value={year} onChange={(e) => { setYear(e.target.value); setMonth("ALL"); }}>
        <option value="ALL">All years</option>{years.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Month</span><select value={month} onChange={(e) => setMonth(e.target.value)}>
        <option value="ALL">All months</option>{months.map((value) => <option key={value} value={value}>{new Date(`${value}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>)}</select></label>
      <label><span>Call type</span><select value={callType} onChange={(e) => setCallType(e.target.value as "ALL" | CallType)}>
        <option value="ALL">All</option><option value="CE">CE</option><option value="PE">PE</option></select></label>
      <label><span>Strategy</span><select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
        <option value="ALL">All strategies</option>{strategies.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Profit / Loss</span><select value={pnlFilter} onChange={(e) => setPnlFilter(e.target.value as PnlFilter)}>
        <option value="ALL">All trades</option><option value="PROFIT">Profit only</option><option value="LOSS">Loss only</option></select></label>
    </div>

    <div className={styles.summary}>
      <div><span>Visible trades</span><strong>{displayed.length}</strong></div>
      <div><span>Profitable</span><strong>{profits}</strong></div>
      <div><span>Breakeven reached</span><strong>{beReached}</strong></div>
      <div><span>Losing</span><strong>{displayed.length - profits}</strong></div>
      <div><span>Visible net P/L</span><strong className={totalPnl >= 0 ? styles.profit : styles.loss}>{totalPnl >= 0 ? "+" : "−"}₹{money.format(Math.abs(totalPnl))}</strong></div>
    </div>

    <div className={styles.tableWrap}><table><thead><tr>{columns.map((column) => <th key={column.key}>
      <button type="button" onClick={() => sortBy(column.key)}>{column.label}<span>{sortKey === column.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span></button>
    </th>)}</tr></thead><tbody>
      {displayed.map(({ trade, originalRow }, displayIndex) => <tr key={`${trade.date}-${trade.callType}-${trade.strikePrice}-${originalRow}`}>
        <td>{displayIndex + 1}</td><td>{trade.date}</td><td>{trade.strategy || "—"}</td><td>{trade.indexStockName}</td><td>{trade.weeklyExpiry}</td>
        <td>{trade.lots}</td><td><span className={`${styles.optionBadge} ${trade.callType === "CE" ? styles.ce : styles.pe}`}>{trade.callType}</span></td>
        <td>{num.format(trade.strikePrice)}</td><td>{premium(trade.entryPremium)}</td><td>{premium(trade.peakPremium)}</td><td>{premium(trade.maxFavorableMove)}</td>
        <td>{trade.trailStepPoints === undefined ? "—" : `${num.format(trade.trailStepPoints)} pts`}</td><td>{trade.trailGapPoints === undefined ? "—" : `${num.format(trade.trailGapPoints)} pts`}</td>
        <td>{trade.breakevenReached === undefined ? "—" : trade.breakevenReached ? "Yes" : "No"}</td><td>₹{num.format(trade.startTarget)}</td>
        <td>₹{num.format(trade.startStopLoss)}</td><td>₹{num.format(trade.endStopLoss)}</td><td>{trade.entryTime || "—"}</td><td>{trade.exitTime || "—"}</td>
        <td>{premium(trade.exitPremium)}</td><td>{trade.exitReason || "—"}</td><td>{trade.stopLossAdjustments}</td>
        <td className={(trade.grossPnl ?? 0) >= 0 ? styles.profit : styles.loss}>{pnl(trade.grossPnl)}</td><td>{trade.charges === undefined ? "—" : `₹${money.format(trade.charges)}`}</td>
        <td className={trade.totalPnl >= 0 ? styles.profit : styles.loss}>{pnl(trade.totalPnl)}</td>
      </tr>)}
      {!displayed.length && <tr><td className={styles.empty} colSpan={25}>No trades match the selected filters.</td></tr>}
    </tbody></table></div>
    <p className={styles.footnote}>Paper mode only. Breakeven means the trailing stop reached the actual entry premium on a completed-bar basis; net P/L may still be negative after charges/slippage. No broker order is placed.</p>
  </section>;
}
