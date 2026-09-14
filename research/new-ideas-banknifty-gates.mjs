import fs from 'node:fs';

import { commonNewIdeaChecks, summarizeNewIdeaTrades } from './new-ideas-overlays.mjs';

export function evaluateBankNiftyCandidate(document) {
  const key = 'RETEST15_CONFIRM_BE_10';
  const trades = document?.variants?.[key]?.trades ?? [];
  const summary = summarizeNewIdeaTrades(trades);
  const missing = (document?.sessions ?? []).filter((row) => row.status === 'DATA_MISSING').length;
  const sessions = document?.sessions?.length ?? 0;
  const checks = {
    ...commonNewIdeaChecks(summary),
    coverage: sessions > 0 && missing / sessions <= 0.02,
    bankNiftyOnly: trades.every((row) => row.underlying === 'BANKNIFTY'),
    datedLotSizes: trades.every((row) => [15, 20, 25].includes(row.lotSize)),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schemaVersion: 1,
    study: 'Idea 6 BANKNIFTY Retest-15 + BE10',
    period: document?.period,
    diagnostics: { sessions, trades: trades.length, missing, missingRate: sessions ? missing / sessions : null },
    summary,
    checks,
    passed,
    decision: passed ? 'ADVANCE_TO_VALIDATION' : 'REJECT_DISCOVERY',
  };
}

if (process.argv[1]?.endsWith('new-ideas-banknifty-gates.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const result = evaluateBankNiftyCandidate(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ period: result.period, decision: result.decision, checks: result.checks }, null, 2)}\n`);
}
