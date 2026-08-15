import test from 'node:test';
import assert from 'node:assert/strict';
import { backtestQuickFlip, computeWilderAtrByDate } from '../research/quick-flip-backtest.mjs';

const c = (timestamp, open, high, low, close, volume = 1000, symbol = 'TEST') => ({ timestamp, open, high, low, close, volume, symbol });

function day(date, base = 100, openingRange = 6, symbol = 'TEST') {
  return [
    c(`${date}T09:15:00+05:30`, base, base + openingRange / 2, base - openingRange / 2, base + 1, 1000, symbol),
    c(`${date}T09:20:00+05:30`, base + 1, base + 2, base - 1, base + 0.5, 1000, symbol),
    c(`${date}T09:25:00+05:30`, base + 0.5, base + 2, base - 1, base, 1000, symbol),
    c(`${date}T15:25:00+05:30`, base, base + 1, base - 1, base, 1000, symbol),
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

test('opening range below 25% of prior ATR is rejected', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(...day(isoDay(i), 100 + i * 3, 12));
  const d = isoDay(15);
  rows.push(...day(d, 145, 1));
  rows.push(c(`${d}T09:30:00+05:30`, 145, 146, 140, 145.5));
  rows.push(c(`${d}T09:35:00+05:30`, 145.5, 147, 145, 146.5));
  const result = backtestQuickFlip(rows);
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

test('multi-symbol data remains isolated by symbol and date', () => {
  const rows = [];
  for (const symbol of ['AAA', 'BBB']) {
    for (let i = 0; i < 16; i++) rows.push(...day(isoDay(i), symbol === 'AAA' ? 100 : 1000, 8, symbol));
  }
  const result = backtestQuickFlip(rows);
  assert.ok(result.diagnostics.symbolDays >= 32);
});
