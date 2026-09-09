import fs from 'node:fs';

export const RISK_CAP_VARIANTS = Object.freeze(['RETEST15', 'PREVIOUS_DAY_BREAK'].flatMap((signal) =>
  ['CONFIRM_BE_10', 'CONFIRM_BE_10_CAP_5', 'CONFIRM_BE_10_CAP_10', 'CONFIRM_BE_10_CAP_15'].map((exit) => `${signal}_${exit}`)));

function checksFor(summary = {}) {
  return {
    minimumSample: (summary.current?.trades ?? 0) >= 100,
    normalProfitable: (summary.current?.totalNetPnl ?? 0) > 0 && (summary.current?.profitFactor ?? 0) > 1,
    stress05Profitable: (summary.stress0_5?.totalNetPnl ?? 0) > 0 && (summary.stress0_5?.profitFactor ?? 0) > 1,
    stress10Profitable: (summary.stress1_0?.totalNetPnl ?? 0) > 0 && (summary.stress1_0?.profitFactor ?? 0) > 1,
  };
}

export function evaluateRiskCapGates(result) {
  const variants = {};
  for (const key of RISK_CAP_VARIANTS) {
    const summaries = result?.variants?.[key]?.summary ?? {};
    variants[key] = {};
    for (const side of ['combined', 'CE', 'PE']) {
      const checks = checksFor(summaries[side]);
      variants[key][side] = { checks, passed: Object.values(checks).every(Boolean) };
    }
  }
  const passedCandidates = Object.entries(variants).flatMap(([key, sides]) =>
    Object.entries(sides).filter(([, value]) => value.passed).map(([side]) => ({ key, side })));
  return { schemaVersion: 1, study: 'Profit-only maximum initial-risk caps', variants, passedCandidates,
    passed: passedCandidates.length > 0, decision: passedCandidates.length ? 'REVIEW_PASSING_CANDIDATES' : 'REJECT_RISK_CAP_VARIANTS' };
}

if (process.argv[1]?.endsWith('profit-only-risk-cap-gates.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const gate = evaluateRiskCapGates(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(gate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
  if (arg('enforce') === 'true' && !gate.passed) process.exitCode = 1;
}
