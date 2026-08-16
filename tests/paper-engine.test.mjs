import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPER_RULES, firstSignal, initialPosition, lotsAffordable, nextBarEntry, processCompletedBar, selectSide, steppedTrailStop } from '../paper/paper-engine.mjs';

const c = (timestamp, open, high, low, close) => ({ timestamp, open, high, low, close });

test('signal requires completed crossing after 09:30', () => {
  const candles = [
    c('2026-08-17T09:29:00+05:30', 179, 181, 178, 179),
    c('2026-08-17T09:30:00+05:30', 179, 184, 178, 182),
  ];
  assert.equal(firstSignal(candles)?.timestamp, '2026-08-17T09:30:00+05:30');
});

test('entry is next bar open and must remain inside 160-220 band', () => {
  const candles = [
    c('2026-08-17T09:29:00+05:30', 178, 180, 177, 179),
    c('2026-08-17T09:30:00+05:30', 179, 185, 178, 182),
    c('2026-08-17T09:31:00+05:30', 184.15, 190, 182, 188),
  ];
  const signal = firstSignal(candles);
  const entry = nextBarEntry(candles, signal);
  assert.equal(entry.entry, 184.15);
  assert.equal(entry.entryBar.timestamp, '2026-08-17T09:31:00+05:30');
});

test('same-minute CE and PE signals are ambiguous', () => {
  const rows = [c('2026-08-17T09:29:00+05:30', 178, 180, 177, 179), c('2026-08-17T09:30:00+05:30', 179, 185, 178, 182)];
  assert.equal(selectSide(rows, rows).ambiguous, true);
});

test('10-point step moves stop only when a full step is completed', () => {
  const args = { entry: 184.15, initialStop: 160, trailGap: 20, trailStep: 10 };
  assert.equal(steppedTrailStop({ ...args, peakHigh: 194.14 }), 160);
  assert.ok(Math.abs(steppedTrailStop({ ...args, peakHigh: 194.15 }) - 174.15) < 1e-9);
  assert.ok(Math.abs(steppedTrailStop({ ...args, peakHigh: 204.15 }) - 184.15) < 1e-9);
  assert.ok(Math.abs(steppedTrailStop({ ...args, peakHigh: 214.15 }) - 194.15) < 1e-9);
});

test('stepped stop from completed bar is causal and effective next bar', () => {
  let position = initialPosition({ entry: 184.15, entryTime: '2026-08-17T09:31:00+05:30' });
  position = processCompletedBar(position, c('2026-08-17T09:31:00+05:30', 184.15, 204.15, 170, 202));
  assert.equal(position.exit, null);
  assert.ok(Math.abs(position.activeStop - 184.15) < 1e-9);
  position = processCompletedBar(position, c('2026-08-17T09:32:00+05:30', 185, 190, 180, 182));
  assert.ok(Math.abs(position.exit.price - 184.15) < 1e-9);
  assert.equal(position.exit.result, 'TRAIL_STOP');
});

test('gap below active stop fills at bar open', () => {
  let position = initialPosition({ entry: 184, entryTime: '2026-08-17T09:31:00+05:30' });
  position = processCompletedBar(position, c('2026-08-17T09:31:00+05:30', 184, 234, 180, 225));
  assert.equal(position.activeStop, 214);
  position = processCompletedBar(position, c('2026-08-17T09:32:00+05:30', 200, 205, 195, 198));
  assert.equal(position.exit.price, 200);
});

test('₹60k sizing buys whole current NIFTY lots only', () => {
  assert.equal(PAPER_RULES.lotSize, 65);
  assert.equal(PAPER_RULES.trailStep, 10);
  assert.equal(lotsAffordable(184.15), 5);
});
