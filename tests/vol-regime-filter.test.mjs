import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVolRegime, classifyVolRegimeForSession, percentileRank, VOL_REGIME_RULES } from '../research/vol-regime-filter.mjs';

test('percentile rank rejects malformed input', () => {
  assert.equal(percentileRank(10, []), null);
  assert.equal(percentileRank(10, [9, Number.NaN]), null);
});

test('classification requires the complete frozen 252-session window', () => {
  assert.deepEqual(classifyVolRegime({ vixReferenceClose: 10, vixHistory: Array(251).fill(10) }), { status: 'INSUFFICIENT_HISTORY' });
});

test('classifies low and high volatility with prior observations only', () => {
  const history = Array.from({ length: 252 }, (_, index) => index + 1);
  assert.equal(classifyVolRegime({ vixReferenceClose: 100, vixHistory: history }).status, 'REGIME_OPEN');
  assert.equal(classifyVolRegime({ vixReferenceClose: 200, vixHistory: history }).status, 'REGIME_SKIPPED');
});

test('session helper rejects duplicate dates instead of biasing the percentile', () => {
  const result = classifyVolRegimeForSession({
    sessionDate: '2025-01-03',
    vixRows: [{ date: '2025-01-01', close: 10 }, { date: '2025-01-01', close: 11 }],
  });
  assert.equal(result.status, 'DATA_INVALID');
});

test('session helper verifies the expected immediately-prior trading date', () => {
  const rows = Array.from({ length: 252 }, (_, index) => ({ date: `2024-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`, close: 10 + index / 100 }));
  const result = classifyVolRegimeForSession({ sessionDate: '2025-01-03', expectedReferenceDate: '2025-01-02', vixRows: rows });
  assert.equal(result.status, 'DATA_MISSING');
});

test('session helper uses exactly the most recent complete lookback', () => {
  const rows = Array.from({ length: 253 }, (_, index) => {
    const date = new Date(Date.UTC(2023, 0, 1 + index)).toISOString().slice(0, 10);
    return { date, close: index === 0 ? 100 : index };
  });
  const referenceDate = rows.at(-1).date;
  const sessionDate = new Date(`${referenceDate}T00:00:00Z`);
  sessionDate.setUTCDate(sessionDate.getUTCDate() + 1);
  const result = classifyVolRegimeForSession({ sessionDate: sessionDate.toISOString().slice(0, 10), expectedReferenceDate: referenceDate, vixRows: rows });
  assert.equal(result.referenceDate, referenceDate);
  assert.equal(result.percentile, 100);
  assert.equal(result.status, 'REGIME_SKIPPED');
  assert.equal(VOL_REGIME_RULES.lookbackTradingDays, 252);
});
