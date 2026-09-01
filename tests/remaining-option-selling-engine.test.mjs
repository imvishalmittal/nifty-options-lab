import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateCreditLifecycle,
  completedDailyClosesBefore,
  completedWeeklyClosesBefore,
  firstSessionsAfterExpiries,
  findOpeningRangeBreak,
  reconstructOptionDelta,
  selectAtmCreditSpread,
  selectIronCondorByDelta,
  summarizeScenario,
  wilderRsi,
} from '../research/remaining-option-selling-engine.mjs';

test('opening range requires 30 causal bars and uses completed five-minute close', () => {
  const bars = Array.from({ length: 30 }, (_, index) => ({
    timestamp: `2024-01-01T09:${String(15 + index).padStart(2, '0')}:00+05:30`,
    high: 101,
    low: 99,
  }));
  const result = findOpeningRangeBreak(bars, [
    { timestamp: '2024-01-01T09:45:00+05:30', close: 100 },
    { timestamp: '2024-01-01T09:50:00+05:30', close: 102 },
  ]);
  assert.equal(result.status, 'SIGNAL');
  assert.equal(result.direction, 'UP');
  assert.equal(result.confirmationTimestamp, '2024-01-01T09:50:00+05:30');
});

test('ATM credit spread requires the exact 300-point listed hedge', () => {
  const contracts = [
    { symbol: 'P100', optionType: 'PE', strike: 100 },
    { symbol: 'P-200', optionType: 'PE', strike: -200 },
    { symbol: 'P-100', optionType: 'PE', strike: -100 },
  ];
  const result = selectAtmCreditSpread(contracts, 110, 'UP');
  assert.equal(result.short.symbol, 'P100');
  assert.equal(result.long.symbol, 'P-200');
});

test('delta condor picks closest listed targets with farther OTM hedges', () => {
  const contracts = [
    { symbol: 'SC', optionType: 'CE', strike: 110, delta: 0.11 },
    { symbol: 'LC', optionType: 'CE', strike: 120, delta: 0.051 },
    { symbol: 'SP', optionType: 'PE', strike: 90, delta: -0.119 },
    { symbol: 'LP', optionType: 'PE', strike: 80, delta: -0.061 },
  ];
  const result = selectIronCondorByDelta(contracts, { shortCallDelta: 0.10, shortPutDelta: -0.12, longCallDelta: 0.05, longPutDelta: -0.06 });
  assert.deepEqual([result.shortCall.symbol, result.longCall.symbol, result.shortPut.symbol, result.longPut.symbol], ['SC', 'LC', 'SP', 'LP']);
});

test('reconstructs signed call and put deltas from causal premiums', () => {
  const call = reconstructOptionDelta({ optionType: 'CE', premium: 5.876, spot: 100, strike: 100, daysToExpiry: 30, rate: 0.06 });
  const put = reconstructOptionDelta({ optionType: 'PE', premium: 5.384, spot: 100, strike: 100, daysToExpiry: 30, rate: 0.06 });
  assert.ok(call.delta > 0.5 && call.delta < 0.6);
  assert.ok(put.delta < -0.4 && put.delta > -0.5);
  assert.ok(Math.abs(call.impliedVolatility - 0.5) < 0.02);
});

test('weekly schedule selects the first actual session after each expiry', () => {
  const schedule = firstSessionsAfterExpiries(
    ['2024-01-25', '2024-01-29', '2024-01-30', '2024-02-01', '2024-02-02'],
    ['2024-01-25', '2024-02-01', '2024-02-08'],
  );
  assert.deepEqual(schedule, [
    { previousExpiry: '2024-01-25', entryDate: '2024-01-29', expiry: '2024-02-01' },
    { previousExpiry: '2024-02-01', entryDate: '2024-02-02', expiry: '2024-02-08' },
  ]);
});

test('RSI inputs exclude the in-progress entry day and use completed weeks', () => {
  const candles = [
    { timestamp: '2024-01-04T15:29:00+05:30', close: 10 },
    { timestamp: '2024-01-05T15:29:00+05:30', close: 11 },
    { timestamp: '2024-01-08T15:29:00+05:30', close: 12 },
    { timestamp: '2024-01-09T09:44:00+05:30', close: 99 },
  ];
  assert.deepEqual(completedDailyClosesBefore(candles, '2024-01-09T09:44:00+05:30'), [10, 11, 12]);
  assert.deepEqual(completedWeeklyClosesBefore(candles, '2024-01-09T09:44:00+05:30'), [11]);
});

test('same-bar target and stop ambiguity resolves stop first', () => {
  const result = evaluateCreditLifecycle({
    entryCredit: 10,
    observations: [
      { timestamp: '2024-01-01T10:00:00+05:30', lowDebit: 4, highDebit: 21, openDebit: 10 },
      { timestamp: '2024-01-01T10:01:00+05:30', lowDebit: 9, highDebit: 11, openDebit: 11 },
    ],
  });
  assert.equal(result.reason, 'STOP');
  assert.equal(result.ambiguous, true);
  assert.equal(result.timestamp, '2024-01-01T10:01:00+05:30');
  assert.equal(result.debit, 11);
});

test('overnight gaps execute at session open', () => {
  const result = evaluateCreditLifecycle({
    entryCredit: 10,
    observations: [{ timestamp: '2024-01-02T09:15:00+05:30', isSessionOpen: true, openDebit: 22, lowDebit: 4, highDebit: 25 }],
  });
  assert.equal(result.reason, 'STOP');
  assert.equal(result.debit, 22);
});

test('Wilder RSI and scenario summary are deterministic', () => {
  assert.equal(wilderRsi(Array.from({ length: 16 }, (_, index) => index + 1)), 100);
  const summary = summarizeScenario([10, -5, 20, -10]);
  assert.equal(summary.netPnl, 15);
  assert.equal(summary.profitFactor, 2);
  assert.equal(summary.maximumDrawdown, 10);
});
