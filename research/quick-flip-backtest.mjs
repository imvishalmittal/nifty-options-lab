import fs from 'node:fs';
import { parseCsv, isBullishHammer, isBearishShootingStar, isBullishEngulfing, isBearishEngulfing, summarize } from './opening-range-backtest.mjs';

const DEFAULTS = {
  openingStart: '09:15',
  openingEnd: '09:30',
  entryWindowEnd: '10:45',
  atrPeriod: 14,
  minOpeningRangeAtrFraction: 0.25,
};

function parts(timestamp) {
  const m = String(timestamp).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return { date: m[1], time: m[2] };
}

function groupBySymbolDay(candles) {
  const bySymbol = new Map();
  for (const c of candles) {
    const symbol = c.symbol || 'UNKNOWN';
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, new Map());
    const { date } = parts(c.timestamp);
    const days = bySymbol.get(symbol);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(c);
  }
  for (const days of bySymbol.values()) {
    for (const rows of days.values()) rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return bySymbol;
}

function dailyBars(days) {
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({
    date,
    open: rows[0].open,
    high: Math.max(...rows.map((c) => c.high)),
    low: Math.min(...rows.map((c) => c.low)),
    close: rows.at(-1).close,
  }));
}

export function computeWilderAtrByDate(days, period = 14) {
  const bars = dailyBars(days);
  const tr = bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prevClose = bars[i - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
  });
  const atrByDate = new Map();
  if (bars.length <= period) return atrByDate;

  let atr = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  // ATR stored for a date represents information available only after that date closes.
  atrByDate.set(bars[period].date, atr);
  for (let i = period + 1; i < bars.length; i++) {
    atr = ((atr * (period - 1)) + tr[i]) / period;
    atrByDate.set(bars[i].date, atr);
  }
  return atrByDate;
}

function priorAtrForDate(sortedDates, atrByDate, date) {
  const idx = sortedDates.indexOf(date);
  if (idx <= 0) return null;
  return atrByDate.get(sortedDates[idx - 1]) ?? null;
}

function outcomeAfterEntry(day, entryIndex, direction, entry, stop, target) {
  let mfe = 0;
  let mae = 0;
  for (let i = entryIndex; i < day.length; i++) {
    const c = day[i];
    if (direction === 'LONG') {
      mfe = Math.max(mfe, c.high - entry);
      mae = Math.max(mae, entry - c.low);
      const stopHit = c.low <= stop;
      const targetHit = c.high >= target;
      if (stopHit && targetHit) return { result: 'STOP', exit: stop, exitTime: c.timestamp, mfe, mae, ambiguousBar: true };
      if (stopHit) return { result: 'STOP', exit: stop, exitTime: c.timestamp, mfe, mae, ambiguousBar: false };
      if (targetHit) return { result: 'TARGET', exit: target, exitTime: c.timestamp, mfe, mae, ambiguousBar: false };
    } else {
      mfe = Math.max(mfe, entry - c.low);
      mae = Math.max(mae, c.high - entry);
      const stopHit = c.high >= stop;
      const targetHit = c.low <= target;
      if (stopHit && targetHit) return { result: 'STOP', exit: stop, exitTime: c.timestamp, mfe, mae, ambiguousBar: true };
      if (stopHit) return { result: 'STOP', exit: stop, exitTime: c.timestamp, mfe, mae, ambiguousBar: false };
      if (targetHit) return { result: 'TARGET', exit: target, exitTime: c.timestamp, mfe, mae, ambiguousBar: false };
    }
  }
  const last = day.at(-1);
  return { result: 'EOD', exit: last.close, exitTime: last.timestamp, mfe, mae, ambiguousBar: false };
}

function bullishPattern(prev, c) {
  if (isBullishEngulfing(prev, c)) return 'BULL_ENGULF';
  if (isBullishHammer(c)) return 'HAMMER';
  return null;
}

function bearishPattern(prev, c) {
  if (isBearishEngulfing(prev, c)) return 'BEAR_ENGULF';
  if (isBearishShootingStar(c)) return 'INVERTED_HAMMER';
  return null;
}

export function backtestQuickFlip(candles, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const trades = [];
  const diagnostics = { symbolDays: 0, atrReadyDays: 0, qualifiedOpeningDays: 0, reversalDays: 0 };
  const grouped = groupBySymbolDay(candles);

  for (const [symbol, days] of grouped.entries()) {
    const sortedDates = [...days.keys()].sort();
    const atrByDate = computeWilderAtrByDate(days, cfg.atrPeriod);
    for (const date of sortedDates) {
      diagnostics.symbolDays += 1;
      const day = days.get(date);
      const atr = priorAtrForDate(sortedDates, atrByDate, date);
      if (!(atr > 0)) continue;
      diagnostics.atrReadyDays += 1;

      const opening = day.filter((c) => {
        const t = parts(c.timestamp).time;
        return t >= cfg.openingStart && t < cfg.openingEnd;
      });
      if (opening.length < 3) continue;
      const openingHigh = Math.max(...opening.map((c) => c.high));
      const openingLow = Math.min(...opening.map((c) => c.low));
      const openingRange = openingHigh - openingLow;
      if (!(openingRange >= cfg.minOpeningRangeAtrFraction * atr)) continue;
      diagnostics.qualifiedOpeningDays += 1;

      let reversalSeen = false;
      let taken = false;
      for (let i = 0; i < day.length - 1 && !taken; i++) {
        const c = day[i];
        const { time } = parts(c.timestamp);
        if (time < cfg.openingEnd || time > cfg.entryWindowEnd) continue;
        const prev = i > 0 ? day[i - 1] : null;

        // Quick Flip requires the reversal candle itself to trade outside the opening box.
        const lowSweep = c.low < openingLow;
        const highSweep = c.high > openingHigh;
        const bull = lowSweep ? bullishPattern(prev, c) : null;
        const bear = highSweep ? bearishPattern(prev, c) : null;
        if (!bull && !bear) continue;
        reversalSeen = true;

        const direction = bull ? 'LONG' : 'SHORT';
        const pattern = bull || bear;
        const trigger = bull ? c.high : c.low;
        const stop = bull ? c.low : c.high;
        const target = bull ? openingHigh : openingLow;
        const risk = Math.abs(trigger - stop);
        const reward = bull ? target - trigger : trigger - target;
        if (!(risk > 0 && reward > 0)) continue;

        let entryIndex = -1;
        for (let j = i + 1; j < day.length; j++) {
          const jt = parts(day[j].timestamp).time;
          if (jt > cfg.entryWindowEnd) break;
          if ((direction === 'LONG' && day[j].high >= trigger) || (direction === 'SHORT' && day[j].low <= trigger)) {
            entryIndex = j;
            break;
          }
        }
        if (entryIndex < 0) continue;

        const outcome = outcomeAfterEntry(day, entryIndex, direction, trigger, stop, target);
        const pnlPoints = direction === 'LONG' ? outcome.exit - trigger : trigger - outcome.exit;
        trades.push({
          date, symbol, direction, pattern,
          atr14: atr,
          openingHigh, openingLow, openingRange,
          openingRangeAtrFraction: openingRange / atr,
          reversalTime: c.timestamp,
          entryTime: day[entryIndex].timestamp,
          entry: trigger, stop, target,
          riskPoints: risk,
          rewardPoints: reward,
          plannedR: reward / risk,
          result: outcome.result,
          exit: outcome.exit,
          exitTime: outcome.exitTime,
          pnlPoints,
          realizedR: pnlPoints / risk,
          mfePoints: outcome.mfe,
          maePoints: outcome.mae,
          ambiguousBar: outcome.ambiguousBar,
        });
        taken = true;
      }
      if (reversalSeen) diagnostics.reversalDays += 1;
    }
  }

  return { trades, summary: summarize(trades), diagnostics };
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node research/quick-flip-backtest.mjs <5m.csv> [more.csv]');
    process.exit(2);
  }
  const candles = files.flatMap((file) => parseCsv(fs.readFileSync(file, 'utf8')));
  process.stdout.write(JSON.stringify(backtestQuickFlip(candles), null, 2));
}

if (process.argv[1]?.endsWith('quick-flip-backtest.mjs')) main();
