import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IRON_CONDOR_RULES,
  attachIronCondorCosts,
  evaluateIronCondorPosition,
  netCondorCredit,
  selectIronCondorContracts,
  summarizeIronCondorResults,
} from '../research/opportunity/iron-condor-engine.mjs';

function contract(strike, type) {
  return `NSE-NIFTY-27Aug26-${strike}-${type}`;
}

function candle(timestamp, open, close = open) {
  return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
}

function legCandles(entry, marked, exit) {
  return [
    candle('2026-08-24T10:00:00+05:30', entry, marked),
    candle('2026-08-24T10:01:00+05:30', exit),
    candle('2026-08-24T15:10:00+05:30', exit),
  ];
}

test('selects symmetric protective wings outside both distance and opening-range boundaries', () => {
  const contracts = [];
  for (let strike = 23500; strike <= 24500; strike += 50) {
    contracts.push(contract(strike, 'CE'), contract(strike, 'PE'));
  }
  const selected = selectIronCondorContracts(contracts, {
    spot: 24000,
    range: { high: 24100, low: 23900, width: 200 },
  });
  assert.equal(selected.shortCall.strike, 24250);
  assert.equal(selected.longCall.strike, 24450);
  assert.equal(selected.shortPut.strike, 23750);
  assert.equal(selected.longPut.strike, 23550);
});

test('requires an exact equal-width protective wing', () => {
  const contracts = [
    contract(24250, 'CE'), contract(24400, 'CE'),
    contract(23750, 'PE'), contract(23550, 'PE'),
  ];
  assert.equal(selectIronCondorContracts(contracts, {
    spot: 24000,
    range: { high: 24100, low: 23900, width: 200 },
  }), null);
});

test('uses completed close for threshold detection and exits all legs at next-bar open', () => {
  const legCandlesByName = {
    shortCall: legCandles(40, 20, 21),
    longCall: legCandles(10, 5, 5),
    shortPut: legCandles(45, 22, 23),
    longPut: legCandles(15, 7, 7),
  };
  const position = evaluateIronCondorPosition({
    legCandles: legCandlesByName,
    entryTimestamp: '2026-08-24T10:00:00+05:30',
  });
  assert.equal(netCondorCredit(position.entryQuotes), 60);
  assert.equal(position.result, 'TARGET');
  assert.equal(position.thresholdTime, '2026-08-24T10:00:00+05:30');
  assert.equal(position.exitTime, '2026-08-24T10:01:00+05:30');
  assert.equal(position.exitDebit, 32);
  assert.equal(position.pnlPerUnit, 28);
});

test('marks a session missing instead of inventing one of four threshold quotes', () => {
  const legs = {
    shortCall: legCandles(40, 20, 21),
    longCall: legCandles(10, 5, 5),
    shortPut: legCandles(45, 22, 23),
    longPut: legCandles(15, 7, 7).filter((row) => !row.timestamp.includes('10:00')),
  };
  const result = evaluateIronCondorPosition({
    legCandles: legs,
    entryTimestamp: '2026-08-24T10:00:00+05:30',
  });
  assert.equal(result.status, 'DATA_MISSING');
});

test('eight-order costs and slippage are applied across all four legs', () => {
  const position = {
    status: 'TRADE',
    entryQuotes: { shortCall: 40, longCall: 10, shortPut: 45, longPut: 15 },
    exitQuotes: { shortCall: 21, longCall: 5, shortPut: 23, longPut: 7 },
  };
  const clean = attachIronCondorCosts(position, { lotSize: 65, tradeDate: '2026-08-24' });
  const stressed = attachIronCondorCosts(position, { lotSize: 65, tradeDate: '2026-08-24', slippagePointsPerLeg: 1 });
  assert.equal(clean.grossPnl, 28 * 65);
  assert.equal(Object.values(clean.legs).reduce((sum, leg) => sum + leg.charges.brokerage, 0), 160);
  assert.ok(stressed.netPnl < clean.netPnl);
});

test('summary keeps the iron-condor research stream independent', () => {
  const results = [
    { status: 'TRADE', signal: {}, result: 'TARGET', costs: { normalized: { netPnl: 500 }, stress0_5: { netPnl: 400 }, stress1_0: { netPnl: 300 } } },
    { status: 'TRADE', signal: {}, result: 'STOP', costs: { normalized: { netPnl: -200 }, stress0_5: { netPnl: -300 }, stress1_0: { netPnl: -400 } } },
    { status: 'NO_SIGNAL' },
  ];
  const summary = summarizeIronCondorResults(results);
  assert.equal(summary.trades, 2);
  assert.equal(summary.normalizedCosts.totalNetPnlRupees, 300);
  assert.equal(summary.stress1_0.profitFactor, 0.75);
  assert.equal(IRON_CONDOR_RULES.entryTime, '10:00');
});
