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
  return {
    source: 'BACKTEST',
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
const output = {
  meta: {
    ...existing.meta,
    strategy: 'NIFTY ₹180 Momentum V2',
    capital: Number(capital),
    trailGapPoints: trailGap,
    paperMode: true,
    [`backfill${year}Rows`]: generated.length,
    [`backfill${year}UpdatedAt`]: new Date().toISOString(),
  },
  trades,
};
fs.mkdirSync(path.dirname(journalPath), { recursive: true });
fs.writeFileSync(journalPath, JSON.stringify(output, null, 2));
console.log(`Backfilled ${generated.length} validated ${year} rows`);
