import fs from 'node:fs';

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function phaseFor(document) {
  const { startDate, endDate } = document.period;
  if (startDate >= '2020-01-01' && endDate <= '2024-12-31') return 'discovery';
  if (startDate >= '2025-01-01' && endDate <= '2025-12-31') return 'validation';
  if (startDate >= '2026-01-01' && endDate <= '2026-12-31') return 'holdout';
  return 'custom';
}

function yearDiagnostics(trades, scenario) {
  const totals = {};
  for (const row of trades) {
    const year = row.date.slice(0, 4);
    totals[year] = (totals[year] ?? 0) + row.costs[scenario].netPnl;
  }
  const values = Object.values(totals);
  const positiveTotal = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  return {
    totals,
    positiveYears: values.filter((value) => value > 0).length,
    maximumPositiveContribution: positiveTotal > 0
      ? Math.max(0, ...values) / positiveTotal
      : null,
  };
}

export function evaluateIronCondorGates(document) {
  const phase = phaseFor(document);
  const summary = document.summary;
  const trades = document.results.filter((row) => row.status === 'TRADE');
  const missingRate = summary.observedSessions ? summary.dataMissingSessions / summary.observedSessions : 1;
  const medianMaximumLossRupees = median(trades.map((row) => row.maximumLossPoints * row.lotSize));
  const years = yearDiagnostics(trades, 'stress0_5');
  const checks = [];
  const check = (name, pass, observed, required) => checks.push({ name, pass, observed, required });

  if (phase === 'discovery') {
    check('observed sessions', summary.observedSessions >= 1000, summary.observedSessions, '>= 1000');
    check('executed trades', summary.trades >= 100, summary.trades, '>= 100');
    check('missing-data rate', missingRate <= 0.05, missingRate, '<= 5%');
    check('normalized net P&L', summary.normalizedCosts?.totalNetPnlRupees > 0, summary.normalizedCosts?.totalNetPnlRupees, '> 0');
    check('normalized profit factor', summary.normalizedCosts?.profitFactor >= 1.2, summary.normalizedCosts?.profitFactor, '>= 1.20');
    check('0.5-point stress net P&L', summary.stress0_5?.totalNetPnlRupees > 0, summary.stress0_5?.totalNetPnlRupees, '> 0');
    check('0.5-point stress profit factor', summary.stress0_5?.profitFactor >= 1.1, summary.stress0_5?.profitFactor, '>= 1.10');
    check('1-point stress net P&L', summary.stress1_0?.totalNetPnlRupees > 0, summary.stress1_0?.totalNetPnlRupees, '> 0');
    check('1-point stress profit factor', summary.stress1_0?.profitFactor >= 1, summary.stress1_0?.profitFactor, '>= 1.00');
    check('positive stress years', years.positiveYears >= 4, years.positiveYears, '>= 4 of 5');
    check('single-year concentration', years.maximumPositiveContribution <= 0.65, years.maximumPositiveContribution, '<= 65% of positive P&L');
    check(
      'stress drawdown',
      medianMaximumLossRupees > 0 && summary.stress0_5?.maximumDrawdownRupees <= 15 * medianMaximumLossRupees,
      summary.stress0_5?.maximumDrawdownRupees,
      '<= 15 median defined-risk losses',
    );
  } else if (phase === 'validation') {
    check('observed sessions', summary.observedSessions >= 200, summary.observedSessions, '>= 200');
    check('executed trades', summary.trades >= 20, summary.trades, '>= 20');
    check('missing-data rate', missingRate <= 0.05, missingRate, '<= 5%');
    check('0.5-point stress net P&L', summary.stress0_5?.totalNetPnlRupees > 0, summary.stress0_5?.totalNetPnlRupees, '> 0');
    check('0.5-point stress profit factor', summary.stress0_5?.profitFactor >= 1.05, summary.stress0_5?.profitFactor, '>= 1.05');
  } else if (phase === 'holdout') {
    check('observed sessions', summary.observedSessions >= 50, summary.observedSessions, '>= 50');
    check('executed trades', summary.trades >= 10, summary.trades, '>= 10');
    check('missing-data rate', missingRate <= 0.05, missingRate, '<= 5%');
    check('0.5-point stress net P&L', summary.stress0_5?.totalNetPnlRupees > 0, summary.stress0_5?.totalNetPnlRupees, '> 0');
  }
  return {
    phase,
    pass: phase === 'custom' ? null : checks.every((row) => row.pass),
    diagnostics: { missingRate, medianMaximumLossRupees, stress0_5ByYear: years },
    checks,
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
  if (!args.in) throw new Error('--in is required');
  const report = evaluateIronCondorGates(JSON.parse(fs.readFileSync(args.in, 'utf8')));
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (args.enforce === 'true' && report.pass === false) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('iron-condor-gates.mjs')) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}
