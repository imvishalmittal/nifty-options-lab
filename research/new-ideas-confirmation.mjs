import fs from 'node:fs';

import { commonNewIdeaChecks, summarizeNewIdeaTrades } from './new-ideas-overlays.mjs';

function convertV2Trade(trade) {
  const scenario = trade?.capitalScenarios?.['60000'];
  if (!scenario?.affordable) return null;
  return {
    ...trade,
    money: {
      current: scenario.currentCosts?.netPnl,
      stress0_5: scenario.stress0_5?.netPnl,
      stress1_0: scenario.stress1_0?.netPnl,
    },
  };
}

export function evaluateConfirmation(v2Document, retestDocument) {
  const retest = retestDocument?.variants?.RETEST15_CONFIRM_BE_10?.trades ?? [];
  const directionByDate = new Map();
  for (const trade of retest) {
    if (!directionByDate.has(trade.date)) directionByDate.set(trade.date, new Set());
    directionByDate.get(trade.date).add(trade.side);
  }
  const host = (v2Document?.trades ?? []).map(convertV2Trade).filter(Boolean);
  const trades = host.filter((trade) => directionByDate.get(trade.date)?.has(trade.side));
  const summary = summarizeNewIdeaTrades(trades);
  const sourceIntegrity = {
    v2ShardCount: v2Document?.integrity?.shardCount ?? null,
    v2UniqueMonths: v2Document?.integrity?.uniqueMonths ?? null,
    v2HostTrades: host.length,
    retestHostTrades: retest.length,
    agreeingTrades: trades.length,
    rejectedForDisagreement: host.length - trades.length,
    missingDays: v2Document?.diagnostics?.missingDays ?? 0,
    boundaryDays: v2Document?.diagnostics?.boundaryDays ?? 0,
    ambiguousDays: v2Document?.diagnostics?.ambiguousDays ?? 0,
    rateLimitRetries: v2Document?.diagnostics?.rateLimitRetries ?? 0,
    momentumRequestRetries: v2Document?.diagnostics?.momentumRequestRetries ?? 0,
  };
  const checks = {
    sourceCoverage: sourceIntegrity.v2ShardCount === 60 && sourceIntegrity.v2UniqueMonths === 60,
    sourceIntegrity: sourceIntegrity.missingDays === 0
      && sourceIntegrity.boundaryDays === 0
      && sourceIntegrity.ambiguousDays === 0
      && sourceIntegrity.rateLimitRetries === 0
      && sourceIntegrity.momentumRequestRetries === 0,
    ...commonNewIdeaChecks(summary),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schemaVersion: 1,
    study: 'Idea 4 — V2 premium-cross and Retest-15 direction confirmation',
    period: v2Document.period,
    frozenExecution: 'V2 actual selected contract; next-bar entry; ₹160 stop; ₹220 activation; continuous 20-point trail',
    sourceIntegrity,
    summary,
    checks,
    passed,
    decision: passed ? 'ADVANCE_TO_VALIDATION' : 'REJECT_DISCOVERY',
    trades,
  };
}

if (process.argv[1]?.endsWith('new-ideas-confirmation.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const result = evaluateConfirmation(
    JSON.parse(fs.readFileSync(arg('v2'), 'utf8')),
    JSON.parse(fs.readFileSync(arg('retest'), 'utf8')),
  );
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ decision: result.decision, sourceIntegrity: result.sourceIntegrity }, null, 2)}\n`);
}
