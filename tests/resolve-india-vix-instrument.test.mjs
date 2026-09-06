import test from 'node:test';
import assert from 'node:assert/strict';
import { findIndiaVixInstruments, findVixCandidateInstruments, resolveIndiaVix } from '../research/resolve-india-vix-instrument.mjs';

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

test('reports nearby VIX candidates without treating them as verified India VIX', () => {
  const candidates = findVixCandidateInstruments([
    { exchange: 'NSE', segment: 'CASH', groww_symbol: 'NSE-NIFTY', name: 'NIFTY 50' },
    { exchange: 'NSE', segment: 'CASH', groww_symbol: 'VIXLIKE', name: 'VIX candidate' },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].growwSymbol, 'VIXLIKE');
});

test('attaches diagnostic report when no verified India VIX instrument exists', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('instrument.csv')) {
      return { ok: true, text: async () => 'exchange,segment,groww_symbol,name\nNSE,CASH,VIXLIKE,VIX candidate\n' };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  await assert.rejects(
    () => resolveIndiaVix({ token: 'token', fetchImpl }),
    (error) => {
      assert.equal(error.report.candidates.length, 1);
      assert.equal(error.report.matches.length, 0);
      assert.equal(error.report.verified, null);
      return true;
    },
  );
});
