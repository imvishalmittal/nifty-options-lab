import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAR_CALL_RULES, BEAR_CALL_STRATEGY, VIDEO_STOCK_UNIVERSE } from '../research/stock-bear-call/engine.mjs';
import { validateBearCallResult } from '../research/stock-bear-call/integrity.mjs';

function document(overrides = {}) {
  return {
    schemaVersion: 1,
    strategy: BEAR_CALL_STRATEGY,
    source: { videoId: 'd3X5TNpZ0NM' },
    period: { startDate: '2026-06-04', endDate: '2026-08-28' },
    universe: VIDEO_STOCK_UNIVERSE,
    rules: BEAR_CALL_RULES,
    diagnostics: VIDEO_STOCK_UNIVERSE.map((underlying) => ({ underlying, minuteCandles: 1000, completedTwoHourBars: 150, evaluationBars: 10, williamsCrosses: 0, bearishAlignments: 0, jointSignals: 0 })),
    results: [],
    summary: { trades: 0 },
    ...overrides,
  };
}

test('accepts a frozen empty result as valid but inconclusive', () => {
  const report = validateBearCallResult(document());
  assert.equal(report.valid, true);
  assert.match(report.warnings.join(' '), /inconclusive/);
});

test('accepts the frozen 2025 discovery period only under discovery scope', () => {
  const discovery = document({ period: { startDate: '2025-01-01', endDate: '2025-12-31', warmupStart: '2024-08-01' } });
  assert.equal(validateBearCallResult(discovery, { scope: 'discovery-2025' }).valid, true);
  assert.equal(validateBearCallResult(discovery).valid, false);
});

test('rejects hindsight entry and out-of-band short delta', () => {
  const row = {
    underlying: 'RELIANCE', status: 'DATA_MISSING', date: '2026-06-10', expiry: '2026-06-25',
    signal: { signalTimestamp: '2026-06-10T13:14:00+05:30' }, entryTimestamp: '2026-06-10T13:14:00+05:30',
    selection: { shortCall: { strike: 1500, delta: 0.3 }, longCall: { strike: 1540 } },
  };
  const report = validateBearCallResult(document({ results: [row] }));
  assert.equal(report.valid, false);
  assert.match(report.errors.join(' '), /non-causal entry/);
  assert.match(report.errors.join(' '), /delta outside/);
});
