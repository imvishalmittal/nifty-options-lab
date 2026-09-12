import test from 'node:test';
import assert from 'node:assert/strict';
import { alignUsContext, backtestEventConditionedFutures, eventDirection } from '../research/event-conditioned-futures-engine.mjs';
import { evaluateEventFutures } from '../research/event-conditioned-futures-gates.mjs';

test('aligns only a completed prior US session across a holiday', () => {
  const sp = [{ date: '2024-01-01', close: 100 }, { date: '2024-01-02', close: 99 }]; const nq = [{ date: '2024-01-01', close: 100 }, { date: '2024-01-02', close: 98 }];
  const map = alignUsContext(sp, nq, ['2024-01-03']); assert.equal(map.get('2024-01-03').usDate, '2024-01-02');
});

test('requires both US indices beyond the symmetric frozen threshold', () => {
  assert.equal(eventDirection({ sp500ReturnPct: 0.6, nasdaqReturnPct: 0.8 }), 'LONG');
  assert.equal(eventDirection({ sp500ReturnPct: -0.6, nasdaqReturnPct: -0.8 }), 'SHORT');
  assert.equal(eventDirection({ sp500ReturnPct: -0.6, nasdaqReturnPct: 0.2 }), null);
});

test('event trade uses actual next India futures open and same-session settlement', () => {
  const rows = [{ date: '2024-01-03', contracts: [{ expiry: '2024-01-25', open: 22000, settle: 21900 }] }]; const contexts = new Map([['2024-01-03', { usDate: '2024-01-02', sp500ReturnPct: -1, nasdaqReturnPct: -1 }]]);
  const result = backtestEventConditionedFutures(rows, contexts, { startDate: '2024-01-03', endDate: '2024-01-03' }); assert.equal(result.trades[0].direction, 'SHORT'); assert.ok(result.trades[0].pnl['0.5'] > 0);
});

test('event gate rejects negative evidence', () => {
  const weak = { performance: { count: 100, total: -1, profitFactor: 0.9 }, clusteredMeanConfidence: { lower: -1 } };
  assert.equal(evaluateEventFutures({ summary: { '0.5': weak, '1': weak, '2': weak }, coverage: { missingRate: 0 } }).decision, 'REJECT_DISCOVERY');
});
