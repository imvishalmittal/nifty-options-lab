import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCandles,
  spotAt925,
  premiumAt925,
  tradingDates,
  nearestItmCandidates,
} from '../research/groww-backtest-nifty-180.mjs';

const contracts = [
  'NSE-NIFTY-20Aug26-24700-CE',
  'NSE-NIFTY-20Aug26-24750-CE',
  'NSE-NIFTY-20Aug26-24800-CE',
  'NSE-NIFTY-20Aug26-24850-CE',
  'NSE-NIFTY-20Aug26-24900-CE',
  'NSE-NIFTY-20Aug26-24950-PE',
  'NSE-NIFTY-20Aug26-25000-PE',
  'NSE-NIFTY-20Aug26-25050-PE',
];

test('normalizes Groww option candles including open interest', () => {
  const rows = normalizeCandles([
    ['2026-08-10 09:25:00', 179, 183, 177, 181, 12000, 450000],
  ]);
  assert.equal(rows[0].timestamp, '2026-08-10T09:25:00+05:30');
  assert.equal(rows[0].open, 179);
  assert.equal(rows[0].openInterest, 450000);
});

test('uses the 09:25 candle open for contemporaneous spot and premium selection', () => {
  const rows = normalizeCandles([
    ['2026-08-10 09:24:00', 24780, 24790, 24770, 24785, 1],
    ['2026-08-10 09:25:00', 24786, 24795, 24780, 24792, 1],
  ]);
  assert.equal(spotAt925(rows), 24786);
  assert.equal(premiumAt925(rows), 24786);
});

test('extracts unique trading dates', () => {
  const rows = normalizeCandles([
    ['2026-08-10 09:25:00', 1, 1, 1, 1, 1],
    ['2026-08-10 09:26:00', 1, 1, 1, 1, 1],
    ['2026-08-11 09:25:00', 1, 1, 1, 1, 1],
  ]);
  assert.deepEqual(tradingDates(rows), ['2026-08-10', '2026-08-11']);
});

test('candidate search starts from nearest ITM strikes and moves deeper', () => {
  const spot = 24920;
  const calls = nearestItmCandidates(contracts, spot, 'CE', 3);
  const puts = nearestItmCandidates(contracts, spot, 'PE', 2);
  assert.deepEqual(calls.map((c) => c.strike), [24900, 24850, 24800]);
  assert.deepEqual(puts.map((c) => c.strike), [24950, 25000]);
});
