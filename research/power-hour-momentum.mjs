import fs from 'node:fs';
import { parseCsv } from './opening-range-backtest.mjs';
import { computeWilderAtrByDate, inspectContinuousSessions } from './quick-flip-backtest.mjs';
import { equityIntradayCostScenarios } from './equity-intraday-costs.mjs';
import { summarizePerformance } from './performance-statistics.mjs';

export const POWER_HOUR_VARIANTS = Object.freeze([
  { key: 'move-0.50-rvol-1.2', minimumAbsoluteMove: 0.005, minimumRelativeVolume: 1.2, sensitivity: true },
  { key: 'move-0.75-rvol-1.2', minimumAbsoluteMove: 0.0075, minimumRelativeVolume: 1.2, primary: true },
  { key: 'move-1.00-rvol-1.2', minimumAbsoluteMove: 0.01, minimumRelativeVolume: 1.2, sensitivity: true },
]);

const DEFAULTS = Object.freeze({
  decisionBarTime: '14:25',
  entryBarTime: '14:30',
  exitBarTime: '15:10',
  volumeLookback: 20,
  atrPeriod: 14,
  stopAtrFraction: 0.25,
  notionalPerTrade: 50000,
  minimumAbsoluteMove: 0.0075,
  minimumRelativeVolume: 1.2,
});

function parts(timestamp) {
  const match = String(timestamp).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return { date: match[1], time: match[2] };
}

function groupBySymbolDay(candles) {
  const grouped = new Map();
  for (const candle of candles) {
    const symbol = candle.symbol || 'UNKNOWN';
    const { date } = parts(candle.timestamp);
    if (!grouped.has(symbol)) grouped.set(symbol, new Map());
    if (!grouped.get(symbol).has(date)) grouped.get(symbol).set(date, []);
    grouped.get(symbol).get(date).push(candle);
  }
  for (const days of grouped.values()) {
    for (const rows of days.values()) rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return grouped;
}

function atTime(rows, time) {
  return rows.find((row) => parts(row.timestamp).time === time) ?? null;
}

function cumulativeVolume(rows, endTime) {
  return rows
    .filter((row) => parts(row.timestamp).time <= endTime)
    .reduce((sum, row) => sum + Math.max(0, Number(row.volume) || 0), 0);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function priorAtr(dates, atrByDate, date) {
  const index = dates.indexOf(date);
  return index > 0 ? atrByDate.get(dates[index - 1]) ?? null : null;
}

function candidateRows(candles, cfg) {
  const byDate = new Map();
  const diagnostics = { symbolDays: 0, qualityRejectedDays: 0, warmupDays: 0, qualifiedCandidates: 0 };
  for (const [symbol, days] of groupBySymbolDay(candles)) {
    const dates = [...days.keys()].sort();
    const atrByDate = computeWilderAtrByDate(days, cfg.atrPeriod);
    const { qualityByDate, segments } = inspectContinuousSessions(days);
    const eligibleHistory = new Map();
    for (const segment of segments) {
      const segmentDates = segment.map((row) => row.date).filter((date) => qualityByDate.get(date)?.tradeEligible);
      for (let index = 0; index < segmentDates.length; index += 1) {
        const date = segmentDates[index];
        diagnostics.symbolDays += 1;
        const rows = days.get(date);
        const decision = atTime(rows, cfg.decisionBarTime);
        const entryBar = atTime(rows, cfg.entryBarTime);
        const exitBar = atTime(rows, cfg.exitBarTime);
        const opening = atTime(rows, '09:15');
        if (!decision || !entryBar || !exitBar || !opening) {
          diagnostics.qualityRejectedDays += 1;
          continue;
        }
        const volume = cumulativeVolume(rows, cfg.decisionBarTime);
        const history = segmentDates.slice(Math.max(0, index - cfg.volumeLookback), index)
          .map((priorDate) => eligibleHistory.get(priorDate))
          .filter((value) => Number.isFinite(value) && value > 0);
        eligibleHistory.set(date, volume);
        if (history.length !== cfg.volumeLookback) {
          diagnostics.warmupDays += 1;
          continue;
        }
        const atr = priorAtr(dates, atrByDate, date);
        if (!(atr > 0)) {
          diagnostics.qualityRejectedDays += 1;
          continue;
        }
        const relativeVolume = volume / mean(history);
        const returnToDecision = decision.close / opening.open - 1;
        if (Math.abs(returnToDecision) < cfg.minimumAbsoluteMove || relativeVolume < cfg.minimumRelativeVolume) continue;
        const direction = returnToDecision > 0 ? 'LONG' : 'SHORT';
        const candidate = { date, symbol, rows, decision, entryBar, exitBar, atr, volume, relativeVolume, returnToDecision, direction };
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date).push(candidate);
        diagnostics.qualifiedCandidates += 1;
      }
    }
  }
  return { byDate, diagnostics };
}

function score(candidate, cfg) {
  const { rows, direction, entryBar, exitBar, atr } = candidate;
  const entry = entryBar.open;
  const riskPoints = cfg.stopAtrFraction * atr;
  const stop = direction === 'LONG' ? entry - riskPoints : entry + riskPoints;
  let exit = exitBar.close;
  let exitTime = exitBar.timestamp;
  let result = 'CONTINUOUS_CLOSE';
  for (const row of rows) {
    const time = parts(row.timestamp).time;
    if (time < cfg.entryBarTime || time > cfg.exitBarTime) continue;
    const stopHit = direction === 'LONG' ? row.low <= stop : row.high >= stop;
    if (stopHit) {
      exit = stop;
      exitTime = row.timestamp;
      result = 'STOP';
      break;
    }
  }
  const pnlPoints = direction === 'LONG' ? exit - entry : entry - exit;
  const quantity = Math.floor(cfg.notionalPerTrade / entry);
  if (!(quantity > 0)) return null;
  const costs = equityIntradayCostScenarios({ direction, entry, exit, quantity });
  return {
    date: candidate.date,
    symbol: candidate.symbol,
    direction,
    signalTime: candidate.decision.timestamp,
    entryTime: entryBar.timestamp,
    exitTime,
    entry,
    exit,
    stop,
    result,
    returnToDecision: candidate.returnToDecision,
    relativeVolume: candidate.relativeVolume,
    priorAtr14: atr,
    riskPoints,
    quantity,
    costs,
    pnlPoints,
    realizedR: pnlPoints / riskPoints,
    netR: costs.normalized.netPnl / (riskPoints * quantity),
    stress2bpsNetR: costs.stress2bps.netPnl / (riskPoints * quantity),
    stress5bpsNetR: costs.stress5bps.netPnl / (riskPoints * quantity),
  };
}

export function backtestPowerHourMomentum(candles, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const { byDate, diagnostics } = candidateRows(candles, cfg);
  const trades = [];
  for (const candidates of byDate.values()) {
    const longs = candidates.filter((row) => row.direction === 'LONG').sort((a, b) => b.returnToDecision - a.returnToDecision);
    const shorts = candidates.filter((row) => row.direction === 'SHORT').sort((a, b) => a.returnToDecision - b.returnToDecision);
    for (const candidate of [longs[0], shorts[0]].filter(Boolean)) {
      const trade = score(candidate, cfg);
      if (trade) trades.push(trade);
    }
  }
  const summarize = (field) => summarizePerformance(trades.map((trade) => trade[field]));
  return {
    rules: cfg,
    summary: {
      grossR: summarize('realizedR'),
      normalizedNetR: summarize('netR'),
      stress2bpsNetR: summarize('stress2bpsNetR'),
      stress5bpsNetR: summarize('stress5bpsNetR'),
    },
    diagnostics,
    trades,
  };
}

export function runPowerHourVariants(candles, variants = POWER_HOUR_VARIANTS) {
  return variants.map((variant) => ({
    ...variant,
    result: backtestPowerHourMomentum(candles, variant),
  }));
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node research/power-hour-momentum.mjs <5m.csv> [more.csv]');
    process.exit(2);
  }
  const candles = files.flatMap((file) => parseCsv(fs.readFileSync(file, 'utf8')));
  process.stdout.write(JSON.stringify({ variants: runPowerHourVariants(candles) }, null, 2));
}

if (process.argv[1]?.endsWith('power-hour-momentum.mjs')) main();
