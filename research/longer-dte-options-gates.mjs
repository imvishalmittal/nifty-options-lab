import { readFile, writeFile } from 'node:fs/promises';

export const LONGER_DTE_GATES = Object.freeze({ minimumTrades: 30, maximumMissingRate: 0.02, minimumNormalProfitFactor: 1.20, minimumStressProfitFactor: 1.05, requirePositiveOnePoint: true, requirePositiveClusteredLowerBound: true });

export function evaluateLongerDteCandidate(result) {
  const normal = result.summary['0']; const stress = result.summary['0.5']; const one = result.summary['1'];
  const checks = {
    sample: normal.performance.count >= LONGER_DTE_GATES.minimumTrades,
    coverage: result.coverage.missingRate <= LONGER_DTE_GATES.maximumMissingRate,
    normalEconomics: normal.performance.total > 0 && normal.performance.profitFactor >= LONGER_DTE_GATES.minimumNormalProfitFactor,
    stressEconomics: stress.performance.total > 0 && stress.performance.profitFactor >= LONGER_DTE_GATES.minimumStressProfitFactor,
    onePointPositive: one.performance.total > 0,
    clusteredBootstrap: normal.clusteredMeanConfidence.lower > 0,
  };
  return { decision: Object.values(checks).every(Boolean) ? 'PASS_DISCOVERY' : 'REJECT_DISCOVERY', frozenGates: LONGER_DTE_GATES, checks, normal: normal.performance, stress: stress.performance, onePoint: one.performance };
}

const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => { const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')]; }));
if (process.argv[1]?.endsWith('longer-dte-options-gates.mjs')) {
  if (!args.in || !args.out) throw new Error('--in and --out are required');
  const input = JSON.parse(await readFile(args.in, 'utf8'));
  const verdict = { schemaVersion: 1, p2: evaluateLongerDteCandidate(input.p2), p6: evaluateLongerDteCandidate(input.p6), p4: { decision: 'DESCRIPTIVE_ONLY', reason: 'P4 compares expressions; it cannot pass unless P1 and P2 independently pass their frozen gates.' } };
  await writeFile(args.out, `${JSON.stringify(verdict, null, 2)}\n`); console.log(JSON.stringify(verdict, null, 2));
  if (args.enforce === 'true' && verdict.p2.decision !== 'PASS_DISCOVERY' && verdict.p6.decision !== 'PASS_DISCOVERY') process.exitCode = 2;
}
