"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./profit-only-ledger.module.css";

type BacktestVariant = {
  key: string; label: string; trades: number; normalNetPnl: number; stress0_5NetPnl: number;
  stress1_0NetPnl: number; profitFactor: number; maxDrawdown: number; directionalLossTrades: number;
  amountInvested: { minimum: number; average: number; maximum: number };
  tradeNetPnl: { minimum: number; average: number; maximum: number };
};
type PaperTrade = { side: string; contract: string; amountInvested: number; normalNetPnl: number; entryPremium: number; exitPremium: number; exitReason: string };
type PaperSession = { date: string; status: string; reason?: string | null; strategies: Record<string, PaperTrade | null> };
type Payload = { profitOnlyBacktest?: { period?: { startDate: string; endDate: string }; variants?: BacktestVariant[] }; profitOnlyPaper?: { meta?: Record<string, unknown>; sessions?: PaperSession[] } };
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const pnl = (value: number) => `${value >= 0 ? "+" : "−"}₹${money.format(Math.abs(value))}`;

export default function ProfitOnlyLedger() {
  const [data, setData] = useState<Payload>({});
  useEffect(() => { fetch(`/api/paper-trades?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject()).then(setData).catch(() => {}); }, []);
  const variants = data.profitOnlyBacktest?.variants ?? [];
  const sessions = data.profitOnlyPaper?.sessions ?? [];
  const paperRows = useMemo(() => sessions.flatMap((session) => Object.entries(session.strategies ?? {}).map(([key, trade]) => ({ date: session.date, status: session.status, key, trade }))), [sessions]);
  const totals = useMemo(() => Object.fromEntries(variants.map((variant) => [variant.key, paperRows.filter((row) => row.key === variant.key && row.trade).reduce((sum, row) => sum + (row.trade?.normalNetPnl ?? 0), 0)])), [paperRows, variants]);
  return <section className={styles.wrap}>
    <div className={styles.heading}><div><p>New prospective lane</p><h2>Robust directional strategies</h2><span>Historical discovery and forward paper results remain separate. ₹60,000 model capital per strategy; no broker orders.</span></div><strong>Paper since 8 Sep 2026</strong></div>
    <h3>2020–2024 backtest</h3>
    <div className={styles.tableWrap}><table><thead><tr><th>Strategy</th><th>Trades</th><th>Normal</th><th>0.5 stress</th><th>1.0 stress</th><th>PF</th><th>Max DD</th><th>Invested min / avg / max</th><th>Trade P/L min / avg / max</th></tr></thead><tbody>
      {variants.map((row) => <tr key={row.key}><td><strong>{row.label}</strong><small>{row.directionalLossTrades} directional-loss trades; economically profitable under all stresses</small></td><td>{row.trades}</td><td className={styles.good}>{pnl(row.normalNetPnl)}</td><td className={styles.good}>{pnl(row.stress0_5NetPnl)}</td><td className={styles.good}>{pnl(row.stress1_0NetPnl)}</td><td>{row.profitFactor.toFixed(3)}</td><td>{pnl(-row.maxDrawdown)}</td><td>₹{money.format(row.amountInvested.minimum)} / ₹{money.format(row.amountInvested.average)} / ₹{money.format(row.amountInvested.maximum)}</td><td>{pnl(row.tradeNetPnl.minimum)} / {pnl(row.tradeNetPnl.average)} / {pnl(row.tradeNetPnl.maximum)}</td></tr>)}
    </tbody></table></div>
    <div className={styles.paperTitle}><div><h3>Prospective paper journal</h3><p>2025–2026 validation runs independently; paper entries are not historical backfills.</p></div>{variants.map((row) => <span key={row.key}>{row.label}: <b className={(totals[row.key] ?? 0) >= 0 ? styles.good : styles.bad}>{pnl(totals[row.key] ?? 0)}</b></span>)}</div>
    <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Strategy</th><th>Status</th><th>Side / contract</th><th>Invested</th><th>Entry → exit</th><th>Exit</th><th>Net P/L</th></tr></thead><tbody>
      {paperRows.map((row) => <tr key={`${row.date}:${row.key}`}><td>{row.date}</td><td>{variants.find((v) => v.key === row.key)?.label ?? row.key}</td><td>{row.trade ? "TRADED" : row.status.replace("_", " ")}</td><td>{row.trade ? `${row.trade.side} · ${row.trade.contract}` : "—"}</td><td>{row.trade ? `₹${money.format(row.trade.amountInvested)}` : "—"}</td><td>{row.trade ? `₹${row.trade.entryPremium} → ₹${row.trade.exitPremium}` : "—"}</td><td>{row.trade?.exitReason ?? "—"}</td><td className={(row.trade?.normalNetPnl ?? 0) >= 0 ? styles.good : styles.bad}>{row.trade ? pnl(row.trade.normalNetPnl) : "—"}</td></tr>)}
      {!paperRows.length && <tr><td colSpan={8}>No prospective session has been journalled yet.</td></tr>}
    </tbody></table></div>
  </section>;
}
