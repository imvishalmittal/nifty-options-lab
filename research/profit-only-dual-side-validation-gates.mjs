import fs from 'node:fs';

export const DUAL_SIDE_VARIANTS = Object.freeze([
  'RETEST15_CONFIRM_BE_10_CAP_10',
  'PREVIOUS_DAY_BREAK_CONFIRM_BE_10',
]);

function annual(pairs, scenario, year) {
  const values = pairs.filter((pair) => pair.date.startsWith(year)).map((pair) => pair.money[scenario]);
  return { trades: values.length, totalNetPnl: values.reduce((sum, value) => sum + value, 0) };
}

export function evaluateDualSideValidation(result) {
  const variants = Object.fromEntries(DUAL_SIDE_VARIANTS.map((key) => {
    const paired = result.variants?.[key]?.paired;
    if (!paired) throw new Error(`Missing paired result for ${key}`);
    const annualResults = Object.fromEntries(['2025', '2026'].map((year) => [year,
      Object.fromEntries(['current', 'stress0_5', 'stress1_0'].map((scenario) => [scenario, annual(paired.pairs, scenario, year)])),
    ]));
    const aggregatePassed = ['current', 'stress0_5', 'stress1_0'].every((scenario) =>
      paired.summary[scenario].totalNetPnl > 0 && paired.summary[scenario].profitFactor > 1);
    const everyPeriodPositive = Object.values(annualResults).every((year) =>
      Object.values(year).every((scenario) => scenario.trades > 0 && scenario.totalNetPnl > 0));
    return [key, {
      candidatePairs: paired.candidatePairs,
      executablePairs: paired.pairs.length,
      skippedForCapital: paired.skippedForCapital,
      summary: paired.summary,
      annual: annualResults,
      aggregatePassed,
      everyPeriodPositive,
      passed: aggregatePassed && everyPeriodPositive,
    }];
  }));
  const passedVariants = Object.entries(variants).filter(([, value]) => value.passed).map(([key]) => key);
  return {
    schemaVersion: 1,
    study: 'Profit-only simultaneous CE+PE validation-only comparison',
    period: result.period,
    variants,
    passedVariants,
    passed: passedVariants.length > 0,
    decision: passedVariants.length ? 'REVIEW_FOR_PROSPECTIVE_PAPER' : 'DO_NOT_PROMOTE',
  };
}

if (process.argv[1]?.endsWith('profit-only-dual-side-validation-gates.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const gate = evaluateDualSideValidation(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(gate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
}
