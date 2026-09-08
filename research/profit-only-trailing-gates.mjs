import fs from 'node:fs';

export const TRAILING_VARIANTS = Object.freeze([
  'RETEST15_TRAIL_5_AFTER_BE_10',
  'RETEST15_TRAIL_10_AFTER_BE_10',
  'PREVIOUS_DAY_BREAK_TRAIL_5_AFTER_BE_10',
  'PREVIOUS_DAY_BREAK_TRAIL_10_AFTER_BE_10',
]);

export function evaluateTrailingGates(result) {
  const variants = {};
  for (const key of TRAILING_VARIANTS) {
    const combined = result?.variants?.[key]?.summary?.combined ?? {};
    const checks = {
      minimumSample: (combined.current?.trades ?? 0) >= 100,
      normalProfitable: (combined.current?.totalNetPnl ?? 0) > 0 && (combined.current?.profitFactor ?? 0) > 1,
      stress05Profitable: (combined.stress0_5?.totalNetPnl ?? 0) > 0 && (combined.stress0_5?.profitFactor ?? 0) > 1,
      stress10Profitable: (combined.stress1_0?.totalNetPnl ?? 0) > 0 && (combined.stress1_0?.profitFactor ?? 0) > 1,
    };
    variants[key] = { checks, passed: Object.values(checks).every(Boolean) };
  }
  const passed = Object.values(variants).some((row) => row.passed);
  return { schemaVersion: 1, study: 'Profit-only stepped trailing variants', variants, passed,
    decision: passed ? 'ADVANCE_TO_UNTOUCHED_VALIDATION' : 'REJECT_TRAILING_VARIANTS' };
}

if (process.argv[1]?.endsWith('profit-only-trailing-gates.mjs')) {
  const arg=(name)=>process.argv.find((x)=>x.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const gate=evaluateTrailingGates(JSON.parse(fs.readFileSync(arg('in'),'utf8')));
  if(arg('out'))fs.writeFileSync(arg('out'),`${JSON.stringify(gate,null,2)}\n`);
  process.stdout.write(`${JSON.stringify(gate,null,2)}\n`);
  if(arg('enforce')==='true'&&!gate.passed)process.exitCode=1;
}
