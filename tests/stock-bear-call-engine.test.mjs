import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateTwoHourBars,
  evaluateBearCallPosition,
  parseStockOptionContract,
  reconstructCallDelta,
  selectDeltaBearCall,
  summarizeBearCallResults,
} from '../research/stock-bear-call/engine.mjs';

function minute(timestamp, price) {
  return { timestamp, open: price, high: price + 1, low: price - 1, close: price };
}

test('aggregates only three complete two-hour bars and discards the closing fragment', () => {
  const candles = [];
  for (let index = 0; index < 375; index += 1) {
    const total = 9 * 60 + 15 + index;
    const hh = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    candles.push(minute(`2026-06-04T${hh}:${mm}:00+05:30`, 100 + index));
  }
  const bars = aggregateTwoHourBars(candles);
  assert.equal(bars.length, 3);
  assert.equal(bars[0].minutes, 120);
  assert.equal(bars[2].completedAt, '2026-06-04T15:14:00+05:30');
});

test('selects nearest eligible delta and a hedge exactly two listed strikes higher', () => {
  const candidates = [
    { optionType: 'CE', strike: 100, delta: 0.29, entryPremium: 12 },
    { optionType: 'CE', strike: 110, delta: 0.24, entryPremium: 8 },
    { optionType: 'CE', strike: 120, delta: 0.21, entryPremium: 6 },
    { optionType: 'CE', strike: 130, delta: 0.17, entryPremium: 4 },
    { optionType: 'CE', strike: 140, delta: 0.12, entryPremium: 2 },
  ];
  const selected = selectDeltaBearCall(candidates);
  assert.equal(selected.shortCall.strike, 110);
  assert.equal(selected.longCall.strike, 130);
  assert.equal(selected.width, 20);
});

test('parses hyphenated stock option symbols without confusing the underlying', () => {
  const parsed = parseStockOptionContract({ symbol: 'NSE-BAJAJ-AUTO-25Jun26-9000-CE', lot_size: 75 });
  assert.equal(parsed.underlying, 'BAJAJ-AUTO');
  assert.equal(parsed.strike, 9000);
  assert.equal(parsed.lotSize, 75);
});

test('reconstructs a finite call delta from the observed historical premium', () => {
  const result = reconstructCallDelta({ premium: 23, spot: 1000, strike: 1050, daysToExpiry: 20 });
  assert.ok(result.delta > 0 && result.delta < 0.5);
  assert.ok(result.impliedVolatility > 0);
});

test('defined-risk spread costs include both round trips and adverse slippage', () => {
  const input = {
    selection: {
      shortCall: { entryPremium: 10 },
      longCall: { entryPremium: 4 },
      width: 20,
    },
    exitQuotes: { shortCall: 4, longCall: 1 },
    lotSize: 100,
    tradeDate: '2026-06-10',
  };
  const clean = evaluateBearCallPosition(input);
  const stressed = evaluateBearCallPosition({ ...input, slippagePointsPerLeg: 1 });
  assert.equal(clean.grossPnlRupees, 300);
  assert.ok(clean.chargesRupees > 0);
  assert.ok(stressed.netPnlRupees < clean.netPnlRupees);
});

test('summary reports probability and expectancy separately', () => {
  const row = (net) => ({ status: 'TRADE', underlying: 'RELIANCE', costs: {
    normalized: { netPnlRupees: net }, stress0_5: { netPnlRupees: net - 50 }, stress1_0: { netPnlRupees: net - 100 },
  } });
  const summary = summarizeBearCallResults([row(200), row(100), row(-500)]);
  assert.equal(summary.normalized.winRate, 2 / 3);
  assert.equal(summary.normalized.totalNetPnlRupees, -200);
  assert.equal(summary.trades, 3);
});
