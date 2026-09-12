import { readFile, writeFile } from 'node:fs/promises';

export function evaluateEventFutures(result) {
  const normal = result.summary['0.5']; const stress = result.summary['1']; const severe = result.summary['2'];
  const checks = { sample: normal.performance.count >= 100, coverage: result.coverage.missingRate <= 0.02, normalEconomics: normal.performance.total > 0 && normal.performance.profitFactor >= 1.20, stressEconomics: stress.performance.total > 0 && stress.performance.profitFactor >= 1.05, severePositive: severe.performance.total > 0, clusteredBootstrap: normal.clusteredMeanConfidence.lower > 0 };
  const decision = !checks.coverage ? 'INVALID_DATA' : Object.values(checks).every(Boolean) ? 'PASS_DISCOVERY' : 'REJECT_DISCOVERY';
  return { decision, checks, normal: normal.performance, stress: stress.performance, severe: severe.performance };
}

const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => { const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')]; }));
if (process.argv[1]?.endsWith('event-conditioned-futures-gates.mjs')) {
  const input = JSON.parse(await readFile(args.in, 'utf8')); const verdict = evaluateEventFutures(input);
  await writeFile(args.out, `${JSON.stringify(verdict, null, 2)}\n`); console.log(JSON.stringify(verdict, null, 2));
  if (args.enforce === 'true' && verdict.decision !== 'PASS_DISCOVERY') process.exitCode = 2;
}
