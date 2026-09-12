import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNiftyOptionsCsv } from '../research/download-nse-futures-history.mjs';
import { backtestLongerDteOptions, selectLongerDteOption } from '../research/longer-dte-options-engine.mjs';
import { evaluateLongerDteCandidate } from '../research/longer-dte-options-gates.mjs';

test('option parser retains only liquid-window actual NIFTY contracts', () => {
  const csv = ['INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR','OPTIDX,NIFTY,25-JAN-2024,22000,CE,100,110,90,105,105','OPTIDX,BANKNIFTY,25-JAN-2024,47000,CE,100,110,90,105,105'].join('\n');
  assert.deepEqual(parseNiftyOptionsCsv(csv, { date: '2024-01-01', spot: 22000 }), [{ expiry: '2024-01-25', strike: 22000, optionType: 'CE', open: 100, low: 90, settle: 105 }]);
});

test('selection uses direction, closest-to-30 DTE expiry, then ATM strike', () => {
  const options = [{ expiry: '2024-01-25', strike: 21900, optionType: 'CE', open: 120 },{ expiry: '2024-01-25', strike: 22000, optionType: 'CE', open: 100 },{ expiry: '2024-02-29', strike: 22000, optionType: 'CE', open: 200 },{ expiry: '2024-01-25', strike: 22000, optionType: 'PE', open: 100 }];
  assert.equal(selectLongerDteOption(options, { date: '2024-01-01', spot: 22020, direction: 'LONG' }).strike, 22000);
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

test('gate rejects stress-fragile longer-DTE candidates', () => {
  const weak = { performance: { count: 30, total: -1, profitFactor: 0.9 }, clusteredMeanConfidence: { lower: -1 } };
  assert.equal(evaluateLongerDteCandidate({ summary: { '0': weak, '0.5': weak, '1': weak }, coverage: { missingRate: 0 } }).decision, 'REJECT_DISCOVERY');
});
