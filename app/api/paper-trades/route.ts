/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

const RAW_ROOT =
  "https://raw.githubusercontent.com/imvishalmittal/nifty-options-lab/main/public";

export const dynamic = "force-dynamic";

async function fetchJson(path: string, required = true) {
  const response = await fetch(`${RAW_ROOT}/${path}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    if (!required) return null;
    throw new Error(`${path} unavailable (${response.status})`);
  }
  return response.json();
}

function normalizeIdeaTrade(trade: any, strategyVersion: string, fallbackStrategy: string) {
  return {
    source: "PAPER",
    strategy: trade.strategy ?? fallbackStrategy,
    strategyVersion,
    date: trade.date,
    indexStockName: "NIFTY 50",
    weeklyExpiry: trade.expiry,
    lots: Number(trade.lots),
    callType: trade.side,
    strikePrice: Number(trade.strike),
    startTarget: Number(trade.entryPremium),
    startStopLoss: Number(trade.initialStop),
    endStopLoss: Number(trade.exitPremium ?? trade.initialStop),
    entryTime: trade.entryTime ?? trade.signalTime,
    exitTime: trade.exitTime,
    stopLossAdjustments: 0,
    totalPnl: Number(trade.totalPnl),
    entryPremium: Number(trade.entryPremium),
    exitPremium: Number(trade.exitPremium),
    exitReason: trade.exitReason,
    grossPnl: Number(trade.grossPnl),
    charges: Number(trade.charges),
  };
}

function buildIdeaSessions(trades: any[], thread: "IDEA10" | "IDEA15", strategyVersion: string) {
  const byDate = new Map<string, any>();
  for (const trade of trades) {
    if (!trade?.date) continue;
    const current = byDate.get(trade.date) ?? {
      date: trade.date,
      thread,
      strategyVersions: [strategyVersion],
      status: "CLOSED",
      reason: null,
      updatedAt: null,
      spot925: null,
      expiry: trade.weeklyExpiry ?? trade.expiry ?? null,
      referencePremium: null,
      ce: null,
      pe: null,
      side: trade.callType ?? trade.side ?? null,
      strike: Number.isFinite(Number(trade.strikePrice ?? trade.strike)) ? Number(trade.strikePrice ?? trade.strike) : null,
      entry: Number.isFinite(Number(trade.entryPremium)) ? Number(trade.entryPremium) : null,
      entryTime: trade.entryTime ?? trade.signalTime ?? null,
      signalSource: "PAPER_TRADE",
      tradeCount: 0,
      totalPnl: 0,
      strategyOutcomes: {
        [strategyVersion]: { tradeCount: 0, totalPnl: 0 },
      },
    };
    current.tradeCount += 1;
    current.totalPnl += Number(trade.totalPnl) || 0;
    current.strategyOutcomes[strategyVersion].tradeCount += 1;
    current.strategyOutcomes[strategyVersion].totalPnl += Number(trade.totalPnl) || 0;
    if (!current.updatedAt || String(trade.exitTime ?? "") > String(current.updatedAt)) {
      current.updatedAt = trade.exitTime ?? current.updatedAt;
    }
    byDate.set(trade.date, current);
  }
  return [...byDate.values()];
}

export async function GET() {
  try {
    const [
      ledger,
      sessionJournal,
      idea10Paper,
      idea15Paper,
      openingRangeShadow,
      profitOnlyPaper,
      profitOnlyBacktest,
    ] = await Promise.all([
      fetchJson("paper/trades.json"),
      fetchJson("paper/sessions.json", false),
      fetchJson("paper/idea10-trades.json", false),
      fetchJson("paper/idea15-trades.json", false),
      fetchJson("paper/opening-range-shadow.json", false),
      fetchJson("paper/profit-only-directional.json", false),
      fetchJson("research/profit-only-directional-2020-2024.json", false),
    ]);

    const idea10Trades = Array.isArray(idea10Paper?.trades)
      ? idea10Paper.trades.map((trade: any) =>
          normalizeIdeaTrade(trade, "IDEA10A", "Idea 10 Dual-Chart EMA Confirmation"),
        )
      : [];
    const idea15Trades = Array.isArray(idea15Paper?.trades)
      ? idea15Paper.trades.map((trade: any) =>
          normalizeIdeaTrade(trade, "IDEA15_FIXED10", "Idea 15 Fixed10 EMA Break"),
        )
      : [];

    const baseSessions = Array.isArray(sessionJournal?.sessions) ? sessionJournal.sessions : [];
    const existingSessionKeys = new Set(
      baseSessions.map((session: any) => `${session.thread}:${session.date}`),
    );
    const ideaSessions = [
      ...buildIdeaSessions(idea10Trades, "IDEA10", "IDEA10A"),
      ...buildIdeaSessions(idea15Trades, "IDEA15", "IDEA15_FIXED10"),
    ].filter((session) => !existingSessionKeys.has(`${session.thread}:${session.date}`));

    return NextResponse.json(
      {
        meta: ledger?.meta ?? {},
        trades: [
          ...(Array.isArray(ledger?.trades) ? ledger.trades : []),
          ...idea10Trades,
          ...idea15Trades,
        ],
        sessions: [...baseSessions, ...ideaSessions],
        sessionMeta: sessionJournal?.meta ?? {},
        openingRangeShadow: openingRangeShadow ?? { meta: {}, sessions: [] },
        profitOnlyPaper: profitOnlyPaper ?? { meta: {}, sessions: [] },
        profitOnlyBacktest: profitOnlyBacktest ?? { variants: [] },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Live paper journal unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
