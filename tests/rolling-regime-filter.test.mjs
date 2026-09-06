import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRollingIvFilter, classifyRollingRegime, percentileAgainstPrior } from '../research/rolling-regime-filter.mjs';

const rules = { lookbackObservations: 3, percentileThreshold: 50, direction: 'AT_OR_ABOVE' };

test('requires the exact frozen number of prior observations', () => {
  assert.deepEqual(classifyRollingRegime(12, [10, 11], rules), { status: 'INSUFFICIENT_HISTORY' });
});

test('uses only prior values and includes ties in percentile rank', () => {
  assert.ok(Math.abs(percentileAgainstPrior(12, [10, 12, 14]) - (200 / 3)) < 1e-10);
  assert.equal(classifyRollingRegime(12, [10, 12, 14], rules).status, 'REGIME_OPEN');
  assert.equal(classifyRollingRegime(9, [10, 12, 14], rules).status, 'REGIME_SKIPPED');
});

test('rolling IV filter is causal and does not treat non-trades as IV history', () => {
  const trade = (date, iv) => ({
    date,
    status: 'TRADE',
    selection: { shortCall: { impliedVolatility: iv }, shortPut: { impliedVolatility: iv } },
  });
  const rows = applyRollingIvFilter([
    trade('2024-01-01', 0.1),
    { date: '2024-01-02', status: 'NO_TRADE' },
    trade('2024-01-03', 0.2),
    trade('2024-01-04', 0.3),
    trade('2024-01-05', 0.25),
  ], rules);
  assert.equal(rows[3].regime.status, 'INSUFFICIENT_HISTORY');
  assert.equal(rows[4].regime.status, 'REGIME_OPEN');
  assert.ok(Math.abs(rows[4].regime.percentile - (200 / 3)) < 1e-10);
});
