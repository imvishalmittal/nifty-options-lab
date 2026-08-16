import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || '/tmp/nifty-stepped-backfill';
const journalPath = process.argv[3] || 'public/paper/trades.json';
const capital = String(process.env.CAPITAL || 60000);
const year = String(process.env.BACKFILL_YEAR || '2025');
const trailGap = Number(process.env.TRAIL_GAP || 20);
const steps = String(process.env.TRAIL_STEPS || '5,10').split(',').map(Number).filter(Number.isFinite);

function rowFromTrade(trade, step) {
  const costs = trade.costs ?? trade.capitalScenarios?.[capital]?.currentCosts;
  const lots = Number(trade.lots ?? trade.capitalScenarios?.[capital]?.lots);
  if (!costs || !(lots > 0)) return null;
  const peakPremium = Number.isFinite(Number(trade.peakPremium)) ? Number(trade.peakPremium) : undefined;
  const mfe = Number.isFinite(Number(trade.mfePoints)) ? Number(trade.mfePoints) :
    peakPremium !== undefined && Number.isFinite(Number(trade.entry)) ? peakPremium - Number(trade.entry) : undefined;
  const stopHistory = Array.isArray(trade.stopHistory) ? trade.stopHistory : [];
  return {
    source: 'BACKTEST',
    strategy: 'NIFTY ₹180 Stepped Trail V3',
    strategyVersion: 'V3',
    date: trade.date,
    indexStockName: 'NIFTY 50',
    weeklyExpiry: trade.expiry,
    lots,
    callType: trade.side,
    strikePrice: trade.contract?.strike,
    startTarget: Number((Number(trade.entry) + trailGap).toFixed(2)),
    startStopLoss: 160,
    endStopLoss: Number(Number(trade.finalStop).toFixed(2)),
    entryTime: trade.entryTime?.slice(11, 16) ?? '',
    exitTime: trade.exitTime?.slice(11, 16) ?? '',
    stopLossAdjustments: Math.max(0, stopHistory.length - 1),
    totalPnl: Number(Number(costs.netPnl).toFixed(2)),
    entryPremium: Number(trade.entry),
    peakPremium: peakPremium === undefined ? undefined : Number(peakPremium.toFixed(2)),
    maxFavorableMove: mfe === undefined ? undefined : Number(mfe.toFixed(2)),
    breakevenReached: mfe === undefined ? undefined : mfe >= trailGap,
    trailGapPoints: trailGap,
    trailStepPoints: step,
    exitPremium: Number(trade.exit),
    exitReason: trade.result,
    grossPnl: Number(Number(costs.grossPnl).toFixed(2)),
    charges: Number(Number(costs.charges?.total ?? 0).toFixed(2)),
  };
}

const generated = [];
for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory())) {
  const resultPath = path.join(root, entry.name, 'result.json');
  if (!fs.existsSync(resultPath)) continue;
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  for (const step of steps) {
    const variant = result.variants?.[String(step)];
    if (!variant?.trades) throw new Error(`${entry.name} does not contain stepped variant ${step}`);
    for (const trade of variant.trades) {
      const row = rowFromTrade(trade, step);
      if (row) generated.push(row);
    }
  }
}

let existing = { meta: {}, trades: [] };
if (fs.existsSync(journalPath)) existing = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
const preserved = (existing.trades ?? []).filter((row) =>
  row.source === 'PAPER' || row.strategy !== 'NIFTY ₹180 Stepped Trail V3' || !String(row.date).startsWith(`${year}-`)
);
const trades = [...preserved, ...generated].sort((a, b) =>
  a.date.localeCompare(b.date) || String(a.strategy).localeCompare(String(b.strategy)) || Number(a.trailStepPoints ?? 0) - Number(b.trailStepPoints ?? 0)
);
const output = {
  meta: {
    ...existing.meta,
    paperMode: true,
    [`backfillV3${year}Rows`]: generated.length,
    [`backfillV3${year}UpdatedAt`]: new Date().toISOString(),
  },
  trades,
};
fs.mkdirSync(path.dirname(journalPath), { recursive: true });
fs.writeFileSync(journalPath, JSON.stringify(output, null, 2));
console.log(`Backfilled ${generated.length} validated ${year} V3 stepped rows (${steps.join('/')} point steps)`);
