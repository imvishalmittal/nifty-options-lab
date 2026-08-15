import test from 'node:test';
import assert from 'node:assert/strict';
import { backtestQuickFlip, computeWilderAtrByDate } from '../research/quick-flip-backtest.mjs';

const c = (timestamp, open, high, low, close, volume = 1000, symbol = 'TEST') => ({ timestamp, open, high, low, close, volume, symbol });

function day(date, base = 100, openingRange = 6, symbol = 'TEST') {
  return [
    c(`${date}T09:15:00+05:30`, base, base + openingRange / 2, base - openingRange / 2, base + 1, 1000, symbol),
    c(`${date}T09:20:00+05:30`, base + 1, base + 2, base - 1, base + 0.5, 1000, symbol),
    c(`${date}T09:25:00+05:30`, base + 0.5, base + 2, base - 1, base, 1000, symbol),
    c(`${date}T15:10:00+05:30`, base, base + 1, base - 1, base, 1000, symbol),
  ];
}

function isoDay(n) {
  const d = new Date(Date.UTC(2026, 0, 1 + n));
  return d.toISOString().slice(0, 10);
}

test('Wilder ATR becomes available only after enough completed sessions', () => {
  const days = new Map();
  for (let i = 0; i < 16; i++) days.set(isoDay(i), day(isoDay(i)));
  const atr = computeWilderAtrByDate(days, 14);
  assert.equal(atr.has(isoDay(13)), false);
  assert.equal(atr.has(isoDay(14)), true);
});

test('Wilder ATR ignores corrupt pre-open and closing-auction prints', () => {
  const cleanDays = new Map();
  const noisyDays = new Map();
  for (let i = 0; i < 16; i++) {
    const date = isoDay(i);
    const regular = day(date, 100 + i, 8);
    cleanDays.set(date, regular);
    noisyDays.set(date, [
      c(`${date}T09:00:00+05:30`, 1, 5000, 0.1, 1),
      ...regular,
      c(`${date}T15:20:00+05:30`, 1, 9000, 0.01, 7000),
    ]);
  }
  const clean = computeWilderAtrByDate(cleanDays, 14);
  const noisy = computeWilderAtrByDate(noisyDays, 14);
  for (const [date, value] of clean.entries()) assert.equal(noisy.get(date), value);
});

test('opening range below 25% of prior ATR is rejected', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(...day(isoDay(i), 100 + i * 3, 12));
  const d = isoDay(15);
  rows.push(
    c(`${d}T09:15:00+05:30`, 145.0, 145.4, 144.6, 145.1),
    c(`${d}T09:20:00+05:30`, 145.1, 145.5, 144.7, 145.0),
    c(`${d}T09:25:00+05:30`, 145.0, 145.3, 144.5, 144.9),
    c(`${d}T09:30:00+05:30`, 144.9, 145.2, 140.0, 144.8),
    c(`${d}T09:35:00+05:30`, 144.8, 146.0, 144.7, 145.8),
  );
  const result = backtestQuickFlip(rows);
  assert.equal(result.diagnostics.openingCompleteDays, 1);
  assert.ok(result.diagnostics.openingRangeAtrFractionStats.max < 0.25);
  assert.equal(result.trades.length, 0);
});

test('qualified low sweep plus hammer enters after reversal and targets opposite box edge', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(...day(isoDay(i), 100, 8));
  const d = isoDay(15);
  rows.push(
    c(`${d}T09:15:00+05:30`, 100, 104, 98, 103),
    c(`${d}T09:20:00+05:30`, 103, 106, 102, 105),
    c(`${d}T09:25:00+05:30`, 105, 107, 101, 102),
    c(`${d}T09:30:00+05:30`, 102, 103, 96, 102.5),
    c(`${d}T09:35:00+05:30`, 102.5, 104, 102, 103.5),
    c(`${d}T09:40:00+05:30`, 103.5, 108, 103, 107.5),
  );
  const result = backtestQuickFlip(rows);
  assert.equal(result.trades.length, 1);
  const trade = result.trades[0];
  assert.equal(trade.direction, 'LONG');
  assert.equal(trade.pattern, 'HAMMER');
  assert.equal(trade.entryTime, `${d}T09:35:00+05:30`);
  assert.equal(trade.target, 107);
  assert.ok(trade.openingRangeAtrFraction >= 0.25);
});

test('unresolved Quick Flip ignores 15:20 auction spike for exit', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(...day(isoDay(i), 100, 8));
  const d = isoDay(15);
  rows.push(
    c(`${d}T09:15:00+05:30`, 100, 104, 98, 103),
    c(`${d}T09:20:00+05:30`, 103, 106, 102, 105),
    c(`${d}T09:25:00+05:30`, 105, 107, 101, 102),
    c(`${d}T09:30:00+05:30`, 102, 103, 96, 102.5),
    c(`${d}T09:35:00+05:30`, 102.5, 104, 102, 103.5),
    c(`${d}T15:10:00+05:30`, 103.5, 104.5, 103, 104),
    c(`${d}T15:20:00+05:30`, 104, 500, 1, 400),
  );
  const result = backtestQuickFlip(rows);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].result, 'EOD');
  assert.equal(result.trades[0].exitTime, `${d}T15:10:00+05:30`);
  assert.equal(result.trades[0].exit, 104);
});

test('multi-symbol data remains isolated by symbol and date', () => {
  const rows = [];
  for (const symbol of ['AAA', 'BBB']) {
    for (let i = 0; i < 16; i++) rows.push(...day(isoDay(i), symbol === 'AAA' ? 100 : 1000, 8, symbol));
  }
  const result = backtestQuickFlip(rows);
  assert.ok(result.diagnostics.symbolDays >= 32);
});
