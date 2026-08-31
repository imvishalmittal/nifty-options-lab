export const MORNING_TEA_RULES = Object.freeze({
  rankingTime: '09:15',
  entryTime: '09:16',
  forcedExit: '09:30',
  targetPct: 0.10,
  openMatchTolerancePct: 0.001,
});

export const MORNING_TEA_UNIVERSE = Object.freeze([
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'INFY',
  'TCS', 'AXISBANK', 'KOTAKBANK', 'LT', 'ITC',
  'BHARTIARTL', 'HINDUNILVR', 'MARUTI', 'TATAMOTORS', 'BAJFINANCE',
]);

export function timeOf(timestamp) {
  const match = String(timestamp).match(/T(\d\d:\d\d)/);
  if (!match) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return match[1];
}

export function rankOpeningMovers(rows, rules = MORNING_TEA_RULES) {
  const eligible = rows.filter((row) => row.symbol && Number.isFinite(row.previousClose)
    && row.previousClose > 0 && row.candle && timeOf(row.candle.timestamp) === rules.rankingTime)
    .map((row) => ({ ...row, changePct: (row.candle.close / row.previousClose) - 1 }));
  if (eligible.length < 2) return { gainer: null, loser: null, eligible };
  const sorted = eligible.toSorted((a, b) => b.changePct - a.changePct || a.symbol.localeCompare(b.symbol));
  return { gainer: sorted[0], loser: sorted.at(-1), eligible };
}

function approximatelyEqual(a, b, tolerancePct) {
  return Math.abs(a - b) <= Math.max(Math.abs(a), 1) * tolerancePct;
}

export function qualifiesOpeningMover(row, side, rules = MORNING_TEA_RULES) {
  if (!row?.candle || !['CE', 'PE'].includes(side)) return false;
  const candle = row.candle;
  if (side === 'CE') {
    return candle.close > candle.open
      && approximatelyEqual(candle.open, candle.low, rules.openMatchTolerancePct);
  }
  return candle.close < candle.open
    && approximatelyEqual(candle.open, candle.high, rules.openMatchTolerancePct);
}

export function evaluateLongOption(candles, rules = MORNING_TEA_RULES) {
  const opening = candles.find((row) => timeOf(row.timestamp) === rules.rankingTime);
  const entryBar = candles.find((row) => timeOf(row.timestamp) === rules.entryTime);
  if (!opening || !entryBar) return { status: 'NO_TRADE', reason: 'Opening or next-minute option candle unavailable' };
  if (!(opening.close > opening.open)) return { status: 'NO_TRADE', reason: 'Option opening candle is not bullish' };
  const entry = entryBar.open;
  const stop = opening.low;
  const target = entry * (1 + rules.targetPct);
  if (!(entry > stop)) return { status: 'NO_TRADE', reason: 'Executable entry is not above opening-candle stop' };

  for (const candle of candles) {
    const time = timeOf(candle.timestamp);
    if (time < rules.entryTime || time >= rules.forcedExit) continue;
    const stopHit = candle.low <= stop;
    const targetHit = candle.high >= target;
    if (stopHit) return { status: 'TRADE', result: 'STOP', entry, stop, target, exit: stop, entryTime: entryBar.timestamp, exitTime: candle.timestamp, ambiguousBar: targetHit };
    if (targetHit) return { status: 'TRADE', result: 'TARGET', entry, stop, target, exit: target, entryTime: entryBar.timestamp, exitTime: candle.timestamp, ambiguousBar: false };
  }
  const exitBar = candles.find((row) => timeOf(row.timestamp) === rules.forcedExit);
  if (!exitBar) return { status: 'DATA_MISSING', reason: '09:30 time-exit open unavailable' };
  return { status: 'TRADE', result: 'TIME', entry, stop, target, exit: exitBar.open, entryTime: entryBar.timestamp, exitTime: exitBar.timestamp, ambiguousBar: false };
}

export function summarizeMorningTea(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const sum = (key) => trades.reduce((total, row) => total + (row.costs?.[key]?.netPnl ?? 0), 0);
  const wins = trades.filter((row) => (row.costs?.normalized?.netPnl ?? 0) > 0).length;
  return {
    observedSessions: new Set(results.map((row) => row.date)).size,
    signals: results.filter((row) => row.signal).length,
    trades: trades.length,
    wins,
    winRate: trades.length ? wins / trades.length : 0,
    missingDataSessions: new Set(results.filter((row) => row.status === 'DATA_MISSING').map((row) => row.date)).size,
    normalNetPnl: sum('normalized'),
    stress0_1NetPnl: sum('stress0_1'),
    stress0_25NetPnl: sum('stress0_25'),
    stress0_5NetPnl: sum('stress0_5'),
    stress1_0NetPnl: sum('stress1_0'),
  };
}
