import test from 'node:test';
import assert from 'node:assert/strict';
import { backtestPositionalFutures, desiredDirection, futuresRoundTripCosts, selectFrontContract } from '../research/positional-futures-engine.mjs';
import { bhavcopyUrl, normalizeYahooChart, parseNiftyFuturesCsv } from '../research/download-nse-futures-history.mjs';
import { evaluatePositionalFutures } from '../research/positional-futures-gates.mjs';

test('parses only actual NIFTY index futures from the official bhavcopy shape', () => {
  const csv = [
    'INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR',
    'FUTIDX,NIFTY,25-JAN-2024,0,XX,21800,21900,21700,21850,21860',
    'OPTIDX,NIFTY,25-JAN-2024,22000,CE,100,110,90,105,105',
    'FUTIDX,BANKNIFTY,25-JAN-2024,0,XX,47000,47100,46900,47050,47060',
  ].join('\n');
  assert.deepEqual(parseNiftyFuturesCsv(csv), [{ expiry: '2024-01-25', open: 21800, settle: 21860 }]);
  assert.equal(bhavcopyUrl('2024-01-01'), 'https://nsearchives.nseindia.com/content/historical/DERIVATIVES/2024/JAN/fo01JAN2024bhav.csv.zip');
});

test('normalizes Yahoo daily candles without accepting missing prices', () => {
  const rows = normalizeYahooChart({ chart: { result: [{ timestamp: [1704067200, 1704153600], indicators: { quote: [{ open: [100, null], high: [102, null], low: [99, null], close: [101, null] }] } }] } });
  assert.equal(rows.length, 1); assert.equal(rows[0].close, 101);
});

test('signal uses completed close, SMA and ATR hysteresis', () => {
  assert.equal(desiredDirection({ index: { close: 111 }, indicators: { sma: 100, atr: 10 } }), 'LONG');
  assert.equal(desiredDirection({ index: { close: 89 }, indicators: { sma: 100, atr: 10 } }), 'SHORT');
  assert.equal(desiredDirection({ index: { close: 102 }, indicators: { sma: 100, atr: 10 } }, 'LONG'), 'LONG');
});

test('front selection skips a contract inside the seven-day roll window', () => {
  const contracts = [{ expiry: '2024-01-04', open: 100, settle: 101 }, { expiry: '2024-01-25', open: 102, settle: 103 }];
  assert.equal(selectFrontContract(contracts, '2024-01-01').expiry, '2024-01-25');
});

test('causal engine enters on the session after a completed signal and applies costs', () => {
  const rows = [];
  for (let i = 0; i < 105; i += 1) {
    const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    const close = i < 100 ? 100 : 120 + i;
    rows.push({ date, index: { open: close, high: close + 1, low: close - 1, close }, contracts: [{ expiry: '2020-06-25', open: close + 5, settle: close + 5 }] });
  }
  const result = backtestPositionalFutures(rows, { startDate: rows[99].date, endDate: rows.at(-1).date });
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].entryDate, rows[101].date);
  assert.ok(result.trades[0].pnl['0.5'] < (result.trades[0].exitPrice - result.trades[0].entryPrice) * result.trades[0].lotSize);
  assert.ok(futuresRoundTripCosts({ entryPrice: 20000, exitPrice: 20100, lotSize: 50, tradeDate: '2024-01-01' }).total > 40);
});

test('gates reject an economically weak result', () => {
  const report = { performance: { count: 60, total: -1, profitFactor: 0.9, maxDrawdown: 300000 }, clusteredMeanConfidence: { lower: -1 } };
  const verdict = evaluatePositionalFutures({ summary: { '0.5': report, '1': report, '2': report }, coverage: { missingRate: 0 }, trades: Array.from({ length: 60 }, (_, i) => ({ exitDate: `${2016 + i % 7}-01-01`, pnl: { '0.5': -1 } })) });
  assert.equal(verdict.decision, 'REJECT_DISCOVERY');
});
