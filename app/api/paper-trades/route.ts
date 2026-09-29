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

    return NextResponse.json(
      {
        meta: ledger?.meta ?? {},
        trades: [
          ...(Array.isArray(ledger?.trades) ? ledger.trades : []),
          ...idea10Trades,
          ...idea15Trades,
        ],
        sessions: Array.isArray(sessionJournal?.sessions) ? sessionJournal.sessions : [],
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
