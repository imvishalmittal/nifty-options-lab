import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPER_RULES, firstSignal, initialPosition, lotsAffordable, nextBarEntry, processCompletedBar, selectSide } from '../paper/paper-engine.mjs';

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

test('trail activates only after 220 and new stop is effective next bar', () => {
  let position = initialPosition({ entry: 184.15, entryTime: '2026-08-17T09:31:00+05:30' });
  position = processCompletedBar(position, c('2026-08-17T09:31:00+05:30', 184.15, 219.99, 170, 210));
  assert.equal(position.activeStop, 160);
  assert.equal(position.trailActivated, false);
  position = processCompletedBar(position, c('2026-08-17T09:32:00+05:30', 210, 224, 170, 221));
  assert.equal(position.exit, null);
  assert.equal(position.activeStop, 204);
  assert.equal(position.stopHistory.length, 2);
  position = processCompletedBar(position, c('2026-08-17T09:33:00+05:30', 205, 230, 202, 210));
  assert.equal(position.exit.price, 204);
  assert.equal(position.exit.result, 'TRAIL_STOP');
});

test('gap below active stop fills at bar open', () => {
  let position = initialPosition({ entry: 184, entryTime: '2026-08-17T09:31:00+05:30' });
  position = processCompletedBar(position, c('2026-08-17T09:31:00+05:30', 184, 230, 180, 225));
  assert.equal(position.activeStop, 210);
  position = processCompletedBar(position, c('2026-08-17T09:32:00+05:30', 200, 205, 195, 198));
  assert.equal(position.exit.price, 200);
});

test('₹60k sizing buys whole current NIFTY lots only', () => {
  assert.equal(PAPER_RULES.lotSize, 65);
  assert.equal(PAPER_RULES.trailActivation, 220);
  assert.equal(PAPER_RULES.trailGap, 20);
  assert.equal(lotsAffordable(184.15), 5);
});
