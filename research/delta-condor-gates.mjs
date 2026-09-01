import fs from 'node:fs';

function groupedPnl(trades, key, scenario) {
  const output = new Map();
  for (const row of trades) output.set(key(row.date), (output.get(key(row.date)) ?? 0) + row.costs[scenario].netPnl);
  return Object.fromEntries([...output.entries()].sort());
}

function bootstrapLower(values, iterations = 10000) {
  if (!values.length) return null;
  let seed = 0x51f15e;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const means = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) sum += values[Math.floor(random() * values.length)];
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  return means[Math.floor(iterations * 0.025)];
}

export function gateDeltaCondor(document) {
  const trades = document.results.filter((row) => row.status === 'TRADE');
  const years = groupedPnl(trades, (date) => date.slice(0, 4), 'normalized');
  const months = groupedPnl(trades, (date) => date.slice(0, 7), 'normalized');
  const stressYears = groupedPnl(trades, (date) => date.slice(0, 4), 'stress0_5');
  const positiveYears = Object.values(years).filter((value) => value > 0);
  const concentration = positiveYears.length ? Math.max(...positiveYears) / positiveYears.reduce((sum, value) => sum + value, 0) : null;
  const missingRate = document.results.length ? document.results.filter((row) => row.status === 'DATA_MISSING').length / document.results.length : 1;
  const sampleMinimum = document.mode === 'monthly-rsi' ? 40 : 100;
  const lower = bootstrapLower(Object.values(months));
  const checks = {
    sample: trades.length >= sampleMinimum,
    normalPnl: document.summary.normalized.netPnl > 0,
    normalPf: document.summary.normalized.profitFactor >= 1.20,
    stress0_5Pnl: document.summary.stress0_5.netPnl > 0,
    stress0_5Pf: document.summary.stress0_5.profitFactor >= 1.05,
    stress1Pnl: document.summary.stress1_0.netPnl > 0,
    profitableYears: Object.values(years).filter((value) => value > 0).length >= 3,
    profitableStressYears: Object.values(stressYears).filter((value) => value > 0).length >= 3,
    profitableMonths: Object.values(months).filter((value) => value > 0).length >= Math.ceil(Object.keys(months).length * 0.55),
    bootstrap: lower > 0,
    concentration: concentration != null && concentration <= 0.50,
    missing: missingRate <= 0.02,
  };
  return { pass: Object.values(checks).every(Boolean), checks, yearly: years, monthly: months, stress0_5Yearly: stressYears, clusteredMonthlyBootstrapLower95: lower, positiveYearConcentration: concentration, missingRate };
}

if (process.argv[1]?.endsWith('delta-condor-gates.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const report = gateDeltaCondor(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  fs.writeFileSync(arg('out'), JSON.stringify(report, null, 2));
  if (arg('enforce') === 'true' && !report.pass) process.exitCode = 1;
}
