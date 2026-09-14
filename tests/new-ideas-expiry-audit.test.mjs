import test from 'node:test';
import assert from 'node:assert/strict';

import { auditExpiryDistance, calendarDaysToExpiry } from '../research/new-ideas-expiry-audit.mjs';

test('expiry distance is explicitly calendar days', () => {
  assert.equal(calendarDaysToExpiry('2026-01-16', '2026-01-22'), 6);
});

test('audit keeps one independent V2 observation per session', () => {
  const trade = (date, expiry, pnl, strategy = 'NIFTY ₹180 Momentum V2') => ({
    source: 'BACKTEST', strategy, date, weeklyExpiry: expiry, totalPnl: pnl,
  });
  const result = auditExpiryDistance({ trades: [
    trade('2026-01-16', '2026-01-22', -10),
    trade('2026-01-16', '2026-01-22', 999),
    trade('2026-01-19', '2026-01-22', 20),
    trade('2026-01-19', '2026-01-22', 30, 'NIFTY ₹180 Stepped Trail V3'),
  ] });
  assert.equal(result.sourceRows, 3);
  assert.equal(result.independentV2Sessions, 2);
  assert.deepEqual(result.duplicateV2Dates, ['2026-01-16']);
  assert.equal(result.buckets['6'].totalNetPnl, -10);
  assert.equal(result.buckets['3'].totalNetPnl, 20);
  assert.equal(result.decision, 'DESCRIPTIVE_ONLY_INSUFFICIENT_INDEPENDENT_SAMPLE');
});
