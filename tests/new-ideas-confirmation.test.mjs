import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateConfirmation } from '../research/new-ideas-confirmation.mjs';
import { mergeV2Shards } from '../research/merge-new-ideas-v2-shards.mjs';

function v2Trade(date, side = 'CE') {
  const money = (netPnl) => ({ netPnl });
  return {
    date, side, entryTime: `${date}T09:31:00+05:30`,
    capitalScenarios: { 60000: { affordable: true, currentCosts: money(100), stress0_5: money(80), stress1_0: money(60) } },
  };
}

test('confirmation retains only same-date same-direction V2 trades', () => {
  const v2 = { period: {}, integrity: { shardCount: 60, uniqueMonths: 60 }, diagnostics: {}, trades: [v2Trade('2020-01-02', 'CE'), v2Trade('2020-01-03', 'PE')] };
  const retest = { variants: { RETEST15_CONFIRM_BE_10: { trades: [{ date: '2020-01-02', side: 'CE' }, { date: '2020-01-03', side: 'CE' }] } } };
  const result = evaluateConfirmation(v2, retest);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].date, '2020-01-02');
  assert.equal(result.sourceIntegrity.rejectedForDisagreement, 1);
  assert.equal(result.passed, false);
});

test('V2 merge rejects an incomplete discovery shard set', () => {
  assert.throws(() => mergeV2Shards([], { expected: 60 }), /Expected 60/);
});

test('V2 merge rejects silent loss of a baseline trade', () => {
  const documents = Array.from({ length: 2 }, (_, index) => ({
    period: { startDate: `2020-0${index + 1}-01`, endDate: `2020-0${index + 1}-28` },
    baselineDiagnostics: { scoredTrades: 1 },
    momentumDiagnostics: { requestRetries: 0 },
    variants: { 20: { trades: index ? [] : [v2Trade('2020-01-02')] } },
  }));
  assert.throws(
    () => mergeV2Shards(documents, { startDate: '2020-01-01', endDate: '2020-02-29', expected: 2 }),
    /lost a baseline trade/,
  );
});
