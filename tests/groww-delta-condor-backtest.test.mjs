import assert from 'node:assert/strict';
import test from 'node:test';
import { monthlyExpiries, normalizeDeltaCondorCandles, parseDeltaCondorContract } from '../research/groww-delta-condor-backtest.mjs';

test('monthly expiry is the last listed expiry in each calendar month', () => {
  assert.deepEqual(monthlyExpiries(['2024-01-04', '2024-01-25', '2024-02-01', '2024-02-29']), ['2024-01-25', '2024-02-29']);
});

test('stock and NIFTY contracts retain historical lot size', () => {
  const stock = parseDeltaCondorContract({ symbol: 'NSE-RELIANCE-25Jan24-2500-CE', lot_size: 250 });
  assert.equal(stock.underlying, 'RELIANCE');
  assert.equal(stock.lotSize, 250);
});

test('normalizes Groww candle numbers and timezone', () => {
  const [row] = normalizeDeltaCondorCandles([['2024-01-01 09:15:00', '1', '2', '0', '1.5', '10']]);
  assert.equal(row.timestamp, '2024-01-01T09:15:00+05:30');
  assert.equal(row.close, 1.5);
});
