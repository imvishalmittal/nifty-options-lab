import fs from 'node:fs';
import { parseCsv, summarize } from './opening-range-backtest.mjs';
import { computeWilderAtrByDate } from './quick-flip-backtest.mjs';

export const SIP_ORB_VARIANTS = Object.freeze([
  { key: 'rvol-1.0', minRelativeVolume: 1.0, evidence: 'US Stocks-in-Play replication threshold' },
  { key: 'rvol-1.2', minRelativeVolume: 1.2, evidence: 'NSE volume-surge sensitivity threshold' },
  { key: 'rvol-1.5', minRelativeVolume: 1.5, evidence: 'NSE strong-volume-surge sensitivity threshold' },
]);

const DEFAULTS = Object.freeze({
  openingTime: '09:15',
  rvolLookback: 14,
  atrPeriod: 14,
  stopAtrFraction: 0.10,
  lastEntryTime: '15:20',
});

function parts(timestamp) {
  const m = String(timestamp).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return { date: m[1], time: m[2] };
}

function groupBySymbolDay(candles) {
  const bySymbol = new Map();
  for (const candle of candles) {
    const symbol = candle.symbol || 'UNKNOWN';
    const { date } = parts(candle.timestamp);
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, new Map());
    const days = bySymbol.get(symbol);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(candle);
  }
  for (const days of bySymbol.values()) {
    for (const rows of days.values()) rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return bySymbol;
}

function openingBar(rows, time = '09:15') {
  return rows.find((c) => parts(c.timestamp).time === time) ?? null;
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function relativeOpeningVolumeByDate(days, lookback = 14, openingTime = '09:15') {
  const dates = [...days.keys()].sort();
  const result = new Map();
  for (let i = lookback; i < dates.length; i++) {
    const current = openingBar(days.get(dates[i]), openingTime);
    if (!current || !(current.volume >= 0)) continue;
    const priorVolumes = [];
    for (let j = i - lookback; j < i; j++) {
      const bar = openingBar(days.get(dates[j]), openingTime);
      if (bar && bar.volume > 0) priorVolumes.push(bar.volume);
    }
    if (priorVolumes.length !== lookback) continue;
    const baseline = mean(priorVolumes);
    if (!(baseline > 0)) continue;
    result.set(dates[i], {
      openingVolume: current.volume,
      priorMeanOpeningVolume: baseline,
      relativeVolume: current.volume / baseline,
    });
  }
  return result;
}

function priorAtrForDate(sortedDates, atrByDate, date) {
  const idx = sortedDates.indexOf(date);
  if (idx <= 0) return null;
  return atrByDate.get(sortedDates[idx - 1]) ?? null;
}

function scoreTrade(day, entryIndex, direction, entry, stop) {
  for (let i = entryIndex; i < day.length; i++) {
    const bar = day[i];
    if (direction === 'LONG' && bar.low <= stop) {
      return { result: 'STOP', exit: stop, exitTime: bar.timestamp, pnlPoints: stop - entry, ambiguousEntryBar: i === entryIndex };
    }
    if (direction === 'SHORT' && bar.high >= stop) {
      return { result: 'STOP', exit: stop, exitTime: bar.timestamp, pnlPoints: entry - stop, ambiguousEntryBar: i === entryIndex };
    }
  }
  const last = day.at(-1);
  const pnlPoints = direction === 'LONG' ? last.close - entry : entry - last.close;
  return { result: 'EOD', exit: last.close, exitTime: last.timestamp, pnlPoints, ambiguousEntryBar: false };
}

export function backtestStocksInPlayOrb(candles, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const minRelativeVolume = cfg.minRelativeVolume ?? 1.0;
  const trades = [];
  const diagnostics = {
    symbolDays: 0,
    rvolReadyDays: 0,
    atrReadyDays: 0,
    qualifiedRvolDays: 0,
    directionalOpeningDays: 0,
    breakoutTrades: 0,
  };

  const grouped = groupBySymbolDay(candles);
  for (const [symbol, days] of grouped.entries()) {
    const dates = [...days.keys()].sort();
    const atrByDate = computeWilderAtrByDate(days, cfg.atrPeriod);
    const rvolByDate = relativeOpeningVolumeByDate(days, cfg.rvolLookback, cfg.openingTime);

    for (const date of dates) {
      diagnostics.symbolDays += 1;
      const rvol = rvolByDate.get(date);
      if (!rvol) continue;
      diagnostics.rvolReadyDays += 1;
      const atr = priorAtrForDate(dates, atrByDate, date);
      if (!(atr > 0)) continue;
      diagnostics.atrReadyDays += 1;
      if (!(rvol.relativeVolume >= minRelativeVolume)) continue;
      diagnostics.qualifiedRvolDays += 1;

      const day = days.get(date);
      const opening = openingBar(day, cfg.openingTime);
      if (!opening) continue;
      let direction = null;
      let trigger = null;
      if (opening.close > opening.open) {
        direction = 'LONG';
        trigger = opening.high;
      } else if (opening.close < opening.open) {
        direction = 'SHORT';
        trigger = opening.low;
      } else {
        continue;
      }
      diagnostics.directionalOpeningDays += 1;

      const stopDistance = cfg.stopAtrFraction * atr;
      const stop = direction === 'LONG' ? trigger - stopDistance : trigger + stopDistance;
      let entryIndex = -1;
      for (let i = 0; i < day.length; i++) {
        const time = parts(day[i].timestamp).time;
        if (time <= cfg.openingTime) continue;
        if (time > cfg.lastEntryTime) break;
        if ((direction === 'LONG' && day[i].high >= trigger) || (direction === 'SHORT' && day[i].low <= trigger)) {
          entryIndex = i;
          break;
        }
      }
      if (entryIndex < 0) continue;
      diagnostics.breakoutTrades += 1;

      const outcome = scoreTrade(day, entryIndex, direction, trigger, stop);
      trades.push({
        date,
        symbol,
        direction,
        openingTime: opening.timestamp,
        openingOpen: opening.open,
        openingHigh: opening.high,
        openingLow: opening.low,
        openingClose: opening.close,
        openingVolume: rvol.openingVolume,
        priorMeanOpeningVolume: rvol.priorMeanOpeningVolume,
        relativeVolume: rvol.relativeVolume,
        atr14: atr,
        stopAtrFraction: cfg.stopAtrFraction,
        entryTime: day[entryIndex].timestamp,
        entry: trigger,
        stop,
        riskPoints: stopDistance,
        ...outcome,
        realizedR: outcome.pnlPoints / stopDistance,
      });
    }
  }

  return {
    variant: { minRelativeVolume, stopAtrFraction: cfg.stopAtrFraction, rvolLookback: cfg.rvolLookback },
    summary: summarize(trades),
    diagnostics,
    trades,
  };
}

export function runStocksInPlayVariants(candles, variants = SIP_ORB_VARIANTS) {
  return variants.map((variant) => ({
    ...variant,
    result: backtestStocksInPlayOrb(candles, { minRelativeVolume: variant.minRelativeVolume }),
  }));
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node research/stocks-in-play-orb-backtest.mjs <5m.csv> [more.csv]');
    process.exit(2);
  }
  const candles = files.flatMap((file) => parseCsv(fs.readFileSync(file, 'utf8')));
  process.stdout.write(JSON.stringify({ variants: runStocksInPlayVariants(candles) }, null, 2));
}

if (process.argv[1]?.endsWith('stocks-in-play-orb-backtest.mjs')) main();
