import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || '/tmp/nifty-momentum-backfill';
const journalPath = process.argv[3] || 'public/paper/trades.json';
const trailGap = Number(process.env.TRAIL_GAP || 20);
const capital = String(process.env.CAPITAL || 60000);
const year = String(process.env.BACKFILL_YEAR || '2025');

function rowFromTrade(trade) {
  const scenario = trade.capitalScenarios?.[capital];
  if (!scenario?.currentCosts || !(scenario.lots > 0)) return null;
  const peakPremium = Number.isFinite(Number(trade.peakPremium)) ? Number(trade.peakPremium) : null;
  const maxFavorableMove = Number.isFinite(Number(trade.mfePoints))
    ? Number(trade.mfePoints)
    : peakPremium !== null && Number.isFinite(Number(trade.entry))
      ? peakPremium - Number(trade.entry)
      : null;
  return {
    source: 'BACKTEST',
    strategy: 'NIFTY ₹180 Momentum V2',
    date: trade.date,
    indexStockName: 'NIFTY 50',
    weeklyExpiry: trade.expiry,
    lots: scenario.lots,
    callType: trade.side,
    strikePrice: trade.contract?.strike,
    startTarget: 220,
    startStopLoss: 160,
    endStopLoss: Number(trade.finalStop.toFixed(2)),
    entryTime: trade.entryTime?.slice(11, 16) ?? '',
    exitTime: trade.exitTime?.slice(11, 16) ?? '',
    stopLossAdjustments: Math.max(0, (trade.stopHistory?.length ?? 1) - 1),
    totalPnl: Number(scenario.currentCosts.netPnl.toFixed(2)),
    entryPremium: trade.entry,
    peakPremium: peakPremium === null ? undefined : Number(peakPremium.toFixed(2)),
    maxFavorableMove: maxFavorableMove === null ? undefined : Number(maxFavorableMove.toFixed(2)),
    breakevenReached: maxFavorableMove === null ? undefined : maxFavorableMove >= trailGap,
    trailGapPoints: trailGap,
    exitPremium: trade.exit,
    exitReason: trade.result,
  };
}

const generated = [];
for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory())) {
  const resultPath = path.join(root, entry.name, 'result.json');
  if (!fs.existsSync(resultPath)) continue;
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const variant = result.variants?.[String(trailGap)];
  if (!variant?.trades) throw new Error(`${entry.name} does not contain trail variant ${trailGap}`);
  for (const trade of variant.trades) {
    const row = rowFromTrade(trade);
    if (row) generated.push(row);
  }
}

let existing = { meta: {}, trades: [] };
if (fs.existsSync(journalPath)) existing = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
const preserved = (existing.trades ?? []).filter((row) => row.source === 'PAPER' || !String(row.date).startsWith(`${year}-`));
const trades = [...preserved, ...generated].sort((a, b) => a.date.localeCompare(b.date) || a.callType.localeCompare(b.callType));
const historicalDates = trades.filter((row) => row.source === 'BACKTEST').map((row) => row.date).filter(Boolean).sort();
const output = {
  meta: {
    ...existing.meta,
    strategy: 'NIFTY ₹180 Momentum V2',
    capital: Number(capital),
    trailGapPoints: trailGap,
    backfillThrough: historicalDates.at(-1) ?? existing.meta?.backfillThrough,
    paperMode: true,
    [`backfill${year}Rows`]: generated.length,
    [`backfill${year}UpdatedAt`]: new Date().toISOString(),
  },
  trades,
};
fs.mkdirSync(path.dirname(journalPath), { recursive: true });
fs.writeFileSync(journalPath, JSON.stringify(output, null, 2));
console.log(`Backfilled ${generated.length} validated ${year} rows with peak/MFE metrics`);
