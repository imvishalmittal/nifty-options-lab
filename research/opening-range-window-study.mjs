import fs from 'node:fs';
import { parseCsv, backtest, summarize } from './opening-range-backtest.mjs';

export const WINDOW_STUDIES = [
  { label: '15m after open range', entryWindowEnd: '09:45' },
  { label: '30m after open range', entryWindowEnd: '10:00' },
  { label: '60m after open range', entryWindowEnd: '10:30' },
  { label: '75m after open range', entryWindowEnd: '10:45' },
];

function group(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function breakdown(trades, keyFn) {
  return Object.fromEntries(
    [...group(trades, keyFn).entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([key, rows]) => [key, summarize(rows)]),
  );
}

export function runWindowStudy(candles, windows = WINDOW_STUDIES) {
  return windows.map((window) => {
    const result = backtest(candles, { entryWindowEnd: window.entryWindowEnd });
    return {
      ...window,
      summary: result.summary,
      bySymbol: breakdown(result.trades, (t) => t.symbol || 'UNKNOWN'),
      byDirection: breakdown(result.trades, (t) => t.direction),
      byPattern: breakdown(result.trades, (t) => t.pattern),
      trades: result.trades,
    };
  });
}

export function rankWindows(results) {
  return [...results].sort((a, b) => {
    // Primary ranking is average R, then total R, then larger sample.
    if (b.summary.averageR !== a.summary.averageR) return b.summary.averageR - a.summary.averageR;
    if (b.summary.totalR !== a.summary.totalR) return b.summary.totalR - a.summary.totalR;
    return b.summary.trades - a.summary.trades;
  });
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node research/opening-range-window-study.mjs <5m.csv> [more.csv]');
    process.exit(2);
  }
  const candles = files.flatMap((file) => parseCsv(fs.readFileSync(file, 'utf8')));
  const results = runWindowStudy(candles);
  const ranked = rankWindows(results).map((r, index) => ({
    rank: index + 1,
    label: r.label,
    entryWindowEnd: r.entryWindowEnd,
    summary: r.summary,
  }));
  process.stdout.write(JSON.stringify({ ranked, results }, null, 2));
}

if (process.argv[1]?.endsWith('opening-range-window-study.mjs')) main();
