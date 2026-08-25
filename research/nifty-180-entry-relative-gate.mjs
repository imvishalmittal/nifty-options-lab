import fs from 'node:fs';
import { ENTRY_RELATIVE_VARIANTS } from './nifty-180-entry-relative.mjs';

function profitFactor(values) {
  const gains = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const losses = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  return losses > 0 ? gains / losses : null;
}

function yearly(rows) {
  const grouped = {};
  for (const row of rows) {
    const year = row.date.slice(0, 4);
    grouped[year] ??= [];
    grouped[year].push(row);
  }
  return Object.fromEntries(Object.entries(grouped).map(([year, trades]) => [year, {
    trades: trades.length,
    normalized: trades.reduce((sum, row) => sum + row.costs.normalized.netPnl, 0),
    stress0_5: trades.reduce((sum, row) => sum + row.costs.stress0_5.netPnl, 0),
    stress1_0: trades.reduce((sum, row) => sum + row.costs.stress1_0.netPnl, 0),
  }]));
}

function bootstrapLowerMean(rows, samples = 2000) {
  const clusters = {};
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    clusters[month] ??= [];
    clusters[month].push(row.costs.stress1_0.netPnl);
  }
  const months = Object.values(clusters);
  if (!months.length) return null;
  let seed = 0x1802040;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const means = [];
  for (let sample = 0; sample < samples; sample += 1) {
    let pnl = 0;
    let trades = 0;
    for (let index = 0; index < months.length; index += 1) {
      const cluster = months[Math.floor(random() * months.length)];
      pnl += cluster.reduce((sum, value) => sum + value, 0);
      trades += cluster.length;
    }
    means.push(trades ? pnl / trades : 0);
  }
  means.sort((left, right) => left - right);
  return means[Math.floor(samples * 0.025)];
}

function evaluateVariant(id, row) {
  const trades = row.trades;
  const normalized = trades.map((trade) => trade.costs.normalized.netPnl);
  const stress1 = trades.map((trade) => trade.costs.stress1_0.netPnl);
  const byYear = yearly(trades);
  const positiveYears = Object.values(byYear).filter((year) => year.stress1_0 > 0).length;
  const absoluteYearPnl = Object.values(byYear).map((year) => Math.abs(year.stress1_0));
  const absoluteTotal = absoluteYearPnl.reduce((sum, value) => sum + value, 0);
  const maximumYearShare = absoluteTotal ? Math.max(...absoluteYearPnl) / absoluteTotal : null;
  const lowerMean = bootstrapLowerMean(trades);
  const checks = [
    { name: 'trades', value: trades.length, threshold: '>= 100', pass: trades.length >= 100 },
    { name: 'normalized profit factor', value: profitFactor(normalized), threshold: '>= 1.20', pass: (profitFactor(normalized) ?? 0) >= 1.2 },
    { name: '1-point-stress profit factor', value: profitFactor(stress1), threshold: '>= 1.10', pass: (profitFactor(stress1) ?? 0) >= 1.1 },
    { name: 'normalized net P&L', value: row.summary.totalNetPnlRupees, threshold: '> 0', pass: row.summary.totalNetPnlRupees > 0 },
    { name: '0.5-point stress net P&L', value: row.summary.totalNetPnlStress0_5, threshold: '> 0', pass: row.summary.totalNetPnlStress0_5 > 0 },
    { name: '1-point stress net P&L', value: row.summary.totalNetPnlStress1_0, threshold: '> 0', pass: row.summary.totalNetPnlStress1_0 > 0 },
    { name: 'positive 1-point-stress years', value: positiveYears, threshold: '>= 3 of 5', pass: positiveYears >= 3 },
    { name: 'clustered-bootstrap 95% lower mean', value: lowerMean, threshold: '> 0', pass: (lowerMean ?? -Infinity) > 0 },
    { name: 'maximum absolute year contribution', value: maximumYearShare, threshold: '<= 50%', pass: maximumYearShare != null && maximumYearShare <= 0.5 },
  ];
  return {
    variant: id,
    label: row.label,
    decision: checks.every((check) => check.pass) ? 'RESEARCH_GATE_PASS' : 'RESEARCH_GATE_FAIL',
    automaticPromotion: false,
    checks,
    diagnostics: { yearly: byYear, clusteredBootstrapSamples: 2000 },
  };
}

export function evaluateEntryRelativeGate(document) {
  const variants = Object.fromEntries(ENTRY_RELATIVE_VARIANTS.map((variant) => [
    variant.id,
    evaluateVariant(variant.id, document.variants[variant.id]),
  ]));
  const passing = Object.values(variants).filter((row) => row.decision === 'RESEARCH_GATE_PASS');
  return {
    strategy: document.strategy,
    phase: 'discovery-2020-2024',
    decision: passing.length ? 'RESEARCH_GATE_PASS' : 'RESEARCH_GATE_FAIL',
    automaticPromotion: false,
    passingVariants: passing.map((row) => row.variant),
    variants,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...value] = arg.slice(2).split('=');
    return [key, value.join('=')];
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out) throw new Error('--in and --out are required');
  const gate = evaluateEntryRelativeGate(JSON.parse(fs.readFileSync(args.in, 'utf8')));
  fs.writeFileSync(args.out, JSON.stringify(gate, null, 2));
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('nifty-180-entry-relative-gate.mjs')) main();
