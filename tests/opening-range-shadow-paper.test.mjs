import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactOpeningRangeShadowSession,
  shouldRunOpeningRangeShadow,
  upsertOpeningRangeShadowJournal,
} from '../paper/opening-range-shadow-journal.mjs';

test('experimental shadow lane forbids historical backfill and duplicate terminal dates', () => {
  assert.deepEqual(shouldRunOpeningRangeShadow({ sessions: [] }, '2026-09-01'), { run: false, reason: 'Historical backfill is forbidden' });
  const journal = { sessions: [{ date: '2026-09-02', status: 'NO_TRADE' }] };
  assert.equal(shouldRunOpeningRangeShadow(journal, '2026-09-02').run, false);
  assert.equal(shouldRunOpeningRangeShadow(journal, '2026-09-02', true).run, true);
});

test('trade is compacted with normal and stress evidence without joining V2-V11', () => {
  const session = compactOpeningRangeShadowSession({
    date: '2026-09-02', status: 'TRADE', signal: { direction: 'UP', high: 25000, low: 24800, confirmationTimestamp: '2026-09-02T09:49:00+05:30' },
    expiry: '2026-09-03', selection: { short: { symbol: 'SHORT', strike: 25000, optionType: 'PE' }, long: { symbol: 'LONG', strike: 24700, optionType: 'PE' } },
    entryTimestamp: '2026-09-02T09:50:00+05:30', entryCredit: 40, exitTimestamp: '2026-09-02T10:30:00+05:30', exitReason: 'TARGET', lotSize: 65,
    costs: {
      normalized: { netPnl: 1000, charges: 100, legs: { short: { grossPnl: 900 }, long: { grossPnl: 200 } } },
      stress0_5: { netPnl: 800, charges: 100, legs: { short: { grossPnl: 750 }, long: { grossPnl: 150 } } },
      stress1_0: { netPnl: 600, charges: 100, legs: { short: { grossPnl: 600 }, long: { grossPnl: 100 } } },
    },
  }, '2026-09-02T10:31:00Z');
  const journal = upsertOpeningRangeShadowJournal({ sessions: [] }, session);
  assert.equal(journal.meta.excludedFromV2V11, true);
  assert.equal(journal.meta.confirmedEdge, false);
  assert.equal(journal.sessions[0].normalized.netPnl, 1000);
  assert.equal(journal.sessions[0].short.strike - journal.sessions[0].long.strike, 300);
});

test('a failed operational attempt stays retryable', () => {
  const journal = { sessions: [{ date: '2026-09-02', status: 'FAILED' }] };
  assert.equal(shouldRunOpeningRangeShadow(journal, '2026-09-02').run, true);
});
