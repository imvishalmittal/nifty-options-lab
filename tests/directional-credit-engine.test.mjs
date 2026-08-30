import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachDirectionalCreditCosts,
  detectDirectionalCreditRegime,
  evaluateDirectionalCreditPosition,
  netSpreadCredit,
  selectDirectionalCreditContracts,
  summarizeDirectionalCreditResults,
} from '../research/opportunity/directional-credit-engine.mjs';

const symbol = (strike, type) => `NSE-NIFTY-27Aug26-${strike}-${type}`;
const candle = (timestamp, open, close = open) => ({ timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 });

test('selects the first 0.5%-OTM put with an exact lower protective wing', () => {
  const contracts = [];
  for (let strike = 23500; strike <= 24500; strike += 50) contracts.push(symbol(strike, 'CE'), symbol(strike, 'PE'));
  const selected = selectDirectionalCreditContracts(contracts, { spot: 24000, direction: 'BULLISH' });
  assert.equal(selected.shortOption.strike, 23850);
  assert.equal(selected.longOption.strike, 23650);
  assert.equal(selected.optionType, 'PE');
});

test('selects the first 0.5%-OTM call with an exact upper protective wing', () => {
  const contracts = [];
  for (let strike = 23500; strike <= 24700; strike += 50) contracts.push(symbol(strike, 'CE'), symbol(strike, 'PE'));
  const selected = selectDirectionalCreditContracts(contracts, { spot: 24000, direction: 'BEARISH' });
  assert.equal(selected.shortOption.strike, 24150);
  assert.equal(selected.longOption.strike, 24350);
  assert.equal(selected.optionType, 'CE');
});

test('completed close detects target and fills at next synchronized open', () => {
  const legCandles = {
    shortOption: [candle('2026-08-24T10:00:00+05:30', 30, 15), candle('2026-08-24T10:01:00+05:30', 16), candle('2026-08-24T15:10:00+05:30', 16)],
    longOption: [candle('2026-08-24T10:00:00+05:30', 10, 5), candle('2026-08-24T10:01:00+05:30', 5), candle('2026-08-24T15:10:00+05:30', 5)],
  };
  const result = evaluateDirectionalCreditPosition({ legCandles, entryTimestamp: '2026-08-24T10:00:00+05:30' });
  assert.equal(netSpreadCredit(result.entryQuotes), 20);
  assert.equal(result.result, 'TARGET');
  assert.equal(result.thresholdTime, '2026-08-24T10:00:00+05:30');
  assert.equal(result.exitTime, '2026-08-24T10:01:00+05:30');
  assert.equal(result.pnlPerUnit, 9);
});

test('trend regime requires completed price, EMA, ADX and DI agreement', () => {
  const candles = [];
  let price = 24000;
  for (let i = 0; i < 45; i += 1) {
    const minutes = 15 + i;
    const timestamp = `2026-08-24T09:${String(minutes).padStart(2, '0')}:00+05:30`;
    const open = price; price += i < 30 ? 1 : 8;
    candles.push({ timestamp, open, high: price + 2, low: open - 1, close: price, volume: 100 });
  }
  const result = detectDirectionalCreditRegime(candles);
  assert.equal(result.status, 'SIGNAL');
  assert.equal(result.direction, 'BULLISH');
});

test('four-order costs and stress are applied to both spread legs', () => {
  const position = { status: 'TRADE', entryQuotes: { shortOption: 30, longOption: 10 }, exitQuotes: { shortOption: 15, longOption: 5 } };
  const base = attachDirectionalCreditCosts(position, { lotSize: 65, tradeDate: '2026-08-24' });
  const stress = attachDirectionalCreditCosts(position, { lotSize: 65, tradeDate: '2026-08-24', slippagePointsPerLeg: 1 });
  assert.equal(Object.keys(base.legs).length, 2);
  assert.ok(base.netPnl > stress.netPnl);
});

test('summary remains isolated and reports scenario expectancy', () => {
  const summary = summarizeDirectionalCreditResults([
    { status: 'TRADE', result: 'TARGET', costs: { normalized: { netPnl: 100 }, stress0_5: { netPnl: 50 }, stress1_0: { netPnl: 10 } } },
    { status: 'TRADE', result: 'STOP', costs: { normalized: { netPnl: -40 }, stress0_5: { netPnl: -60 }, stress1_0: { netPnl: -80 } } },
  ]);
  assert.equal(summary.trades, 2);
  assert.equal(summary.normalizedCosts.totalNetPnlRupees, 60);
  assert.equal(summary.normalizedCosts.expectancyRupees, 30);
});
