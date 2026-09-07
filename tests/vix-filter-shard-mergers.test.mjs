import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeVixLowShards } from '../research/merge-vix-low-nifty-180-shards.mjs';
import { mergeVixHighShards } from '../research/merge-vix-high-opening-range-credit-shards.mjs';

const scenario = (netPnl) => ({ netPnl, profitFactor: netPnl > 0 ? 2 : 0.5 });

test('O1 merger requires every unique shard and rebuilds aggregate summaries', () => {
  const shard = (month, pnl) => ({
    study: 'O1', rules: {}, baseMethodology: {}, period: { startDate: `${month}-01` }, vixInstrument: {},
    sessionCounts: { source: 1, retained: 1, regimes: { REGIME_OPEN: 1 } },
    filteredSessions: [{ date: `${month}-01` }],
    variants: {
      V2: { trades: [{ date: `${month}-01`, money: { current: { netPnl: pnl }, stress0_5: { netPnl: pnl }, stress1_0: { netPnl: pnl } } }] },
      V3_10: { trades: [] },
    },
  });
  const merged = mergeVixLowShards([shard('2020-01', 10), shard('2020-02', -4)], '2020-01-01', '2020-02-29', 2);
  assert.equal(merged.shardCount, 2);
  assert.equal(merged.variants.V2.summary.current.totalNetPnl, 6);
  assert.throws(() => mergeVixLowShards([shard('2020-01', 1)], '2020-01-01', '2020-02-29', 2), /Expected 2 monthly shards/);
});

test('C3 merger requires unique months and rebuilds aggregate scenarios', () => {
  const shard = (month, pnl) => ({
    strategy: 'C3', period: { startDate: `${month}-01` }, rules: {}, vixInstrument: {}, vixRegimeCounts: { REGIME_OPEN: 1 },
    results: [{ date: `${month}-01`, status: 'TRADE', signal: { status: 'SIGNAL' }, exitReason: 'TIME', costs: { normalized: scenario(pnl), stress0_5: scenario(pnl), stress1_0: scenario(pnl) } }],
  });
  const merged = mergeVixHighShards([shard('2020-01', 10), shard('2020-02', -4)], '2020-01-01', '2020-02-29', 2);
  assert.equal(merged.summary.normalized.netPnl, 6);
  assert.throws(() => mergeVixHighShards([shard('2020-01', 1), shard('2020-01', 2)], '2020-01-01', '2020-02-29', 2), /unique months/);
});
