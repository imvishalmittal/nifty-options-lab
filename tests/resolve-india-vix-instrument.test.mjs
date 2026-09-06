import test from 'node:test';
import assert from 'node:assert/strict';
import { findIndiaVixInstruments } from '../research/resolve-india-vix-instrument.mjs';

test('finds India VIX without assuming the Groww symbol spelling', () => {
  const matches = findIndiaVixInstruments([
    { exchange: 'NSE', segment: 'CASH', groww_symbol: 'NSE-NIFTY', name: 'NIFTY 50' },
    { exchange: 'NSE', segment: 'CASH', groww_symbol: 'provider-specific-value', name: 'India VIX' },
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].growwSymbol, 'provider-specific-value');
});

test('drops matches that cannot be fetched by groww_symbol', () => {
  assert.deepEqual(findIndiaVixInstruments([{ name: 'INDIA VIX' }]), []);
});
