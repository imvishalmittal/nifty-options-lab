import fs from 'node:fs';

function numeric(values) {
  return values.map(Number).filter(Number.isFinite);
}

function quantile(values, q) {
  const sorted = numeric(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
}

function stats(values) {
  const usable = numeric(values);
  if (!usable.length) return { count: 0, min: null, p25: null, median: null, p75: null, max: null, mean: null };
  return {
    count: usable.length,
    min: Math.min(...usable),
    p25: quantile(usable, 0.25),
    median: quantile(usable, 0.50),
    p75: quantile(usable, 0.75),
    max: Math.max(...usable),
    mean: usable.reduce((a, b) => a + b, 0) / usable.length,
  };
}

function groupBy(items, keyFn) {
  const out = new Map();
  for (const item of items) {
    const key = String(keyFn(item) ?? 'UNKNOWN');
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

function pearson(x, y) {
  const pairs = x.map((value, i) => [Number(value), Number(y[i])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 3) return null;
  const xs = pairs.map(([a]) => a);
  const ys = pairs.map(([, b]) => b);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

export function selectedContractForTrade(row) {
  if (row.side === 'CE') return row.callSelection ?? null;
  if (row.side === 'PE') return row.putSelection ?? null;
  return null;
}

export function normalizeOptionTrade(row) {
  const selected = selectedContractForTrade(row);
  if (!selected || row.status !== 'TRADE') return null;
  return {
    date: row.date,
    side: row.side,
    result: row.result,
    symbol: selected.symbol,
    strike: selected.strike,
    premium925: selected.premium,
    premiumDistanceFrom180: selected.premiumDistanceFrom180,
    volume925: selected.volume925,
    openInterest925: selected.openInterest925,
    signalClose: row.signalClose,
    entry: row.entry,
    confirmationToEntryDrift: Number.isFinite(Number(row.entry)) && Number.isFinite(Number(row.signalClose)) ? Number(row.entry) - Number(row.signalClose) : null,
    entryMinus180: Number.isFinite(Number(row.entry)) ? Number(row.entry) - 180 : null,
    pnlPerUnit: row.pnlPerUnit,
    grossPnlRupees: row.grossPnlRupees,
    netPnlRupees: row.costs?.currentGroww2026?.netPnl,
    netPnlStress0_5: row.costs?.slippageStress0_5?.netPnl,
    netPnlStress1_0: row.costs?.slippageStress1_0?.netPnl,
  };
}

function outcomeSummary(rows) {
  return {
    trades: rows.length,
    volume925: stats(rows.map((r) => r.volume925)),
    openInterest925: stats(rows.map((r) => r.openInterest925)),
    premiumDistanceFrom180: stats(rows.map((r) => r.premiumDistanceFrom180)),
    confirmationToEntryDrift: stats(rows.map((r) => r.confirmationToEntryDrift)),
    entryMinus180: stats(rows.map((r) => r.entryMinus180)),
    netPnlRupees: stats(rows.map((r) => r.netPnlRupees)),
  };
}

export function analyzeOptionLiquidity(results) {
  const trades = results.map(normalizeOptionTrade).filter(Boolean);
  const byOutcome = Object.fromEntries(
    [...groupBy(trades, (r) => r.result).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => [key, outcomeSummary(rows)]),
  );
  const bySide = Object.fromEntries(
    [...groupBy(trades, (r) => r.side).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => [key, outcomeSummary(rows)]),
  );

  const net = trades.map((r) => r.netPnlRupees);
  const logVolume = trades.map((r) => Number(r.volume925) > 0 ? Math.log(Number(r.volume925)) : NaN);
  const logOi = trades.map((r) => Number(r.openInterest925) > 0 ? Math.log(Number(r.openInterest925)) : NaN);
  return {
    trades: trades.length,
    overall: outcomeSummary(trades),
    byOutcome,
    bySide,
    exploratoryCorrelations: {
      logVolume925VsNetPnl: pearson(logVolume, net),
      logOpenInterest925VsNetPnl: pearson(logOi, net),
    },
    warnings: [
      'Correlations are descriptive only and must not be converted into a trading filter on the same sample.',
      'Historical candle volume/OI are liquidity proxies; they do not reconstruct bid-ask spread or queue position.',
    ],
    normalizedTrades: trades,
  };
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error('Usage: node research/option-liquidity-diagnostics.mjs <nifty-180-result.json> [output.json]');
    process.exit(2);
  }
  const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (!Array.isArray(payload.results)) throw new Error('Expected a NIFTY 180 result payload with results[]');
  const report = analyzeOptionLiquidity(payload.results);
  const text = JSON.stringify(report, null, 2);
  if (output) fs.writeFileSync(output, text);
  process.stdout.write(text);
}

if (process.argv[1]?.endsWith('option-liquidity-diagnostics.mjs')) main();
