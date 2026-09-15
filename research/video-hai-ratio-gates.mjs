import fs from 'node:fs';

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function evaluateVideoHaiGates(document) {
  // The video was published 25-Jan-2026. Only later Mondays are used for the
  // frozen replication gate; Sep-2025 through publication is descriptive.
  const rows = document.results.filter((row) => row.date > '2026-01-25');
  const trades = rows.filter((row) => row.status === 'TRADE');
  const summary = document.publicationEraSummary?.postPublication;
  const missingRate = rows.length ? rows.filter((row) => row.status === 'DATA_MISSING').length / rows.length : 1;
  const medianCapital = median(trades.map((row) => row.capitalRupees));
  const positive = trades.map((row) => row.costs?.stress0_5?.netPnl).filter((x) => x > 0);
  const positiveTotal = positive.reduce((sum, value) => sum + value, 0);
  const maximumWinnerShare = positiveTotal > 0 ? Math.max(...positive) / positiveTotal : null;
  const checks = [];
  const check = (name, pass, observed, required) => checks.push({ name, pass, observed, required });
  check('post-publication Mondays', rows.length >= 25, rows.length, '>= 25');
  check('executed trades', trades.length >= 20, trades.length, '>= 20');
  check('missing-data rate', missingRate <= 0.05, missingRate, '<= 5%');
  check('0.5-point stress net P&L', summary?.stress0_5?.totalNetPnlRupees > 0, summary?.stress0_5?.totalNetPnlRupees, '> 0');
  check('0.5-point stress profit factor', summary?.stress0_5?.profitFactor >= 1.05, summary?.stress0_5?.profitFactor, '>= 1.05');
  check('1-point stress net P&L', summary?.stress1_0?.totalNetPnlRupees > 0, summary?.stress1_0?.totalNetPnlRupees, '> 0');
  check('stress drawdown', medianCapital > 0 && summary?.stress0_5?.maximumDrawdownRupees <= 0.08 * medianCapital, summary?.stress0_5?.maximumDrawdownRupees, '<= 8% of median capital');
  check('single-winner concentration', maximumWinnerShare != null && maximumWinnerShare <= 0.5, maximumWinnerShare, '<= 50% of positive P&L');
  return { phase: 'post-publication-replication', pass: checks.every((row) => row.pass), diagnostics: { missingRate, medianCapital, maximumWinnerShare }, checks };
}

function args(argv) {
  return Object.fromEntries(argv.filter((x) => x.startsWith('--')).map((x) => { const [k, ...v] = x.slice(2).split('='); return [k, v.join('=')]; }));
}

if (process.argv[1]?.endsWith('video-hai-ratio-gates.mjs')) {
  try {
    const options = args(process.argv.slice(2));
    if (!options.in) throw new Error('--in is required');
    const report = evaluateVideoHaiGates(JSON.parse(fs.readFileSync(options.in, 'utf8')));
    if (options.out) fs.writeFileSync(options.out, JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (options.enforce === 'true' && !report.pass) process.exitCode = 1;
  } catch (error) { console.error(error.stack || error.message); process.exit(1); }
}
