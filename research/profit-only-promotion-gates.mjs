import fs from 'node:fs';

export const PROMOTION_VARIANTS = Object.freeze([
  'RETEST15_CONFIRM_BE_10',
  'PREVIOUS_DAY_BREAK_CONFIRM_BE_10',
]);

export function evaluateProfitOnlyPromotionGates(result) {
  const variants = {};
  for (const key of PROMOTION_VARIANTS) {
    const row = result?.variants?.[key];
    const combined = row?.summary?.combined ?? {};
    const checks = {
      minimumSample: (combined.current?.trades ?? 0) >= 100,
      normalProfitable: (combined.current?.totalNetPnl ?? 0) > 0 && (combined.current?.profitFactor ?? 0) > 1,
      stress05Profitable: (combined.stress0_5?.totalNetPnl ?? 0) > 0 && (combined.stress0_5?.profitFactor ?? 0) > 1,
      stress10Profitable: (combined.stress1_0?.totalNetPnl ?? 0) > 0 && (combined.stress1_0?.profitFactor ?? 0) > 1,
    };
    variants[key] = { checks, passed: Object.values(checks).every(Boolean) };
  }
  const passed = Object.values(variants).some((row) => row.passed);
  return {
    schemaVersion: 1,
    study: 'Profit-only directional economic validation',
    note: 'Directional-loss count is diagnostic, not an economic rejection gate',
    variants,
    passed,
    decision: passed ? 'CONTINUE_PROSPECTIVE_PAPER' : 'STOP_NEW_PAPER_ENTRIES',
  };
}

if (process.argv[1]?.endsWith('profit-only-promotion-gates.mjs')) {
  const arg = (name) => process.argv.find((x) => x.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const gate = evaluateProfitOnlyPromotionGates(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(gate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
  if (arg('enforce') === 'true' && !gate.passed) process.exitCode = 1;
}
