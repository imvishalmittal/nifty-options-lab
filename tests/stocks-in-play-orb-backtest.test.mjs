import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeOpeningVolumeByDate, backtestStocksInPlayOrb } from '../research/stocks-in-play-orb-backtest.mjs';

const c = (timestamp, open, high, low, close, volume = 1000, symbol = 'TEST') => ({ timestamp, open, high, low, close, volume, symbol });

function isoDay(n) {
  return new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
}

function rowsForDay(date, { base = 100, firstVolume = 1000, bullish = true, breakout = false, symbol = 'TEST' } = {}) {
  const opening = bullish
    ? c(`${date}T09:15:00+05:30`, base, base + 2, base - 1, base + 1, firstVolume, symbol)
    : c(`${date}T09:15:00+05:30`, base, base + 1, base - 2, base - 1, firstVolume, symbol);
  const second = bullish
    ? c(`${date}T09:20:00+05:30`, base + 1, breakout ? base + 3 : base + 1.5, base, base + 1.2, 800, symbol)
    : c(`${date}T09:20:00+05:30`, base - 1, base, breakout ? base - 3 : base - 1.5, base - 1.2, 800, symbol);
  return [
    opening,
    second,
    c(`${date}T09:25:00+05:30`, base + 1, base + 1.5, base - 0.5, base + 1, 700, symbol),
    c(`${date}T15:10:00+05:30`, base + 1, base + 2, base + 0.5, base + 1.5, 850, symbol),
    c(`${date}T15:25:00+05:30`, base + 10, base + 20, base - 10, base + 15, 900, symbol),
  ];
}

test('relative opening volume uses only the prior 14 opening bars', () => {
  const days = new Map();
  for (let i = 0; i < 14; i++) days.set(isoDay(i), rowsForDay(isoDay(i), { firstVolume: 1000 }));
  days.set(isoDay(14), rowsForDay(isoDay(14), { firstVolume: 1500 }));
  const rvol = relativeOpeningVolumeByDate(days, 14);
  assert.equal(rvol.get(isoDay(14)).priorMeanOpeningVolume, 1000);
  assert.equal(rvol.get(isoDay(14)).relativeVolume, 1.5);
});

test('relative opening volume warmup resets after a structural price break', () => {
  const days = new Map();
  for (let i = 0; i < 15; i++) days.set(isoDay(i), rowsForDay(isoDay(i), { base: 100, firstVolume: 1000 }));
  days.set(isoDay(15), rowsForDay(isoDay(15), { base: 50, firstVolume: 1500 }));
  for (let i = 16; i < 30; i++) days.set(isoDay(i), rowsForDay(isoDay(i), { base: 50, firstVolume: 1000 }));
  days.set(isoDay(30), rowsForDay(isoDay(30), { base: 50, firstVolume: 1500 }));
  const rvol = relativeOpeningVolumeByDate(days, 14);
  assert.equal(rvol.has(isoDay(15)), false);
  assert.equal(rvol.has(isoDay(29)), false);
  assert.equal(rvol.get(isoDay(30)).relativeVolume, 1.5);
});

test('Stocks-in-Play skips a corrupt continuous-session candle', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(...rowsForDay(isoDay(i), { firstVolume: 1000 }));
  const d = isoDay(15);
  rows.push(...rowsForDay(d, { firstVolume: 1500, breakout: true }));
  rows.push(c(`${d}T10:30:00+05:30`, 103, 10300, 102, 10250));
  const result = backtestStocksInPlayOrb(rows, { minRelativeVolume: 1.2 });
  assert.equal(result.trades.length, 0);
  assert.equal(result.diagnostics.invalidDataDays, 1);
});

test('high-RVOL bullish opening enters only after later high breakout', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(...rowsForDay(isoDay(i), { base: 100 + i * 0.2, firstVolume: 1000 }));
  const d = isoDay(15);
  rows.push(...rowsForDay(d, { base: 103, firstVolume: 1500, bullish: true, breakout: true }));
  const result = backtestStocksInPlayOrb(rows, { minRelativeVolume: 1.2 });
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].direction, 'LONG');
  assert.equal(result.trades[0].entryTime, `${d}T09:20:00+05:30`);
  assert.ok(result.trades[0].relativeVolume >= 1.2);
});

test('low relative-volume day is filtered before breakout logic', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(...rowsForDay(isoDay(i), { firstVolume: 1000 }));
  const d = isoDay(15);
  rows.push(...rowsForDay(d, { firstVolume: 900, breakout: true }));
  const result = backtestStocksInPlayOrb(rows, { minRelativeVolume: 1.0 });
  assert.equal(result.trades.length, 0);
  assert.equal(result.diagnostics.qualifiedRvolDays, 0);
});

test('bearish opening produces a short breakout with ATR-normalized stop', () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(...rowsForDay(isoDay(i), { firstVolume: 1000 }));
  const d = isoDay(15);
  rows.push(...rowsForDay(d, { firstVolume: 1600, bullish: false, breakout: true }));
  const result = backtestStocksInPlayOrb(rows, { minRelativeVolume: 1.2 });
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].direction, 'SHORT');
  assert.ok(result.trades[0].stop > result.trades[0].entry);
  assert.equal(result.trades[0].stopAtrFraction, 0.10);
});

test('unresolved trade ignores 15:25/CAS-era prints and exits on 15:10 bar close', () => {
  const rows=[];
  for (let i=0;i<15;i++) rows.push(...rowsForDay(isoDay(i), { firstVolume:1000 }));
  const d=isoDay(15);
  rows.push(...rowsForDay(d, { base:103, firstVolume:1500, bullish:true, breakout:true }));
  // Use a deliberately wide stop only in this fixture so the assertion isolates
  // the closing-auction boundary instead of being resolved by a normal stop.
  const result=backtestStocksInPlayOrb(rows,{minRelativeVolume:1.2,stopAtrFraction:1.0});
  const trade=result.trades[0];
  assert.equal(trade.result,'CONTINUOUS_CLOSE');
  assert.equal(trade.exitTime,`${d}T15:10:00+05:30`);
  assert.equal(trade.exit,104.5);
});
