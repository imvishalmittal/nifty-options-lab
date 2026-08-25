import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCandles,
  spotAt925,
  premiumAt925,
  tradingDates,
  nearestItmCandidates,
  splitDateRange,
  candlesForDate,
  attachCostScenarios,
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

test('merges duplicate provider timestamps before causal next-bar evaluation', () => {
  const rows = normalizeCandles([
    ['2024-01-03 09:37:00', 180, 185, 178, 183.1, 1000, 10000],
    ['2024-01-03 09:37:00', 174.3, 188, 172, 184, 1200, 10100],
    ['2024-01-03 09:38:00', 185, 190, 184, 189, 900, 10200],
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    timestamp: '2024-01-03T09:37:00+05:30',
    open: 180,
    high: 188,
    low: 172,
    close: 184,
    volume: 1200,
    openInterest: 10100,
  });
  assert.equal(rows[1].timestamp, '2024-01-03T09:38:00+05:30');
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

test('one-minute monthly history is split safely below Groww 30-day request limit', () => {
  assert.deepEqual(splitDateRange('2026-03-01', '2026-03-31', 28), [
    { startDate: '2026-03-01', endDate: '2026-03-28' },
    { startDate: '2026-03-29', endDate: '2026-03-31' },
  ]);
});

test('cached multi-day history is sliced to the current date and signal window', () => {
  const rows = normalizeCandles([
    ['2026-08-10 09:24:00', 170, 171, 169, 170, 10],
    ['2026-08-10 09:25:00', 179, 181, 178, 180, 20],
    ['2026-08-10 09:45:00', 190, 191, 189, 190, 30],
    ['2026-08-11 09:25:00', 181, 182, 180, 181, 40],
  ]);
  const day = candlesForDate(rows, '2026-08-10', '09:25', '09:45');
  assert.equal(day.length, 2);
  assert.equal(day[0].open, 179);
  assert.equal(day[1].timestamp, '2026-08-10T09:45:00+05:30');
});

test('attached option costs use the trade date for the 2026 STT change', () => {
  const trade = { status: 'TRADE', entry: 180, exit: 220, pnlPerUnit: 40 };
  const march = attachCostScenarios(trade, 65, '2026-03-31');
  const april = attachCostScenarios(trade, 65, '2026-04-01');
  assert.equal(march.costs.currentGroww2026.sttSellRate, 0.0010);
  assert.equal(april.costs.currentGroww2026.sttSellRate, 0.0015);
  assert.ok(march.costs.currentGroww2026.netPnl > april.costs.currentGroww2026.netPnl);
});
