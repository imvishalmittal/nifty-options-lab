import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSessions, buildAlignedSessions, normalizeYahooChart } from '../research/us-close-india-study.mjs';

test('aligns latest completed US session across holidays', () => {
  const sp = [
    { date: '2024-01-04', close: 100 },
    { date: '2024-01-05', close: 99 },
    { date: '2024-01-08', close: 101 },
  ];
  const nq = [
    { date: '2024-01-04', close: 200 },
    { date: '2024-01-05', close: 196 },
    { date: '2024-01-08', close: 198 },
  ];
  const nifty = [
    { date: '2024-01-05', open: 1000, close: 1000 },
    { date: '2024-01-08', open: 990, close: 980 },
    { date: '2024-01-09', open: 990, close: 995 },
  ];
  const rows = buildAlignedSessions(sp, nq, nifty);
  assert.equal(rows[0].usDate, '2024-01-05');
  assert.ok(Math.abs(rows[0].sp500ReturnPct + 1) < 1e-9);
  assert.ok(Math.abs(rows[0].gapPct + 1) < 1e-9);
  assert.ok(rows[0].intradayPct < 0);
  assert.equal(rows[1].usDate, '2024-01-08');
});

test('reports gap and intraday outcomes independently', () => {
  const summary = analyzeSessions([
    { sp500ReturnPct: -1, nasdaqReturnPct: -2, gapPct: -0.5, intradayPct: 0.4, fullDayPct: -0.1 },
    { sp500ReturnPct: -0.25, nasdaqReturnPct: 0.1, gapPct: 0.2, intradayPct: -0.4, fullDayPct: -0.2 },
    { sp500ReturnPct: 1, nasdaqReturnPct: 1, gapPct: 0.2, intradayPct: 0.2, fullDayPct: 0.4 },
  ]);
  assert.equal(summary.sp500Negative.observations, 2);
  assert.equal(summary.sp500Negative.gapDownProbability, 0.5);
  assert.equal(summary.sp500Negative.negativeIntradayProbability, 0.5);
  assert.equal(summary.sp500DownHalfPercent.observations, 1);
  assert.equal(summary.sp500AndNasdaqNegative.observations, 1);
});

test('normalizes Yahoo chart data and skips incomplete rows', () => {
  const rows = normalizeYahooChart({ chart: { result: [{
    timestamp: [1704067200, 1704153600],
    indicators: { quote: [{ open: [10, null], high: [11, null], low: [9, null], close: [10.5, null] }], adjclose: [{ adjclose: [10.5, null] }] },
  }] } }, '^TEST');
  assert.deepEqual(rows, [{ date: '2024-01-01', open: 10, high: 11, low: 9, close: 10.5 }]);
});
