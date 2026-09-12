import { readFile, writeFile } from 'node:fs/promises';
import { annualPerformance } from './positional-futures-engine.mjs';

export const POSITIONAL_FUTURES_GATES = Object.freeze({
  minimumTrades: 60,
  maximumMissingRate: 0.02,
  minimumNormalProfitFactor: 1.20,
  minimumStress1ProfitFactor: 1.05,
  maximumDrawdownRupees: 250000,
  minimumProfitableYears: 5,
  maximumYearPositiveContribution: 0.50,
  requirePositiveStress2: true,
  requirePositiveClusteredLowerBound: true,
});

export function evaluatePositionalFutures(result) {
  const normal = result.summary['0.5']; const stress1 = result.summary['1']; const stress2 = result.summary['2'];
  const annual = result.annual ?? annualPerformance(result.trades);
  const positiveYears = Object.values(annual).filter((year) => year.total > 0);
  const grossPositive = positiveYears.reduce((sum, year) => sum + year.total, 0);
  const concentration = grossPositive > 0 ? Math.max(...positiveYears.map((year) => year.total / grossPositive)) : null;
  const checks = {
    sample: normal.performance.count >= POSITIONAL_FUTURES_GATES.minimumTrades,
    coverage: result.coverage.missingRate <= POSITIONAL_FUTURES_GATES.maximumMissingRate,
    normalEconomics: normal.performance.total > 0 && normal.performance.profitFactor >= POSITIONAL_FUTURES_GATES.minimumNormalProfitFactor,
    stress1Economics: stress1.performance.total > 0 && stress1.performance.profitFactor >= POSITIONAL_FUTURES_GATES.minimumStress1ProfitFactor,
    stress2Positive: stress2.performance.total > 0,
    drawdown: normal.performance.maxDrawdown <= POSITIONAL_FUTURES_GATES.maximumDrawdownRupees,
    yearStability: positiveYears.length >= POSITIONAL_FUTURES_GATES.minimumProfitableYears,
    concentration: concentration != null && concentration <= POSITIONAL_FUTURES_GATES.maximumYearPositiveContribution,
    clusteredBootstrap: normal.clusteredMeanConfidence.lower > 0,
  };
  return { schemaVersion: 1, decision: Object.values(checks).every(Boolean) ? 'PASS_DISCOVERY' : 'REJECT_DISCOVERY', frozenGates: POSITIONAL_FUTURES_GATES, checks, diagnostics: { positiveYears: positiveYears.length, yearPositiveContribution: concentration }, normal: normal.performance, stress1: stress1.performance, stress2: stress2.performance };
}

async function main() {
  const options = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => { const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')]; }));
  if (!options.in || !options.out) throw new Error('--in and --out are required');
  const result = JSON.parse(await readFile(options.in, 'utf8')); const verdict = evaluatePositionalFutures(result);
  await writeFile(options.out, `${JSON.stringify(verdict, null, 2)}\n`); console.log(JSON.stringify(verdict, null, 2));
  if (options.enforce === 'true' && verdict.decision !== 'PASS_DISCOVERY') process.exitCode = 2;
}

if (process.argv[1]?.endsWith('positional-futures-gates.mjs')) main().catch((error) => { console.error(error.stack ?? error); process.exit(1); });
