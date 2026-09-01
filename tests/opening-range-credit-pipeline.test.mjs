import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeShards } from '../research/merge-opening-range-credit-shards.mjs';
import { validateOpeningRangeCredit } from '../research/opening-range-credit-integrity.mjs';
import { gateOpeningRangeCredit } from '../research/opening-range-credit-gates.mjs';

test('merger requires exactly 60 distinct monthly shards', () => {
  assert.throws(() => mergeShards([], '2020-01-01', '2024-12-31'), /Expected 60/);
});

test('integrity rejects a non-causal trade', () => {
  const report = validateOpeningRangeCredit({ strategy: 'opening-range-atm-credit-spread', period: { startDate: '2020-01-01', endDate: '2024-12-31' }, shardCount: 60, rules: { hedgeWidth: 300, rangeEnd: '09:44', exit: '15:15' }, results: [{ date: '2020-01-01', status: 'TRADE', signal: { confirmationTimestamp: '2020-01-01T10:00:00+05:30', direction: 'UP' }, entryTimestamp: '2020-01-01T10:00:00+05:30', exitTimestamp: '2020-01-01T11:00:00+05:30', selection: { short: { strike: 100, optionType: 'PE' }, long: { strike: -200, optionType: 'PE' } }, costs: { normalized: { netPnl: 1 }, stress0_5: { netPnl: 1 }, stress1_0: { netPnl: 1 } } }], summary: { trades: 1 } });
  assert.equal(report.valid, false);
  assert.match(report.errors.join(' '), /non-causal entry/);
});

test('gates do not pass an empty result', () => {
  const report = gateOpeningRangeCredit({ results: [], summary: { normalized: { netPnl: 0, profitFactor: null }, stress0_5: { netPnl: 0, profitFactor: null }, stress1_0: { netPnl: 0, profitFactor: null } } });
  assert.equal(report.pass, false);
  assert.equal(report.checks.sample, false);
});
