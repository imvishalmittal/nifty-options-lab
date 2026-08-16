import fs from 'node:fs';
import { robustnessReport, summarizePerformance } from './performance-statistics.mjs';

function monthOf(date) {
  return String(date || '').slice(0, 7) || 'UNKNOWN';
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = String(keyFn(item) ?? 'UNKNOWN');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function breakdown(items, keyFn, valueFn) {
  return Object.fromEntries(
    [...groupBy(items, keyFn).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => [key, summarizePerformance(rows.map(valueFn))]),
  );
}

function contribution(items, keyFn, valueFn) {
  const totals = [];
  for (const [key, rows] of groupBy(items, keyFn)) {
    const total = rows.reduce((sum, item) => sum + Number(valueFn(item) || 0), 0);
    totals.push({ key, total });
  }
  totals.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const absoluteTotal = totals.reduce((sum, row) => sum + Math.abs(row.total), 0);
  return {
    groups: totals.length,
    topAbsoluteContributor: totals[0] ?? null,
    topAbsoluteContributionShare: absoluteTotal > 0 && totals[0] ? Math.abs(totals[0].total) / absoluteTotal : null,
    totals,
  };
}

export function reportUnderlyingTrades(trades, { bootstrapSamples = 5000 } = {}) {
  const usable = trades.filter((t) => Number.isFinite(Number(t.realizedR)) && t.date);
  const value = (t) => Number(t.realizedR);
  return {
    metric: 'realizedR',
    observations: usable.length,
    robustness: robustnessReport(usable, {
      value,
      cluster: (t) => t.date,
      bootstrapSamples,
    }),
    byMonth: breakdown(usable, (t) => monthOf(t.date), value),
    bySymbol: breakdown(usable, (t) => t.symbol || 'UNKNOWN', value),
    byDirection: breakdown(usable, (t) => t.direction || t.side || 'UNKNOWN', value),
    symbolContribution: contribution(usable, (t) => t.symbol || 'UNKNOWN', value),
  };
}

function optionValueCurrentCosts(row) {
  return row.costs?.currentGroww2026?.netPnl;
}

function optionValueGross(row) {
  return row.grossPnlRupees;
}

function optionValueStress05(row) {
  return row.costs?.slippageStress0_5?.netPnl;
}

function optionValueStress10(row) {
  return row.costs?.slippageStress1_0?.netPnl;
}

function optionScenario(trades, valueFn, bootstrapSamples) {
  const usable = trades.filter((t) => Number.isFinite(Number(valueFn(t))) && t.date);
  return {
    observations: usable.length,
    robustness: robustnessReport(usable, {
      value: (t) => Number(valueFn(t)),
      cluster: (t) => t.date,
      bootstrapSamples,
    }),
    byMonth: breakdown(usable, (t) => monthOf(t.date), (t) => Number(valueFn(t))),
    bySide: breakdown(usable, (t) => t.side || 'UNKNOWN', (t) => Number(valueFn(t))),
  };
}

export function reportOptionResults(results, { bootstrapSamples = 5000 } = {}) {
  const trades = results.filter((r) => r.status === 'TRADE');
  const statuses = Object.fromEntries(
    [...groupBy(results, (r) => r.status || 'UNKNOWN').entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => [key, rows.length]),
  );
  const noTradeReasons = Object.fromEntries(
    [...groupBy(results.filter((r) => r.status === 'NO_TRADE'), (r) => r.reason || 'UNSPECIFIED').entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => [key, rows.length]),
  );

  return {
    metric: 'rupeesPerOneConfiguredLot',
    totalSessions: results.length,
    tradeSessions: trades.length,
    statuses,
    noTradeReasons,
    gross: optionScenario(trades, optionValueGross, bootstrapSamples),
    currentCosts: optionScenario(trades, optionValueCurrentCosts, bootstrapSamples),
    slippageStress0_5: optionScenario(trades, optionValueStress05, bootstrapSamples),
    slippageStress1_0: optionScenario(trades, optionValueStress10, bootstrapSamples),
  };
}

export function buildRobustnessReport(payload, options = {}) {
  if (Array.isArray(payload?.trades)) {
    return { type: 'UNDERLYING_TRADES', report: reportUnderlyingTrades(payload.trades, options) };
  }

  if (Array.isArray(payload?.results) && payload.results.every((r) => !('result' in r) || typeof r === 'object')) {
    const looksLikeOptionSessions = payload.results.some((r) => 'status' in r);
    if (looksLikeOptionSessions) {
      return { type: 'OPTION_SESSIONS', report: reportOptionResults(payload.results, options) };
    }
  }

  if (Array.isArray(payload?.variants)) {
    return {
      type: 'UNDERLYING_VARIANTS',
      variants: payload.variants.map((variant) => ({
        key: variant.key,
        minRelativeVolume: variant.minRelativeVolume,
        evidence: variant.evidence,
        report: reportUnderlyingTrades(variant.result?.trades || [], options),
      })),
    };
  }

  throw new Error('Unsupported strategy result format');
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error('Usage: node research/strategy-robustness-report.mjs <result.json> [output.json]');
    process.exit(2);
  }
  const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
  const report = buildRobustnessReport(payload);
  const text = JSON.stringify(report, null, 2);
  if (output) fs.writeFileSync(output, text);
  process.stdout.write(text);
}

if (process.argv[1]?.endsWith('strategy-robustness-report.mjs')) main();
