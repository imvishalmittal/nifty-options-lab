import fs from 'node:fs';

function groupedPnl(trades, key, scenario) {
  const map = new Map();
  for (const row of trades) {
    const group = key(row.date);
    map.set(group, (map.get(group) ?? 0) + row.costs[scenario].netPnl);
  }
  return Object.fromEntries([...map.entries()].sort());
}

function bootstrapLowerBound(monthValues, iterations = 10000) {
  if (!monthValues.length) return null;
  let seed = 0x9e3779b9;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const means = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let sum = 0;
    for (let index = 0; index < monthValues.length; index += 1) sum += monthValues[Math.floor(random() * monthValues.length)];
    means.push(sum / monthValues.length);
  }
  means.sort((a, b) => a - b);
  return means[Math.floor(iterations * 0.025)];
}

export function gateOpeningRangeCredit(document) {
  const trades = document.results.filter((row) => row.status === 'TRADE');
  const years = groupedPnl(trades, (date) => date.slice(0, 4), 'normalized');
  const months = groupedPnl(trades, (date) => date.slice(0, 7), 'normalized');
  const stressYears = groupedPnl(trades, (date) => date.slice(0, 4), 'stress0_5');
  const positiveGross = Object.values(years).filter((value) => value > 0);
  const concentration = positiveGross.length ? Math.max(...positiveGross) / positiveGross.reduce((sum, value) => sum + value, 0) : null;
  const eligible = document.results.length;
  const missingRate = eligible ? document.results.filter((row) => row.status === 'DATA_MISSING').length / eligible : 1;
  const checks = {
    sample: trades.length >= 100,
    normalPnl: document.summary.normalized.netPnl > 0,
    normalPf: document.summary.normalized.profitFactor >= 1.20,
    stress0_5Pnl: document.summary.stress0_5.netPnl > 0,
    stress0_5Pf: document.summary.stress0_5.profitFactor >= 1.05,
    stress1Pnl: document.summary.stress1_0.netPnl > 0,
    profitableYears: Object.values(years).filter((value) => value > 0).length >= 3,
    profitableStressYears: Object.values(stressYears).filter((value) => value > 0).length >= 3,
    profitableMonths: Object.values(months).filter((value) => value > 0).length >= Math.ceil(Object.keys(months).length * 0.55),
    bootstrap: bootstrapLowerBound(Object.values(months)) > 0,
    concentration: concentration != null && concentration <= 0.50,
    missing: missingRate <= 0.02,
  };
  return { pass: Object.values(checks).every(Boolean), checks, yearly: years, monthly: months, stress0_5Yearly: stressYears, clusteredMonthlyBootstrapLower95: bootstrapLowerBound(Object.values(months)), positiveYearConcentration: concentration, missingRate };
}

if (process.argv[1]?.endsWith('opening-range-credit-gates.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const report = gateOpeningRangeCredit(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  fs.writeFileSync(arg('out'), JSON.stringify(report, null, 2));
  if (arg('enforce') === 'true' && !report.pass) process.exitCode = 1;
}
