import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNiftyOptionsCsv } from '../research/download-nse-futures-history.mjs';
import { backtestLongerDteOptions, selectLongerDteOption } from '../research/longer-dte-options-engine.mjs';
import { evaluateLongerDteCandidate } from '../research/longer-dte-options-gates.mjs';

test('option parser retains only liquid-window actual NIFTY contracts', () => {
  const csv = ['INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR','OPTIDX,NIFTY,25-JAN-2024,22000,CE,100,110,90,105,105','OPTIDX,BANKNIFTY,25-JAN-2024,47000,CE,100,110,90,105,105'].join('\n');
  assert.deepEqual(parseNiftyOptionsCsv(csv, { date: '2024-01-01', spot: 22000 }), [{ expiry: '2024-01-25', strike: 22000, optionType: 'CE', open: 100, low: 90, settle: 105 }]);
});

test('option parser keeps a held NIFTY strike after spot moves more than ten percent', () => {
  const csv = ['INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR','OPTIDX,NIFTY,25-JAN-2024,18000,CE,1,2,1,1.5,1.5'].join('\n');
  assert.equal(parseNiftyOptionsCsv(csv, { date: '2024-01-01', spot: 22000 }).length, 1);
});

test('selection uses direction, closest-to-30 DTE expiry, then ATM strike', () => {
  const options = [{ expiry: '2024-01-25', strike: 21900, optionType: 'CE', open: 120 },{ expiry: '2024-01-25', strike: 22000, optionType: 'CE', open: 100 },{ expiry: '2024-02-29', strike: 22000, optionType: 'CE', open: 200 },{ expiry: '2024-01-25', strike: 22000, optionType: 'PE', open: 100 }];
  assert.equal(selectLongerDteOption(options, { date: '2024-01-01', spot: 22020, direction: 'LONG' }).strike, 22000);
});

test('selection rejects a zero open because it is not executable', () => {
  const options = [{ expiry: '2024-01-25', strike: 22000, optionType: 'CE', open: 0 }, { expiry: '2024-01-25', strike: 21950, optionType: 'CE', open: 100 }];
  assert.equal(selectLongerDteOption(options, { date: '2024-01-01', spot: 22000, direction: 'LONG' }).strike, 21950);
});

test('longer-DTE entry occurs after the completed underlying signal', () => {
  const rows = [];
  for (let i = 0; i < 105; i += 1) {
    const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10); const close = i < 100 ? 100 : 120 + i;
    rows.push({ date, index: { open: close, high: close + 1, low: close - 1, close }, options: [{ expiry: '2020-05-07', strike: 200, optionType: 'CE', open: 100 + i, low: 95 + i, settle: 101 + i }] });
  }
  const result = backtestLongerDteOptions(rows, { startDate: rows[99].date, endDate: rows.at(-1).date });
  assert.equal(result.trades[0].entryDate, rows[101].date);
});

test('a missing held quote does not freeze all later option samples', () => {
  const rows = [];
  for (let i = 0; i < 108; i += 1) {
    const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10); const close = i < 100 ? 100 : 120 + i;
    rows.push({ date, index: { open: close, high: close + 1, low: close - 1, close }, options: [{ expiry: '2020-05-07', strike: 200, optionType: 'CE', open: 100 + i, low: 95 + i, settle: 101 + i }] });
  }
  rows[102].options = [];
  const baseline = backtestLongerDteOptions(rows, { startDate: rows[99].date, endDate: rows.at(-1).date });
  const premiumStop = backtestLongerDteOptions(rows, { startDate: rows[99].date, endDate: rows.at(-1).date, premiumStop: true });
  assert.equal(baseline.coverage.missingSessions, 0);
  assert.equal(baseline.trades.length, 1);
  assert.equal(premiumStop.coverage.missingSessions, 1);
  assert.equal(premiumStop.coverage.missingByReason.HELD_STOP_PATH, 1);
});

test('gate rejects stress-fragile longer-DTE candidates', () => {
  const weak = { performance: { count: 30, total: -1, profitFactor: 0.9 }, clusteredMeanConfidence: { lower: -1 } };
  assert.equal(evaluateLongerDteCandidate({ summary: { '0': weak, '0.5': weak, '1': weak }, coverage: { missingRate: 0 } }).decision, 'REJECT_DISCOVERY');
});
