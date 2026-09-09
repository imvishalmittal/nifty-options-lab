"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./profit-only-ledger.module.css";

type Scope = "DAY" | "MONTH" | "YEAR" | "ALL";
type Phase = "DISCOVERY" | "VALIDATION" | "PAPER";
type SideFilter = "BOTH" | "CE" | "PE";
type HistoryTrade = { phase: Exclude<Phase, "PAPER">; key: string; label: string; date: string; side: string; contract?: string | null; entryPremium: number; exitPremium: number; exitReason: string; normalNetPnl: number; stress0_5NetPnl: number; stress1_0NetPnl: number };
type PaperTrade = { side: string; contract: string; entryPremium: number; exitPremium: number; exitReason: string; normalNetPnl: number; stress0_5NetPnl: number; stress1_0NetPnl: number };
type PaperSession = { date: string; status: string; strategies: Record<string, PaperTrade | null> };

const paperDefinitions = [
  { key: "RETEST15_CONFIRM_BE_10", label: "Retest-15 · BE after +10", status: "Stopped after validation" },
  { key: "PREVIOUS_DAY_BREAK_CONFIRM_BE_10", label: "Previous-day break · BE after +10", status: "Stopped after validation" },
  { key: "RETEST15_TRAIL_5_AFTER_BE_10", label: "Retest-15 · 5-point trail", status: "Research rejected" },
  { key: "RETEST15_TRAIL_10_AFTER_BE_10", label: "Retest-15 · 10-point trail", status: "Research rejected" },
  { key: "PREVIOUS_DAY_BREAK_TRAIL_5_AFTER_BE_10", label: "Previous-day break · 5-point trail", status: "Research rejected" },
  { key: "PREVIOUS_DAY_BREAK_TRAIL_10_AFTER_BE_10", label: "Previous-day break · 10-point trail", status: "Research rejected" },
];
const strategyNames: Record<string, string> = {
  ORB15: "Opening-range breakout",
  RETEST15: "Retest-15",
  PREVIOUS_DAY_BREAK: "Previous-day break",
  REGIME_ORB_DEEP_ITM: "Regime ORB · deep ITM",
  VWAP_CONTINUATION: "VWAP continuation",
};
const exitNames: Record<string, string> = {
  CONFIRM_BE_10: "BE after +10",
  FINANCE_HALF_10: "sell half at +10",
  IMMEDIATE_BE: "immediate BE",
  TRAIL_5_AFTER_BE_10: "5-point trail after BE +10",
  TRAIL_10_AFTER_BE_10: "10-point trail after BE +10",
};
function definitionFor(key: string) {
  const known = paperDefinitions.find((row) => row.key === key);
  const signal = Object.keys(strategyNames).sort((a, b) => b.length - a.length).find((value) => key.startsWith(`${value}_`));
  const exit = signal ? key.slice(signal.length + 1) : "";
  return { key, label: known?.label ?? `${strategyNames[signal ?? ""] ?? key} · ${exitNames[exit] ?? exit}`, status: known?.status ?? "Research only · rejected" };
}
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const pnl = (value: number) => `${value >= 0 ? "+" : "−"}₹${money.format(Math.abs(value))}`;
const matches = (date: string, scope: Scope, period: string) => scope === "ALL" || (scope === "DAY" ? date === period : scope === "MONTH" ? date.startsWith(period) : date.startsWith(`${period}-`));
type SideRow = { date: string; side: string; normalNetPnl: number; stress0_5NetPnl: number; stress1_0NetPnl: number };

function SideComparison({ rows, granularity }: { rows: SideRow[]; granularity: "MONTH" | "YEAR" }) {
  const periods = Array.from(new Set(rows.map((row) => row.date.slice(0, granularity === "MONTH" ? 7 : 4)))).sort().reverse();
  const aggregate = (period: string, side: "CE" | "PE") => {
    const trades = rows.filter((row) => row.side === side && row.date.startsWith(period));
    return { trades: trades.length, winRate: trades.length ? trades.filter((row) => row.normalNetPnl > 0).length / trades.length * 100 : null,
      normal: trades.reduce((sum, row) => sum + row.normalNetPnl, 0), stress05: trades.reduce((sum, row) => sum + row.stress0_5NetPnl, 0), stress10: trades.reduce((sum, row) => sum + row.stress1_0NetPnl, 0) };
  };
  return <section className={styles.sideSection}><h3>{granularity === "MONTH" ? "Month-wise" : "Year-wise"} CE versus PE</h3><div className={styles.tableWrap}><table><thead><tr><th>{granularity === "MONTH" ? "Month" : "Year"}</th><th>CE trades / win rate</th><th>PE trades / win rate</th><th>CE normal</th><th>PE normal</th><th>CE 0.5</th><th>PE 0.5</th><th>CE 1.0</th><th>PE 1.0</th><th>Better normal side</th></tr></thead><tbody>{periods.map((period) => { const ce = aggregate(period, "CE"), pe = aggregate(period, "PE"); return <tr key={period}><td><strong>{period}</strong></td><td>{ce.trades} / {ce.winRate == null ? "—" : `${ce.winRate.toFixed(1)}%`}</td><td>{pe.trades} / {pe.winRate == null ? "—" : `${pe.winRate.toFixed(1)}%`}</td><td className={ce.normal >= 0 ? styles.good : styles.bad}>{ce.trades ? pnl(ce.normal) : "—"}</td><td className={pe.normal >= 0 ? styles.good : styles.bad}>{pe.trades ? pnl(pe.normal) : "—"}</td><td className={ce.stress05 >= 0 ? styles.good : styles.bad}>{ce.trades ? pnl(ce.stress05) : "—"}</td><td className={pe.stress05 >= 0 ? styles.good : styles.bad}>{pe.trades ? pnl(pe.stress05) : "—"}</td><td className={ce.stress10 >= 0 ? styles.good : styles.bad}>{ce.trades ? pnl(ce.stress10) : "—"}</td><td className={pe.stress10 >= 0 ? styles.good : styles.bad}>{pe.trades ? pnl(pe.stress10) : "—"}</td><td>{!ce.trades && !pe.trades ? "—" : ce.normal === pe.normal ? "Tie" : ce.normal > pe.normal ? "CE" : "PE"}</td></tr>; })}{!periods.length && <tr><td colSpan={10}>No CE/PE observations recorded for this phase.</td></tr>}</tbody></table></div></section>;
}

async function loadHistory() {
  const response = await fetch("/research/profit-only-history.json.gz", { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("Profit-only history is unavailable");
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).json();
}

export default function ProfitOnlyLedger() {
  const [history, setHistory] = useState<HistoryTrade[]>([]);
  const [historyStrategies, setHistoryStrategies] = useState<string[]>([]);
  const [paper, setPaper] = useState<PaperSession[]>([]);
  const [phase, setPhase] = useState<Phase>("DISCOVERY");
  const [scope, setScope] = useState<Scope>("YEAR");
  const [period, setPeriod] = useState("");
  const [sideFilter, setSideFilter] = useState<SideFilter>("BOTH");
  useEffect(() => {
    loadHistory().then((r) => { setHistoryStrategies(r.strategies ?? []); setHistory((r.trades ?? []).map((row: HistoryTrade) => { const key = row.key === "R" ? "RETEST15_CONFIRM_BE_10" : row.key === "P" ? "PREVIOUS_DAY_BREAK_CONFIRM_BE_10" : row.key; return { ...row, key, label: definitionFor(key).label }; })); }).catch(() => {});
    fetch(`/api/paper-trades?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).then((r) => setPaper(r.profitOnlyPaper?.sessions ?? [])).catch(() => {});
  }, []);
  const paperTrades = useMemo(() => paper.flatMap((session) => Object.entries(session.strategies ?? {}).flatMap(([key, trade]) => trade ? [{ ...trade, key, label: definitionFor(key).label, date: session.date, phase: "PAPER" as const }] : [])), [paper]);
  const phaseSource = phase === "PAPER" ? paperTrades : history.filter((row) => row.phase === phase);
  const source = sideFilter === "BOTH" ? phaseSource : phaseSource.filter((row) => row.side === sideFilter);
  const periods = useMemo(() => Array.from(new Set(source.map((row) => scope === "DAY" ? row.date : scope === "MONTH" ? row.date.slice(0, 7) : row.date.slice(0, 4)))).sort().reverse(), [source, scope]);
  const selected = scope === "ALL" ? "" : period && periods.includes(period) ? period : periods[0] ?? "";
  const rows = source.filter((row) => matches(row.date, scope, selected));
  const visibleKeys = phase === "PAPER" ? Array.from(new Set(phaseSource.map((row) => row.key))) : historyStrategies;
  const visibleDefinitions = visibleKeys.map(definitionFor).sort((a, b) => a.label.localeCompare(b.label));
  const summary = visibleDefinitions.map((definition) => {
    const trades = rows.filter((row) => row.key === definition.key);
    const normal = trades.reduce((sum, row) => sum + row.normalNetPnl, 0);
    const stress05 = trades.reduce((sum, row) => sum + row.stress0_5NetPnl, 0);
    const stress10 = trades.reduce((sum, row) => sum + row.stress1_0NetPnl, 0);
    return { ...definition, trades: trades.length, winners: trades.filter((row) => row.normalNetPnl > 0).length, normal, stress05, stress10 };
  });
  return <section className={styles.wrap}>
    <div className={styles.heading}><div><p>Dedicated evidence dashboard</p><h2>Profit-only strategies and trailing variants</h2><span>All tested configurations are available. Backtest and paper results are never combined; no broker orders.</span></div><strong>Updated 9 Sep 2026</strong></div>
    <div className={styles.alert}><strong>Research decision:</strong> all 25 configurations have completed discovery and 2025–2026 evidence. None passed the frozen promotion gates. Use the side filter to inspect CE/PE asymmetry without treating a post-result slice as validation.</div>
    <div className={styles.sideFilter}><span>Option side</span><div>{(["BOTH", "CE", "PE"] as SideFilter[]).map((value) => <button type="button" className={sideFilter === value ? styles.active : ""} onClick={() => setSideFilter(value)} key={value}>{value === "BOTH" ? "Both" : `${value} only`}</button>)}</div></div>
    <div className={styles.tabs}>{(["DISCOVERY", "VALIDATION", "PAPER"] as Phase[]).map((value) => <button type="button" className={phase === value ? styles.active : ""} onClick={() => { setPhase(value); setPeriod(""); }} key={value}>{value === "PAPER" ? "Paper trading" : value[0] + value.slice(1).toLowerCase()}</button>)}</div>
    <div className={styles.filters}><div>{(["DAY", "MONTH", "YEAR", "ALL"] as Scope[]).map((value) => <button type="button" className={scope === value ? styles.active : ""} onClick={() => { setScope(value); setPeriod(""); }} key={value}>{value === "ALL" ? "All time" : value[0] + value.slice(1).toLowerCase()}</button>)}</div>{scope !== "ALL" && <select value={selected} onChange={(event) => setPeriod(event.target.value)}>{periods.map((value) => <option key={value}>{value}</option>)}</select>}</div>
    <div className={styles.tableWrap}><table><thead><tr><th>Strategy</th><th>Status</th><th>Trades</th><th>Wins</th><th>Win rate</th><th>Normal P/L</th><th>0.5 stress</th><th>1.0 stress</th></tr></thead><tbody>{summary.map((row) => <tr key={row.key}><td><strong>{row.label}</strong></td><td><small>{row.status}</small></td><td>{row.trades}</td><td>{row.winners}</td><td>{row.trades ? `${(row.winners / row.trades * 100).toFixed(1)}%` : "—"}</td><td className={row.normal >= 0 ? styles.good : styles.bad}>{row.trades ? pnl(row.normal) : "—"}</td><td className={row.stress05 >= 0 ? styles.good : styles.bad}>{row.trades ? pnl(row.stress05) : "—"}</td><td className={row.stress10 >= 0 ? styles.good : styles.bad}>{row.trades ? pnl(row.stress10) : "—"}</td></tr>)}</tbody></table></div>
    <h3>Trade details</h3>
    <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Strategy</th><th>Side / contract</th><th>Entry → exit</th><th>Exit reason</th><th>Normal P/L</th><th>0.5 stress</th><th>1.0 stress</th></tr></thead><tbody>{rows.slice().sort((a, b) => b.date.localeCompare(a.date)).map((row, index) => <tr key={`${row.phase}:${row.key}:${row.date}:${index}`}><td>{row.date}</td><td>{row.label}</td><td>{row.side} · {row.contract ?? "—"}</td><td>₹{row.entryPremium} → ₹{row.exitPremium}</td><td>{row.exitReason}</td><td className={row.normalNetPnl >= 0 ? styles.good : styles.bad}>{pnl(row.normalNetPnl)}</td><td className={row.stress0_5NetPnl >= 0 ? styles.good : styles.bad}>{pnl(row.stress0_5NetPnl)}</td><td className={row.stress1_0NetPnl >= 0 ? styles.good : styles.bad}>{pnl(row.stress1_0NetPnl)}</td></tr>)}{!rows.length && <tr><td colSpan={8}>No trades recorded for this phase and period.</td></tr>}</tbody></table></div>
    <div className={styles.sideHeading}><p>Side comparison</p><h2>CE versus PE over time</h2><span>Compare trade count, win rate, and net P/L under all three execution scenarios. The active option-side filter applies; these tables otherwise use the complete selected phase.</span></div>
    <SideComparison rows={source} granularity="MONTH" />
    <SideComparison rows={source} granularity="YEAR" />
    <p className={styles.note}>Paper observations are experimental simulations. Historical discovery, untouched validation, and paper performance must be interpreted separately; strategy rows must not be added together as account profit. A stronger historical PE result is descriptive evidence, not permission to remove CE after seeing the outcome.</p>
  </section>;
}
