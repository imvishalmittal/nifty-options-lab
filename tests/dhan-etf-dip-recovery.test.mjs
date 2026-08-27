import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkDhanIntradayRange,
  dhanArraysToCandles,
  dhanEtfUniverse,
} from '../research/dhan-etf-dip-recovery-backtest.mjs';

test('Dhan intraday chunks stay within the official 90-calendar-day maximum', () => {
  assert.deepEqual(chunkDhanIntradayRange('2025-01-01', '2025-07-15'), [
    { startDate: '2025-01-01', endDate: '2025-03-31' },
    { startDate: '2025-04-01', endDate: '2025-06-29' },
    { startDate: '2025-06-30', endDate: '2025-07-15' },
  ]);
});

test('Dhan parallel candle arrays are converted without shifting fields', () => {
  assert.deepEqual(dhanArraysToCandles({
    open: [100], high: [102], low: [99], close: [101], volume: [600_001], timestamp: [1_700_000_000],
  }), [[1_700_000_000, 100, 102, 99, 101, 600_001]]);
});

test('Dhan ETF universe uses the explicit NSE ETF instrument type', () => {
  const rows = [
    { EXCH_ID: 'NSE', SEGMENT: 'E', SECURITY_ID: '10576', ISIN: 'INF204KB14I2', INSTRUMENT: 'EQUITY', UNDERLYING_SYMBOL: 'NIFTYBEES', SYMBOL_NAME: 'NIP IND ETF NIFTY BEES', DISPLAY_NAME: 'Nippon Nifty 50 ETF', INSTRUMENT_TYPE: 'ETF', SERIES: 'EQ', BUY_SELL_INDICATOR: 'A' },
    { EXCH_ID: 'NSE', SEGMENT: 'E', SECURITY_ID: '2885', INSTRUMENT: 'EQUITY', UNDERLYING_SYMBOL: 'RELIANCE', SYMBOL_NAME: 'Reliance', INSTRUMENT_TYPE: 'ES', SERIES: 'EQ', BUY_SELL_INDICATOR: 'A' },
    { EXCH_ID: 'BSE', SEGMENT: 'E', SECURITY_ID: '590103', INSTRUMENT: 'EQUITY', UNDERLYING_SYMBOL: 'NIFTYBEES', SYMBOL_NAME: 'Nifty ETF', INSTRUMENT_TYPE: 'ETF', SERIES: 'B', BUY_SELL_INDICATOR: 'A' },
  ];
  const universe = dhanEtfUniverse(rows);
  assert.equal(universe.length, 1);
  assert.equal(universe[0].symbol, 'NIFTYBEES');
  assert.equal(universe[0].category, 'BROAD_MARKET');
});
