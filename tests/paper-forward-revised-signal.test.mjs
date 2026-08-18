import test from 'node:test';
import assert from 'node:assert/strict';
import { firstSignal, nextBarEntry, selectSide } from '../paper/paper-engine.mjs';

const bar = (time, open, close) => ({
  timestamp: `2026-08-19T${time}:00+05:30`,
  open,
  high: Math.max(open, close) + 1,
  low: Math.min(open, close) - 1,
  close,
});

test('firstSignal accepts the first completed close above 180 without requiring a fresh crossing', () => {
  const candles = [
    bar('09:25', 184, 184),
    bar('09:29', 185, 185),
    bar('09:30', 186, 186),
    bar('09:31', 187, 187),
  ];
  const signal = firstSignal(candles);
  assert.equal(signal.timestamp, '2026-08-19T09:30:00+05:30');
});

test('selectSide monitors only the 09:25 contract closest to 180 overall', () => {
  const callCandles = [
    bar('09:25', 176, 176),
    bar('09:30', 178, 178),
    bar('09:31', 182, 182),
    bar('09:32', 183, 183),
  ];
  const putCandles = [
    bar('09:25', 190, 190),
    bar('09:30', 195, 195),
    bar('09:31', 196, 196),
    bar('09:32', 197, 197),
  ];
  const selected = selectSide(callCandles, putCandles);
  assert.equal(selected.side, 'CE');
  assert.equal(selected.signal.timestamp, '2026-08-19T09:31:00+05:30');
});

test('a selected contract already above 180 at 09:30 enters on the next bar open', () => {
  const callCandles = [
    bar('09:25', 184, 184),
    bar('09:30', 186, 186),
    bar('09:31', 188, 188),
  ];
  const putCandles = [
    bar('09:25', 170, 170),
    bar('09:30', 179, 179),
    bar('09:31', 181, 181),
  ];
  const selected = selectSide(callCandles, putCandles);
  assert.equal(selected.side, 'CE');
  assert.equal(selected.signal.timestamp, '2026-08-19T09:30:00+05:30');
  const entry = nextBarEntry(callCandles, selected.signal);
  assert.equal(entry.entry, 188);
  assert.equal(entry.entryBar.timestamp, '2026-08-19T09:31:00+05:30');
});

test('same-distance tie remains deterministic: higher premium wins', () => {
  const callCandles = [bar('09:25', 176, 176), bar('09:30', 181, 181), bar('09:31', 182, 182)];
  const putCandles = [bar('09:25', 184, 184), bar('09:30', 185, 185), bar('09:31', 186, 186)];
  const selected = selectSide(callCandles, putCandles);
  assert.equal(selected.side, 'PE');
});
