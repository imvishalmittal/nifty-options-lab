import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeDeltaCondorShards } from '../research/merge-delta-condor-shards.mjs';
import { validateDeltaCondor } from '../research/delta-condor-integrity.mjs';
import { gateDeltaCondor } from '../research/delta-condor-gates.mjs';

test('delta-condor merger requires 60 monthly shards', () => {
  assert.throws(() => mergeDeltaCondorShards([], 'weekly-smart', '2020-01-01', '2024-12-31'), /Expected 60/);
});

test('integrity rejects an unhedged or post-expiry structure', () => {
  const document = { mode: 'weekly-smart', strategy: 'weekly-nifty-008-delta-condor', period: { startDate: '2020-01-01', endDate: '2024-12-31' }, shardCount: 60, rules: { targets: { shortCallDelta: .08, shortPutDelta: -.08, longCallDelta: .03, longPutDelta: -.03 }, lifecycle: { targetDebitRatio: .5, stopDebitRatio: 2 } }, results: [{ previousExpiry: '2019-12-26', date: '2020-01-02', underlying: 'NIFTY', expiry: '2020-01-09', status: 'TRADE', entryTimestamp: '2020-01-02T09:45:00+05:30', exitTimestamp: '2020-01-09T15:15:00+05:30', entryCredit: 10, lotSize: 75, selection: { shortCall: { strike: 100, optionType: 'CE', delta: .08 }, longCall: { strike: 100, optionType: 'CE', delta: .03 }, shortPut: { strike: 90, optionType: 'PE', delta: -.08 }, longPut: { strike: 80, optionType: 'PE', delta: -.03 } }, costs: { normalized: { netPnl: 1 }, stress0_5: { netPnl: 1 }, stress1_0: { netPnl: 1 } } }], summary: { trades: 1 } };
  const report = validateDeltaCondor(document, 'weekly-smart');
  assert.equal(report.valid, false);
  assert.match(report.errors.join(' '), /hedges|post-expiry/);
});

test('integrity rejects changed frozen delta targets', () => {
  const document = { mode: 'weekly-smart', strategy: 'weekly-nifty-008-delta-condor', period: { startDate: '2020-01-01', endDate: '2024-12-31' }, shardCount: 60, rules: { targets: { shortCallDelta: .10 }, lifecycle: { targetDebitRatio: .5, stopDebitRatio: 2 } }, results: [] };
  const report = validateDeltaCondor(document, 'weekly-smart');
  assert.equal(report.valid, false);
  assert.match(report.errors.join(' '), /targets changed/);
});

test('empty result fails frozen gates', () => {
  const report = gateDeltaCondor({ mode: 'monthly-rsi', results: [], summary: { normalized: { netPnl: 0, profitFactor: null }, stress0_5: { netPnl: 0, profitFactor: null }, stress1_0: { netPnl: 0, profitFactor: null } } });
  assert.equal(report.pass, false);
});
