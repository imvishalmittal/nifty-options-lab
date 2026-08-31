import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLongOption, qualifiesOpeningMover, rankOpeningMovers } from '../research/morning-tea/engine.mjs';
import { parseInstrumentCsv, resolveHistoricalLotSize, resolveInstrumentLotSize } from '../research/morning-tea/groww-backtest.mjs';

const candle = (time, open, high, low, close) => ({ timestamp: `2026-08-10T${time}:00+05:30`, open, high, low, close });

test('ranks movers causally using the completed opening candle and previous close', () => {
  const ranked = rankOpeningMovers([
    { symbol: 'A', previousClose: 100, candle: candle('09:15', 101, 104, 101, 103) },
    { symbol: 'B', previousClose: 100, candle: candle('09:15', 99, 99, 96, 97) },
    { symbol: 'C', previousClose: 100, candle: candle('09:15', 100, 101, 99, 100) },
  ]);
  assert.equal(ranked.gainer.symbol, 'A');
  assert.equal(ranked.loser.symbol, 'B');
});

test('requires open-low for a gainer and open-high for a loser', () => {
  assert.equal(qualifiesOpeningMover({ candle: candle('09:15', 100, 103, 100, 102) }, 'CE'), true);
  assert.equal(qualifiesOpeningMover({ candle: candle('09:15', 100, 100, 97, 98) }, 'PE'), true);
  assert.equal(qualifiesOpeningMover({ candle: candle('09:15', 100, 103, 99, 102) }, 'CE'), false);
});

test('enters only on the next candle and scores same-bar ambiguity stop first', () => {
  const result = evaluateLongOption([
    candle('09:15', 100, 104, 98, 103),
    candle('09:16', 102, 115, 97, 110),
    candle('09:30', 110, 111, 109, 110),
  ]);
  assert.equal(result.entry, 102);
  assert.equal(result.result, 'STOP');
  assert.equal(result.exit, 98);
  assert.equal(result.ambiguousBar, true);
});

test('uses a ten-percent target and the 09:30 open for unresolved trades', () => {
  const target = evaluateLongOption([
    candle('09:15', 100, 103, 98, 102), candle('09:16', 100, 111, 99, 108), candle('09:30', 108, 109, 107, 108),
  ]);
  assert.equal(target.result, 'TARGET');
  assert.ok(Math.abs(target.exit - 110) < 1e-9);
  const timed = evaluateLongOption([
    candle('09:15', 100, 103, 98, 102), candle('09:16', 100, 107, 99, 105), candle('09:30', 106, 108, 105, 107),
  ]);
  assert.equal(timed.result, 'TIME');
  assert.equal(timed.exit, 106);
});


test('resolves an exact stock-option lot size from the official Groww instrument CSV', () => {
  const rows = parseInstrumentCsv([
    'exchange,groww_symbol,instrument_type,segment,underlying_symbol,expiry_date,lot_size',
    'NSE,NSE-SBIN-25Aug26-1070-CE,CE,FNO,SBIN,2026-08-25,750',
  ].join('\n'));
  assert.deepEqual(resolveInstrumentLotSize(rows, {
    symbol: 'NSE-SBIN-25Aug26-1070-CE', underlying: 'SBIN', optionType: 'CE', expiry: '2026-08-25',
  }), { lotSize: 750, source: 'instrument-exact-contract' });
});

test('uses the nearest compatible expiry only when the exact historical contract is absent', () => {
  const rows = parseInstrumentCsv([
    'exchange,groww_symbol,instrument_type,segment,underlying_symbol,expiry_date,lot_size',
    'NSE,NSE-SBIN-29Sep26-1070-CE,CE,FNO,SBIN,2026-09-29,750',
    'NSE,NSE-SBIN-27Oct26-1070-PE,PE,FNO,SBIN,2026-10-27,750',
  ].join('\n'));
  assert.deepEqual(resolveInstrumentLotSize(rows, {
    symbol: 'NSE-SBIN-25Aug26-1070-CE', underlying: 'SBIN', optionType: 'CE', expiry: '2026-08-25',
  }), { lotSize: 750, source: 'instrument-underlying-expiry' });
});

test('uses the dated NSE Tata Motors lot schedule without leaking current lots backward', () => {
  const contract = { underlying: 'TATAMOTORS' };
  assert.deepEqual(resolveHistoricalLotSize(contract, '2025-06-30'), {
    lotSize: 550, source: 'nse-historical-schedule-2025',
  });
  assert.deepEqual(resolveHistoricalLotSize(contract, '2025-07-01'), {
    lotSize: 800, source: 'nse-historical-schedule-2025',
  });
  assert.equal(resolveHistoricalLotSize(contract, '2025-10-14'), null);
  assert.equal(resolveHistoricalLotSize({ underlying: 'SBIN' }, '2025-06-30'), null);
});
