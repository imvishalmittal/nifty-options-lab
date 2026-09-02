"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./paper-ledger.module.css";

type CallType = "CE" | "PE";
type DataSource = "proxy" | "published" | null;
type SessionThread = "BASE" | "V4";
type Scope = "DATE" | "MONTH" | "YEAR" | "ALL";
type SortDir = "asc" | "desc";
type SortKey = "strategy" | "cohort" | "status" | "sessions" | "trades" | "winsLosses" | "winRate" | "pf" | "total" | "drawdown" | "contract" | "entryExit" | "exitReason";
type PaperTrade = { strategy?: string; strategyVersion?: string; date: string; indexStockName: string; weeklyExpiry: string; lots: number; callType: CallType; strikePrice: number; startTarget: number; startStopLoss: number; endStopLoss: number; entryTime: string; exitTime: string; stopLossAdjustments: number; totalPnl: number; entryPremium?: number; peakPremium?: number; maxFavorableMove?: number; trailStepPoints?: number; trailGapPoints?: number; breakevenReached?: boolean; exitPremium?: number; exitReason?: string; grossPnl?: number; charges?: number };
type SessionContract = { symbol: string; strike?: number; optionType?: CallType; premium?: number };
type PaperSession = { date: string; thread: SessionThread; strategyVersions: string[]; status: string; reason?: string | null; updatedAt?: string | null; spot925?: number | null; expiry?: string | null; referencePremium?: number | null; ce?: SessionContract | null; pe?: SessionContract | null; side?: CallType | null; strike?: number | null; entry?: number | null; entryTime?: string | null; signalSource?: string | null; tradeCount: number; totalPnl?: number | null; strategyOutcomes?: Record<string, { tradeCount: number; totalPnl: number | null }> };
type StrategyKey = "V2" | "V3-5" | "V3-10" | "V4" | "V5-10" | "V6" | "V7-10" | "V8-10" | "V9" | "V10-5" | "V10-10" | "V11";
type StrategyDefinition = { key: StrategyKey; label: string; shortRule: string; cohort: "₹160 / ₹220" | "₹170 / ₹210" | "NIFTY confirmed"; thread: SessionThread; sessionKey: string };

const strategies: StrategyDefinition[] = [
  { key: "V2", label: "V2 · Momentum trail", shortRule: "₹160 initial stop · continuous trail", cohort: "₹160 / ₹220", thread: "BASE", sessionKey: "V2" },
  { key: "V3-5", label: "V3-5 · Stepped trail", shortRule: "₹160 initial stop · 5-point steps", cohort: "₹160 / ₹220", thread: "BASE", sessionKey: "V3-5" },
  { key: "V3-10", label: "V3-10 · Stepped trail", shortRule: "₹160 initial stop · 10-point steps", cohort: "₹160 / ₹220", thread: "BASE", sessionKey: "V3-10" },
  { key: "V4", label: "V4 · Confirmed fail-fast", shortRule: "NIFTY confirmation · fail-fast exit", cohort: "NIFTY confirmed", thread: "V4", sessionKey: "V4" },
  { key: "V5-10", label: "V5-10 · Confirmed stepped", shortRule: "NIFTY confirmation · 10-point steps", cohort: "NIFTY confirmed", thread: "V4", sessionKey: "V5" },
  { key: "V6", label: "V6 · Fixed 2R", shortRule: "₹160 initial stop · entry-relative 2R", cohort: "₹160 / ₹220", thread: "BASE", sessionKey: "V6" },
  { key: "V7-10", label: "V7-10 · Failure exit", shortRule: "15-minute failure exit · 10-point steps", cohort: "₹160 / ₹220", thread: "BASE", sessionKey: "V7" },
  { key: "V8-10", label: "V8-10 · Capped risk", shortRule: "Entry-capped risk · 10-point steps", cohort: "₹160 / ₹220", thread: "BASE", sessionKey: "V8" },
  { key: "V9", label: "V9 · 170/210 momentum", shortRule: "₹170 stop · ₹210 activation · continuous trail", cohort: "₹170 / ₹210", thread: "BASE", sessionKey: "V9" },
  { key: "V10-5", label: "V10-5 · 170/210 stepped", shortRule: "₹170 stop · ₹210 activation · 5-point steps", cohort: "₹170 / ₹210", thread: "BASE", sessionKey: "V10-5" },
  { key: "V10-10", label: "V10-10 · 170/210 stepped", shortRule: "₹170 stop · ₹210 activation · 10-point steps", cohort: "₹170 / ₹210", thread: "BASE", sessionKey: "V10-10" },
  { key: "V11", label: "V11 · 170-stop fixed 2R", shortRule: "₹170 stop · entry-relative 2R target", cohort: "₹170 / ₹210", thread: "BASE", sessionKey: "V11" },
];

const comparisonColumns: Array<{ key: SortKey; label: string }> = [
  { key: "strategy", label: "Strategy" },
  { key: "cohort", label: "Policy family" },
  { key: "status", label: "Status" },
  { key: "sessions", label: "Sessions" },
  { key: "trades", label: "Trades" },
  { key: "winsLosses", label: "W / L" },
  { key: "winRate", label: "Win rate" },
  { key: "pf", label: "PF" },
  { key: "total", label: "Net P/L" },
  { key: "drawdown", label: "Max DD" },
  { key: "contract", label: "Contract" },
  { key: "entryExit", label: "Entry → exit" },
  { key: "exitReason", label: "Exit reason" },
];

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const premium = (value?: number | null) => value == null ? "—" : `₹${num.format(value)}`;
const pnl = (value?: number | null) => value == null ? "—" : `${value >= 0 ? "+" : "−"}₹${money.format(Math.abs(value))}`;
const optionalNumber = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? undefined : Number(value);

function normalizeTrade(value: unknown): PaperTrade | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PaperTrade>;
  if (!row.date || !row.indexStockName || !row.weeklyExpiry || (row.callType !== "CE" && row.callType !== "PE")) return null;
  for (const key of ["lots", "strikePrice", "startTarget", "startStopLoss", "endStopLoss", "stopLossAdjustments", "totalPnl"] as const) if (!Number.isFinite(Number(row[key]))) return null;
  return { strategy: row.strategy ? String(row.strategy) : undefined, strategyVersion: row.strategyVersion ? String(row.strategyVersion) : undefined, date: String(row.date), indexStockName: String(row.indexStockName), weeklyExpiry: String(row.weeklyExpiry), lots: Number(row.lots), callType: row.callType, strikePrice: Number(row.strikePrice), startTarget: Number(row.startTarget), startStopLoss: Number(row.startStopLoss), endStopLoss: Number(row.endStopLoss), entryTime: String(row.entryTime ?? ""), exitTime: String(row.exitTime ?? ""), stopLossAdjustments: Number(row.stopLossAdjustments), totalPnl: Number(row.totalPnl), entryPremium: optionalNumber(row.entryPremium), peakPremium: optionalNumber(row.peakPremium), maxFavorableMove: optionalNumber(row.maxFavorableMove), trailStepPoints: optionalNumber(row.trailStepPoints), trailGapPoints: optionalNumber(row.trailGapPoints), breakevenReached: typeof row.breakevenReached === "boolean" ? row.breakevenReached : undefined, exitPremium: optionalNumber(row.exitPremium), exitReason: row.exitReason ? String(row.exitReason) : undefined, grossPnl: optionalNumber(row.grossPnl), charges: optionalNumber(row.charges) };
}
function normalizeContract(value: unknown): SessionContract | null {
  if (!value || typeof value !== "object") return null; const row = value as Partial<SessionContract>; if (!row.symbol) return null;
  return { symbol: String(row.symbol), strike: optionalNumber(row.strike), optionType: row.optionType === "CE" || row.optionType === "PE" ? row.optionType : undefined, premium: optionalNumber(row.premium) };
}
function normalizeSession(value: unknown): PaperSession | null {
  if (!value || typeof value !== "object") return null; const row = value as Partial<PaperSession>;
  if (!row.date || (row.thread !== "BASE" && row.thread !== "V4") || !row.status) return null;
  const outcomes = row.strategyOutcomes && typeof row.strategyOutcomes === "object" ? Object.fromEntries(Object.entries(row.strategyOutcomes).map(([key, value]) => { const outcome = value && typeof value === "object" ? value as { tradeCount?: unknown; totalPnl?: unknown } : {}; return [key, { tradeCount: Number.isFinite(Number(outcome.tradeCount)) ? Number(outcome.tradeCount) : 0, totalPnl: optionalNumber(outcome.totalPnl) ?? null }]; })) : undefined;
  return { date: String(row.date), thread: row.thread, strategyVersions: Array.isArray(row.strategyVersions) ? row.strategyVersions.map(String) : [], status: String(row.status), reason: row.reason ? String(row.reason) : null, updatedAt: row.updatedAt ? String(row.updatedAt) : null, spot925: optionalNumber(row.spot925) ?? null, expiry: row.expiry ? String(row.expiry) : null, referencePremium: optionalNumber(row.referencePremium) ?? null, ce: normalizeContract(row.ce), pe: normalizeContract(row.pe), side: row.side === "CE" || row.side === "PE" ? row.side : null, strike: optionalNumber(row.strike) ?? null, entry: optionalNumber(row.entry) ?? null, entryTime: row.entryTime ? String(row.entryTime) : null, signalSource: row.signalSource ? String(row.signalSource) : null, tradeCount: Number.isFinite(Number(row.tradeCount)) ? Number(row.tradeCount) : 0, totalPnl: optionalNumber(row.totalPnl) ?? null, strategyOutcomes: outcomes };
}
function tradeKey(trade: PaperTrade): StrategyKey | null {
  const version = trade.strategyVersion ?? "";
  if (version === "V3") return trade.trailStepPoints === 5 ? "V3-5" : "V3-10";
  if (version === "V5") return "V5-10"; if (version === "V7") return "V7-10"; if (version === "V8") return "V8-10";
  if (version === "V10") return trade.trailStepPoints === 5 ? "V10-5" : "V10-10";
  if (["V2", "V4", "V6", "V9", "V11"].includes(version)) return version as StrategyKey;
  const name = trade.strategy ?? "";
  if (name.includes(" V3")) return trade.trailStepPoints === 5 ? "V3-5" : "V3-10";
  if (name.includes(" V5")) return "V5-10"; if (name.includes(" V7")) return "V7-10"; if (name.includes(" V8")) return "V8-10";
  if (name.includes(" V10")) return trade.trailStepPoints === 5 ? "V10-5" : "V10-10";
  return (["V2", "V4", "V6", "V9", "V11"] as StrategyKey[]).find((key) => name.includes(` ${key}`)) ?? null;
}
function maxDrawdown(trades: PaperTrade[]) { let equity = 0, peak = 0, drawdown = 0; [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.entryTime.localeCompare(b.entryTime)).forEach((trade) => { equity += trade.totalPnl; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); }); return drawdown; }
function scopeLabel(scope: Scope, date: string, month: string, year: string) { if (scope === "DATE") return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }); if (scope === "MONTH") return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); return scope === "YEAR" ? year : "All recorded paper sessions"; }
function rowStatus(row: { trades: PaperTrade[]; session?: PaperSession }) { return row.trades.length ? "TRADED" : row.session?.status ?? "NO RECORD"; }
function compareSortValues(a: string | number | null, b: string | number | null, direction: SortDir) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

export default function PaperLedger() {
  const [rows, setRows] = useState<PaperTrade[]>([]); const [sessions, setSessions] = useState<PaperSession[]>([]); const [scope, setScope] = useState<Scope>("DATE");
  const [date, setDate] = useState(""); const [month, setMonth] = useState(""); const [year, setYear] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("strategy"); const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [lastUpdated, setLastUpdated] = useState("—"); const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading"); const [dataSource, setDataSource] = useState<DataSource>(null);
  useEffect(() => { let active = true; const apply = (payload: unknown, source: Exclude<DataSource, null>) => { const object = payload && typeof payload === "object" ? payload as { trades?: unknown[]; sessions?: unknown[] } : {}; const nextRows = (Array.isArray(object.trades) ? object.trades : []).map(normalizeTrade).filter(Boolean) as PaperTrade[]; const nextSessions = (Array.isArray(object.sessions) ? object.sessions : []).map(normalizeSession).filter(Boolean) as PaperSession[]; if (!nextRows.length && !nextSessions.length) return false; if (active) { setRows(nextRows); setSessions(nextSessions); setLastUpdated(new Date().toLocaleString("en-IN")); setLoadState("ok"); setDataSource(source); } return true; };
    const load = async () => { try { const response = await fetch(`/api/paper-trades?t=${Date.now()}`, { cache: "no-store" }); if (response.ok && apply(await response.json(), "proxy")) return; } catch {} try { const [ledgerResponse, sessionsResponse] = await Promise.all([fetch(`/paper/trades.json?t=${Date.now()}`, { cache: "no-store" }), fetch(`/paper/sessions.json?t=${Date.now()}`, { cache: "no-store" })]); if (!ledgerResponse.ok) throw new Error(); const ledger = await ledgerResponse.json(); const journal = sessionsResponse.ok ? await sessionsResponse.json() : { sessions: [] }; if (apply({ trades: ledger.trades ?? ledger, sessions: journal.sessions ?? [] }, "published")) return; } catch {} if (active) { setLoadState("error"); setDataSource(null); } };
    load(); const timer = window.setInterval(load, 60_000); return () => { active = false; window.clearInterval(timer); }; }, []);
  const allDates = useMemo(() => Array.from(new Set([...rows.map((row) => row.date), ...sessions.map((session) => session.date)])).sort().reverse(), [rows, sessions]);
  const years = useMemo(() => Array.from(new Set(allDates.map((value) => value.slice(0, 4)))).sort().reverse(), [allDates]); const months = useMemo(() => Array.from(new Set(allDates.map((value) => value.slice(0, 7)))).sort().reverse(), [allDates]);
  const selectedDate = date || allDates[0] || ""; const selectedMonth = month || months[0] || ""; const selectedYear = year || years[0] || "";
  const scopedTrades = useMemo(() => rows.filter((row) => scope === "DATE" ? row.date === selectedDate : scope === "MONTH" ? row.date.startsWith(selectedMonth) : scope === "YEAR" ? row.date.startsWith(`${selectedYear}-`) : true), [rows, scope, selectedDate, selectedMonth, selectedYear]);
  const scopedSessions = useMemo(() => sessions.filter((session) => scope === "DATE" ? session.date === selectedDate : scope === "MONTH" ? session.date.startsWith(selectedMonth) : scope === "YEAR" ? session.date.startsWith(`${selectedYear}-`) : true), [sessions, scope, selectedDate, selectedMonth, selectedYear]);
  const comparison = useMemo(() => strategies.map((strategy) => { const trades = scopedTrades.filter((trade) => tradeKey(trade) === strategy.key); const strategySessions = scopedSessions.filter((session) => session.thread === strategy.thread && (session.strategyVersions.includes(strategy.sessionKey) || session.strategyOutcomes?.[strategy.sessionKey] !== undefined)); const session = scope === "DATE" ? strategySessions[0] : undefined; const latestTrade = [...trades].sort((a, b) => b.date.localeCompare(a.date) || b.entryTime.localeCompare(a.entryTime))[0]; const wins = trades.filter((trade) => trade.totalPnl > 0).length, losses = trades.filter((trade) => trade.totalPnl < 0).length; const grossProfit = trades.reduce((sum, trade) => sum + Math.max(0, trade.totalPnl), 0), grossLoss = Math.abs(trades.reduce((sum, trade) => sum + Math.min(0, trade.totalPnl), 0)); const total = trades.reduce((sum, trade) => sum + trade.totalPnl, 0); return { strategy, trades, session, latestTrade, sessions: new Set(strategySessions.map((value) => value.date)).size, wins, losses, total, drawdown: maxDrawdown(trades), pf: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null }; }), [scopedTrades, scopedSessions, scope]);
  const sortedComparison = useMemo(() => [...comparison].sort((a, b) => {
    const sortValue = (row: typeof a): string | number | null => {
      const trade = row.latestTrade;
      if (sortKey === "strategy") return row.strategy.label;
      if (sortKey === "cohort") return row.strategy.cohort;
      if (sortKey === "status") return rowStatus(row);
      if (sortKey === "sessions") return row.sessions;
      if (sortKey === "trades") return row.trades.length;
      if (sortKey === "winsLosses") return row.wins;
      if (sortKey === "winRate") return row.trades.length ? row.wins / row.trades.length : null;
      if (sortKey === "pf") return row.pf;
      if (sortKey === "total") return row.trades.length ? row.total : null;
      if (sortKey === "drawdown") return row.trades.length ? row.drawdown : null;
      if (sortKey === "contract") return scope === "DATE" && trade ? trade.strikePrice : null;
      if (sortKey === "entryExit") return scope === "DATE" && trade ? trade.entryPremium ?? null : null;
      return scope === "DATE" && trade ? trade.exitReason ?? null : null;
    };
    const result = compareSortValues(sortValue(a), sortValue(b), sortDir);
    if (result !== 0) return result;
    if (sortKey === "winsLosses" && a.losses !== b.losses) return sortDir === "asc" ? a.losses - b.losses : b.losses - a.losses;
    return strategies.findIndex((strategy) => strategy.key === a.strategy.key) - strategies.findIndex((strategy) => strategy.key === b.strategy.key);
  }), [comparison, scope, sortDir, sortKey]);
  const activeRows = comparison.filter((row) => row.trades.length > 0); const best = [...activeRows].sort((a, b) => b.total - a.total)[0], worst = [...activeRows].sort((a, b) => a.total - b.total)[0];
  function sortBy(key: SortKey) { if (key === sortKey) setSortDir((value) => value === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } }
  return <section className={styles.ledger} id="trade-ledger">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Unified paper strategy view</p><h2>All strategies, one screen</h2><p>Compare every V2–V11 paper variant for one date, month, year, or the complete journal. A missing trade is shown explicitly instead of hiding the strategy.</p></div><div className={styles.status}><span className={loadState === "ok" ? styles.ok : styles.warn} />{loadState === "loading" ? "Loading…" : loadState === "error" ? "Journal unavailable" : `${dataSource === "proxy" ? "Live GitHub journal" : "Published snapshot"} · Updated ${lastUpdated}`}</div></div>
    <div className={styles.scopeTabs} role="group" aria-label="Time range">{(["DATE", "MONTH", "YEAR", "ALL"] as Scope[]).map((value) => <button key={value} type="button" className={scope === value ? styles.scopeActive : ""} onClick={() => setScope(value)}>{value === "ALL" ? "All time" : value[0] + value.slice(1).toLowerCase()}</button>)}</div>
    <div className={styles.periodBar}>{scope === "DATE" && <label><span>Selected date</span><select value={selectedDate} onChange={(event) => setDate(event.target.value)}>{allDates.map((value) => <option key={value} value={value}>{new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</option>)}</select></label>}{scope === "MONTH" && <label><span>Selected month</span><select value={selectedMonth} onChange={(event) => setMonth(event.target.value)}>{months.map((value) => <option key={value} value={value}>{new Date(`${value}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>)}</select></label>}{scope === "YEAR" && <label><span>Selected year</span><select value={selectedYear} onChange={(event) => setYear(event.target.value)}>{years.map((value) => <option key={value}>{value}</option>)}</select></label>}<div><span>Showing</span><strong>{selectedDate && selectedMonth && selectedYear ? scopeLabel(scope, selectedDate, selectedMonth, selectedYear) : "Loading journal…"}</strong></div></div>
    <div className={styles.summary}><div><span>Strategies shown</span><strong>{strategies.length}</strong></div><div><span>Strategies with trades</span><strong>{activeRows.length}</strong></div><div><span>Best in period</span><strong className={styles.profit}>{best ? `${best.strategy.key} · ${pnl(best.total)}` : "—"}</strong></div><div><span>Lowest in period</span><strong className={worst && worst.total < 0 ? styles.loss : styles.profit}>{worst ? `${worst.strategy.key} · ${pnl(worst.total)}` : "—"}</strong></div></div>
    <div className={styles.comparisonWrap}><table className={styles.comparisonTable}><thead><tr>{comparisonColumns.map((column) => <th key={column.key} aria-sort={sortKey === column.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => sortBy(column.key)}>{column.label}<span aria-hidden="true">{sortKey === column.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span></button></th>)}</tr></thead><tbody>{sortedComparison.map((row) => { const trade = row.latestTrade, status = rowStatus(row); return <tr key={row.strategy.key}><td className={styles.strategyCell}><strong>{row.strategy.label}</strong><span>{row.strategy.shortRule}</span>{!row.trades.length && row.session?.reason && <small>{row.session.reason}</small>}</td><td><span className={`${styles.cohortBadge} ${row.strategy.cohort === "₹170 / ₹210" ? styles.cohort170 : row.strategy.cohort === "NIFTY confirmed" ? styles.cohortConfirmed : ""}`}>{row.strategy.cohort}</span></td><td><span className={`${styles.sessionBadge} ${status === "TRADED" || status === "CLOSED" ? styles.sessionGood : status === "NO_TRADE" ? styles.sessionNeutral : styles.sessionWarn}`}>{status.replace("_", " ")}</span></td><td>{row.sessions}</td><td>{row.trades.length}</td><td>{row.wins} / {row.losses}</td><td>{row.trades.length ? `${money.format(row.wins / row.trades.length * 100)}%` : "—"}</td><td>{row.pf === Infinity ? "∞" : row.pf === null ? "—" : row.pf.toFixed(3)}</td><td className={row.total >= 0 ? styles.profit : styles.loss}>{row.trades.length ? pnl(row.total) : "—"}</td><td>{row.trades.length ? pnl(-row.drawdown) : "—"}</td><td>{scope === "DATE" && trade ? `${num.format(trade.strikePrice)} ${trade.callType}` : "—"}</td><td>{scope === "DATE" && trade ? `${premium(trade.entryPremium)} → ${premium(trade.exitPremium)}` : "—"}</td><td>{scope === "DATE" && trade ? trade.exitReason ?? "—" : "—"}</td></tr>; })}</tbody></table></div>
    <p className={styles.footnote}>Each row is a counterfactual strategy result; rows are not additive account profit. Month, year and all-time views aggregate only journalled paper trades. The ₹170/₹210 cohort starts on 1 September 2026 and is never backfilled.</p>
  </section>;
}
