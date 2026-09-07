import fs from 'node:fs';

function checks(summary) {
  const normal = summary?.current ?? {};
  const stress05 = summary?.stress0_5 ?? {};
  const stress10 = summary?.stress1_0 ?? {};
  return {
    minimumSample: (normal.trades ?? 0) >= 100,
    normalProfitable: (normal.totalNetPnl ?? 0) > 0 && (normal.profitFactor ?? 0) > 1,
    stress05Profitable: (stress05.totalNetPnl ?? 0) > 0 && (stress05.profitFactor ?? 0) > 1,
    stress10Profitable: (stress10.totalNetPnl ?? 0) > 0 && (stress10.profitFactor ?? 0) > 1,
  };
}

export function evaluateCloseEntryStopGates(result) {
  const variants = {};
  for (const [key, value] of Object.entries(result?.variants ?? {})) {
    const combined = checks(value.summary?.combined);
    variants[key] = { checks: combined, passed: Object.values(combined).every(Boolean) };
  }
  const passed = Object.values(variants).some((variant) => variant.passed);
  return { schemaVersion: 1, study: result?.study, passed, variants, decision: passed ? 'ADVANCE_TO_VALIDATION_REVIEW' : 'REJECT_DISCOVERY' };
}

if (process.argv[1]?.endsWith('nifty-180-close-entry-stop-gates.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const result = JSON.parse(fs.readFileSync(arg('in'), 'utf8'));
  const gate = evaluateCloseEntryStopGates(result);
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(gate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
  if (arg('enforce') === 'true' && !gate.passed) process.exitCode = 1;
}
