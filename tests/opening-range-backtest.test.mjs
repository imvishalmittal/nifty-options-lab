import test from 'node:test';
import assert from 'node:assert/strict';
import { backtest, isBullishHammer, isBearishShootingStar } from '../research/opening-range-backtest.mjs';

const c = (timestamp, open, high, low, close, volume = 1000, symbol = 'TEST') => ({ timestamp, open, high, low, close, volume, symbol });

test('recognizes hammer and shooting-star reversal candles', () => {
  assert.equal(isBullishHammer(c('2026-08-10T09:30:00+05:30', 100, 102, 94, 101)), true);
  assert.equal(isBearishShootingStar(c('2026-08-10T09:30:00+05:30', 101, 108, 100, 100.5)), true);
});

test('bullish opening-low sweep enters only after reversal candle and targets opening high', () => {
  const rows = [
    c('2026-08-10T09:15:00+05:30',100,104,99,103),
    c('2026-08-10T09:20:00+05:30',103,106,102,105),
    c('2026-08-10T09:25:00+05:30',105,107,101,102),
    c('2026-08-10T09:30:00+05:30',102,103,98,102.5),
    c('2026-08-10T09:35:00+05:30',102.5,104,102,103.5),
    c('2026-08-10T09:40:00+05:30',103.5,107.5,103,107),
  ];
  const result = backtest(rows);
  assert.equal(result.trades.length, 1);
  const t = result.trades[0];
  assert.equal(t.direction, 'LONG');
  assert.equal(t.entryTime, '2026-08-10T09:35:00+05:30');
  assert.equal(t.stop, 98);
  assert.equal(t.target, 107);
  assert.equal(t.result, 'TARGET');
  assert.ok(t.realizedR > 0);
});

test('same-bar stop and target conflict is counted as stop conservatively', () => {
  const rows = [
    c('2026-08-11T09:15:00+05:30',100,104,99,103),
    c('2026-08-11T09:20:00+05:30',103,106,102,105),
    c('2026-08-11T09:25:00+05:30',105,107,101,102),
    c('2026-08-11T09:30:00+05:30',102,103,98,102.5),
    c('2026-08-11T09:35:00+05:30',102.5,108,97,104),
  ];
  const result = backtest(rows);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].result, 'STOP');
  assert.equal(result.trades[0].ambiguousBar, true);
});

test('does not enter merely because opening range was swept without reversal confirmation', () => {
  const rows = [
    c('2026-08-12T09:15:00+05:30',100,104,99,103),
    c('2026-08-12T09:20:00+05:30',103,106,102,105),
    c('2026-08-12T09:25:00+05:30',105,107,101,102),
    c('2026-08-12T09:30:00+05:30',102,109,101,108),
    c('2026-08-12T09:35:00+05:30',108,110,107,109),
  ];
  const result = backtest(rows);
  assert.equal(result.trades.length, 0);
});

test('isolates opening ranges and trades by symbol on the same trading date', () => {
  const date = '2026-08-13';
  const makeSetup = (symbol, base) => [
    c(`${date}T09:15:00+05:30`, base, base + 4, base - 1, base + 3, 1000, symbol),
    c(`${date}T09:20:00+05:30`, base + 3, base + 6, base + 2, base + 5, 1000, symbol),
    c(`${date}T09:25:00+05:30`, base + 5, base + 7, base + 1, base + 2, 1000, symbol),
    c(`${date}T09:30:00+05:30`, base + 2, base + 3, base - 2, base + 2.5, 1000, symbol),
    c(`${date}T09:35:00+05:30`, base + 2.5, base + 4, base + 2, base + 3.5, 1000, symbol),
    c(`${date}T09:40:00+05:30`, base + 3.5, base + 8, base + 3, base + 7, 1000, symbol),
  ];

  const result = backtest([...makeSetup('AAA', 100), ...makeSetup('BBB', 1000)]);
  assert.equal(result.trades.length, 2);
  assert.deepEqual(result.trades.map((t) => t.symbol).sort(), ['AAA', 'BBB']);
  assert.equal(result.trades.find((t) => t.symbol === 'AAA').openingHigh, 107);
  assert.equal(result.trades.find((t) => t.symbol === 'BBB').openingHigh, 1007);
});

test('skips a setup when the opposite opening edge is not beyond the entry trigger', () => {
  const rows = [
    c('2026-08-14T09:15:00+05:30',100,104,99,103),
    c('2026-08-14T09:20:00+05:30',103,106,102,105),
    c('2026-08-14T09:25:00+05:30',105,107,101,102),
    c('2026-08-14T09:30:00+05:30',102,109,98,102.5),
    c('2026-08-14T09:35:00+05:30',102.5,110,102,109),
  ];
  const result = backtest(rows);
  assert.equal(result.trades.length, 0);
});
