import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeEntryRelativeShards } from '../research/merge-nifty-180-entry-relative-shards.mjs';
import { ENTRY_RELATIVE_RULES, ENTRY_RELATIVE_VARIANTS } from '../research/nifty-180-entry-relative.mjs';

function trade(date, netPnl) {
  return {
    date,
    grossPnlRupees: netPnl,
    costs: {
      normalized: { netPnl },
      stress0_5: { netPnl: netPnl - 1 },
      stress1_0: { netPnl: netPnl - 2 },
    },
  };
}

function shard(month, netPnl) {
  const rows = [trade(`${month}-02`, netPnl)];
  return {
    schemaVersion: 1,
    strategy: 'nifty-180-entry-relative-risk',
    period: { startDate: `${month}-01`, endDate: `${month}-28` },
    rules: ENTRY_RELATIVE_RULES,
    methodology: { frozen: true },
    diagnostics: { fullSessionFetches: 1, apiRequestsBeyondBaseline: 2, retriesBeyondBaseline: 0 },
    variants: Object.fromEntries(ENTRY_RELATIVE_VARIANTS.map((variant) => [variant.id, {
      label: variant.label,
      trades: rows,
    }])),
  };
}

test('merges complete monthly coverage and recomputes summaries', () => {
  const merged = mergeEntryRelativeShards([shard('2020-02', -5), shard('2020-01', 10)], {
    startDate: '2020-01-01',
    endDate: '2020-02-29',
  });
  assert.equal(merged.diagnostics.shardCount, 2);
  assert.equal(merged.diagnostics.fullSessionFetches, 2);
  assert.deepEqual(merged.variants.FIXED_160_220.trades.map((row) => row.date), ['2020-01-02', '2020-02-02']);
  assert.equal(merged.variants.FIXED_160_220.summary.totalNetPnlRupees, 5);
});

test('rejects missing or duplicate month coverage', () => {
  assert.throws(() => mergeEntryRelativeShards([shard('2020-01', 1)], {
    startDate: '2020-01-01',
    endDate: '2020-02-29',
  }), /coverage mismatch/);
  assert.throws(() => mergeEntryRelativeShards([shard('2020-01', 1), shard('2020-01', 2)], {
    startDate: '2020-01-01',
    endDate: '2020-01-31',
  }), /Duplicate shard month/);
});
