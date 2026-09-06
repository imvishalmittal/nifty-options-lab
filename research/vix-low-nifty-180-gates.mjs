import fs from 'node:fs';

function passSummary(summary) {
  const current = summary?.current ?? {};
  const stress05 = summary?.stress0_5 ?? {};
  const stress10 = summary?.stress1_0 ?? {};
  return {
    minimumSample: (current.trades ?? 0) >= 100,
    normalProfitable: (current.totalNetPnl ?? 0) > 0 && (current.profitFactor ?? 0) > 1,
    stress05Profitable: (stress05.totalNetPnl ?? 0) > 0 && (stress05.profitFactor ?? 0) > 1,
    stress10Profitable: (stress10.totalNetPnl ?? 0) > 0 && (stress10.profitFactor ?? 0) > 1,
  };
}

export function evaluateVixLowNifty180Gates(result) {
  const variants = {};
  for (const key of ['V2', 'V3_10']) {
    const checks = passSummary(result?.variants?.[key]?.summary);
    variants[key] = { checks, passed: Object.values(checks).every(Boolean) };
  }
  return {
    schemaVersion: 1,
    study: result?.study ?? 'O1 VIX-low V2/V3-10 filter',
    passed: Object.values(variants).some((variant) => variant.passed),
    variants,
    decision: Object.values(variants).some((variant) => variant.passed) ? 'ADVANCE_TO_VALIDATION_REVIEW' : 'REJECT_DISCOVERY',
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => {
    const [key, ...rest] = value.slice(2).split('=');
    return [key, rest.join('=') || true];
  }));
}

if (process.argv[1]?.endsWith('vix-low-nifty-180-gates.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const result = JSON.parse(fs.readFileSync(args.in, 'utf8'));
  const gate = evaluateVixLowNifty180Gates(result);
  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(gate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
  if (args.enforce && !gate.passed) process.exitCode = 1;
}
