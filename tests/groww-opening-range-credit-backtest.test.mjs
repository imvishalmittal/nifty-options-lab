import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateFiveMinute, normalizeCandles } from '../research/groww-opening-range-credit-backtest.mjs';

test('normalizes Groww candles without inventing timezone', () => {
  const rows = normalizeCandles([['2024-01-01 09:15:00', '1', '2', '0', '1.5', '10']]);
  assert.equal(rows[0].timestamp, '2024-01-01T09:15:00+05:30');
  assert.equal(rows[0].close, 1.5);
});

test('five-minute confirmation bars begin only after the frozen opening range', () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({
    timestamp: `2024-01-01T${index < 45 ? '09' : '10'}:${String((15 + index) % 60).padStart(2, '0')}:00+05:30`,
    open: index, high: index + 2, low: index - 2, close: index + 1,
  }));
  const bars = aggregateFiveMinute(rows);
  assert.equal(bars[0].timestamp.slice(11, 16), '09:49');
  assert.equal(bars[0].open, 30);
  assert.equal(bars[0].close, 35);
});
