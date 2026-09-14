import fs from 'node:fs';

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function calendarDaysToExpiry(date, expiry) {
  const start = Date.parse(`${date}T00:00:00Z`);
  const end = Date.parse(`${expiry}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86_400_000) : null;
}

export function auditExpiryDistance(payload) {
  const source = (payload?.trades ?? []).filter((row) => row.source === 'BACKTEST'
    && row.strategy === 'NIFTY ₹180 Momentum V2');
  const byDate = new Map();
  const duplicateDates = [];
  for (const row of source) {
    if (byDate.has(row.date)) duplicateDates.push(row.date);
    else byDate.set(row.date, row);
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const groups = new Map();
  for (const row of rows) {
    const distance = calendarDaysToExpiry(row.date, row.weeklyExpiry);
    if (!Number.isInteger(distance) || distance < 0) continue;
    if (!groups.has(distance)) groups.set(distance, []);
    groups.get(distance).push(row);
  }
  const buckets = Object.fromEntries([...groups.entries()].sort(([a], [b]) => a - b).map(([distance, trades]) => {
    const pnl = trades.map((row) => Number(row.totalPnl)).filter(Number.isFinite);
    return [distance, {
      calendarDaysToExpiry: distance,
      trades: pnl.length,
      winners: pnl.filter((value) => value > 0).length,
      winRate: pnl.length ? pnl.filter((value) => value > 0).length / pnl.length : null,
      totalNetPnl: pnl.reduce((sum, value) => sum + value, 0),
      averageNetPnl: mean(pnl),
      medianNetPnl: median(pnl),
    }];
  }));
  const profitable = Object.values(buckets).filter((row) => row.totalNetPnl > 0);
  return {
    schemaVersion: 1,
    study: 'Idea 8 expiry-distance audit',
    measurement: 'calendar days, not trading sessions',
    sourceRows: source.length,
    independentV2Sessions: rows.length,
    duplicateV2Dates: duplicateDates,
    period: rows.length ? { startDate: rows[0].date, endDate: rows.at(-1).date } : null,
    buckets,
    diagnostics: {
      profitableBuckets: profitable.map((row) => row.calendarDaysToExpiry),
      largestProfitableBucketSample: Math.max(0, ...profitable.map((row) => row.trades)),
      minimumRequiredTrades: 100,
      stressScenariosAvailable: false,
    },
    decision: profitable.some((row) => row.trades >= 100)
      ? 'ELIGIBLE_FOR_SEPARATELY_FROZEN_REPLICATION'
      : 'DESCRIPTIVE_ONLY_INSUFFICIENT_INDEPENDENT_SAMPLE',
  };
}

if (process.argv[1]?.endsWith('new-ideas-expiry-audit.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const result = auditExpiryDistance(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
