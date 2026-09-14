import fs from 'node:fs';

import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import { clusterBootstrapMean, summarizePerformance } from './performance-statistics.mjs';

export const NEW_IDEA_RULES = Object.freeze({
  hostKey: 'RETEST15_CONFIRM_BE_10',
  throttleWinningQuantile: 0.90,
  throttleSessions: 5,
  throttleLotFraction: 0.50,
  rollingSessions: 20,
  maximumEntries: 6,
  minimumOiLots: 1000,
  bootstrapSamples: 5000,
  bootstrapSeed: 20260816,
});

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position); const high = Math.ceil(position);
  return low === high ? sorted[low] : sorted[low] * (high - position) + sorted[high] * (position - low);
}

function scenarioCost(trade, lots, slippagePointsPerLeg) {
  if (!(lots > 0) || !(trade.lotSize > 0)) return null;
  return calculateLongOptionRoundTripCosts({
    entryPremium: trade.entry,
    exitPremium: trade.exit,
    lotSize: lots * trade.lotSize,
    tradeDate: trade.date,
    slippagePointsPerLeg,
  }).netPnl;
}

function scoreTrade(trade, lots) {
  return {
    ...trade,
    baselineLots: Math.floor(trade.allocatedCapital / (trade.entry * trade.lotSize)),
    overlayLots: lots,
    money: {
      current: scenarioCost(trade, lots, 0),
      stress0_5: scenarioCost(trade, lots, 0.5),
      stress1_0: scenarioCost(trade, lots, 1),
    },
  };
}

function scenarioRows(trades, scenario) {
  return trades.filter((row) => Number.isFinite(row.money?.[scenario]));
}

export function summarizeNewIdeaTrades(trades) {
  const scenarios = {};
  for (const scenario of ['current', 'stress0_5', 'stress1_0']) {
    const rows = scenarioRows(trades, scenario);
    scenarios[scenario] = {
      ...summarizePerformance(rows.map((row) => row.money[scenario])),
      bootstrap: clusterBootstrapMean(rows, {
        value: (row) => row.money[scenario],
        cluster: (row) => row.date.slice(0, 7),
        samples: NEW_IDEA_RULES.bootstrapSamples,
        seed: NEW_IDEA_RULES.bootstrapSeed,
      }),
    };
  }
  const normal = scenarioRows(trades, 'current');
  const byYear = new Map(); const byMonth = new Map();
  for (const row of normal) {
    const year = row.date.slice(0, 4); const month = row.date.slice(0, 7);
    byYear.set(year, (byYear.get(year) ?? 0) + row.money.current);
    byMonth.set(month, (byMonth.get(month) ?? 0) + row.money.current);
  }
  const positiveYears = [...byYear.values()].filter((value) => value > 0);
  const grossPositiveYears = positiveYears.reduce((sum, value) => sum + value, 0);
  return {
    scenarios,
    yearly: Object.fromEntries(byYear),
    monthly: Object.fromEntries(byMonth),
    positiveYears: positiveYears.length,
    positiveMonths: [...byMonth.values()].filter((value) => value > 0).length,
    activeMonths: byMonth.size,
    maximumPositiveYearContribution: grossPositiveYears > 0 ? Math.max(...positiveYears) / grossPositiveYears : null,
  };
}

export function commonNewIdeaChecks(summary) {
  const normal = summary.scenarios.current; const stress05 = summary.scenarios.stress0_5; const stress10 = summary.scenarios.stress1_0;
  return {
    minimumSample: normal.count >= 100,
    normalEconomics: normal.total > 0 && normal.profitFactor > 1,
    stress05Economics: stress05.total > 0 && stress05.profitFactor > 1,
    stress10Economics: stress10.total > 0 && stress10.profitFactor > 1,
    positiveYears: summary.positiveYears >= 3,
    positiveMonths: summary.activeMonths > 0 && summary.positiveMonths / summary.activeMonths >= 0.60,
    bootstrap: normal.bootstrap.lower > 0,
    yearConcentration: summary.maximumPositiveYearContribution != null && summary.maximumPositiveYearContribution <= 0.50,
    tradeConcentration: normal.top10PctPositiveContribution != null && normal.top10PctPositiveContribution <= 0.60,
  };
}

function finalize(name, trades, diagnostics = {}, extraChecks = {}) {
  const summary = summarizeNewIdeaTrades(trades);
  const checks = { ...commonNewIdeaChecks(summary), ...extraChecks };
  const passed = Object.values(checks).every(Boolean);
  return { name, rules: NEW_IDEA_RULES, diagnostics, summary, checks, passed, decision: passed ? 'ADVANCE_TO_VALIDATION' : 'REJECT_DISCOVERY', trades };
}

export function evaluateNewIdeaOverlays(document) {
  const host = document?.variants?.[NEW_IDEA_RULES.hostKey]?.trades ?? [];
  const sessions = [...new Set((document?.sessions ?? []).map((row) => row.date))].sort();
  const sessionIndex = new Map(sessions.map((date, index) => [date, index]));
  const ordered = [...host].sort((a, b) => a.date.localeCompare(b.date) || a.signalTime.localeCompare(b.signalTime));
  if (!ordered.length) throw new Error(`Missing host ${NEW_IDEA_RULES.hostKey}`);
  if (ordered.some((row) => !(row.lotSize > 0))) throw new Error('Every host trade must carry a positive dated lot size');

  const winningBaseline = ordered.map((row) => row.money?.current).filter((value) => Number.isFinite(value) && value > 0);
  const threshold = quantile(winningBaseline, NEW_IDEA_RULES.throttleWinningQuantile);
  const baseline = ordered.map((row) => scoreTrade(row, Math.floor(row.allocatedCapital / (row.entry * row.lotSize))));
  const baselineSummary = summarizeNewIdeaTrades(baseline);

  let cooldownThrough = -1;
  const throttle = [];
  for (const trade of ordered) {
    const index = sessionIndex.get(trade.date);
    const fullLots = Math.floor(trade.allocatedCapital / (trade.entry * trade.lotSize));
    const reduced = index <= cooldownThrough;
    const lots = reduced ? Math.floor(fullLots * NEW_IDEA_RULES.throttleLotFraction) : fullLots;
    if (lots > 0) throttle.push({ ...scoreTrade(trade, lots), throttleActive: reduced });
    if (trade.money.current >= threshold) cooldownThrough = Math.max(cooldownThrough, index + NEW_IDEA_RULES.throttleSessions);
  }

  const frequency = [];
  const acceptedIndexes = [];
  for (const trade of ordered) {
    const index = sessionIndex.get(trade.date);
    while (acceptedIndexes.length && acceptedIndexes[0] < index - NEW_IDEA_RULES.rollingSessions + 1) acceptedIndexes.shift();
    if (acceptedIndexes.length >= NEW_IDEA_RULES.maximumEntries) continue;
    const lots = Math.floor(trade.allocatedCapital / (trade.entry * trade.lotSize));
    if (lots > 0) { frequency.push(scoreTrade(trade, lots)); acceptedIndexes.push(index); }
  }

  let missingOi = 0;
  const oi = [];
  for (const trade of ordered) {
    if (!Number.isFinite(trade.signalOpenInterest)) { missingOi += 1; continue; }
    if (trade.signalOpenInterest / trade.lotSize < NEW_IDEA_RULES.minimumOiLots) continue;
    const lots = Math.floor(trade.allocatedCapital / (trade.entry * trade.lotSize));
    if (lots > 0) oi.push(scoreTrade(trade, lots));
  }

  return {
    schemaVersion: 1,
    study: 'New ideas 1, 2 and 5 overlays',
    period: document.period,
    host: { key: NEW_IDEA_RULES.hostKey, trades: ordered.length, summary: baselineSummary },
    candidates: {
      IDEA1_CONCENTRATION_THROTTLE: finalize('Concentration throttle', throttle, {
        threshold,
        profitableHostTrades: winningBaseline.length,
        throttledTrades: throttle.filter((row) => row.throttleActive).length,
      }, { bootstrapHypothesis: summarizeNewIdeaTrades(throttle).scenarios.current.bootstrap.lower >= 0 }),
      IDEA2_FREQUENCY_CAP: finalize('Rolling trade-frequency cap', frequency, { skippedTrades: ordered.length - frequency.length }),
      IDEA5_OPEN_INTEREST_FILTER: finalize('Signal-time open-interest filter', oi, { missingOi, excludedBelowThreshold: ordered.length - missingOi - oi.length }),
    },
  };
}

if (process.argv[1]?.endsWith('new-ideas-overlays.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const result = evaluateNewIdeaOverlays(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ period: result.period, decisions: Object.fromEntries(Object.entries(result.candidates).map(([key, value]) => [key, value.decision])) }, null, 2)}\n`);
}
