import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBarEntry } from '../paper/paper-engine.mjs';
import { chooseSingleClosest, firstCompletedCloseAbove } from '../research/nifty-180-single-closest.mjs';

const bar = (time, open, close) => ({
  timestamp: `2026-08-19T${time}:00+05:30`,
  open,
  high: Math.max(open, close) + 1,
  low: Math.min(open, close) - 1,
  close,
});

test('forward selection monitors exactly one contract closest to 180 overall', () => {
  const selected = chooseSingleClosest(
    { symbol: 'CE', optionType: 'CE', premium: 176 },
    { symbol: 'PE', optionType: 'PE', premium: 190 },
  );
  assert.equal(selected.optionType, 'CE');
});

test('first completed 09:30 close above 180 qualifies without a fresh crossing', () => {
  const candles = [bar('09:25', 184, 184), bar('09:30', 186, 186), bar('09:31', 188, 188)];
  const signal = firstCompletedCloseAbove(candles);
  assert.equal(signal.timestamp, '2026-08-19T09:30:00+05:30');
  const entry = nextBarEntry(candles, signal);
  assert.equal(entry.entry, 188);
  assert.equal(entry.entryBar.timestamp, '2026-08-19T09:31:00+05:30');
});

test('runtime waits when a signal exists but the next bar is not completed yet', () => {
  const candles = [bar('09:30', 181, 183)];
  const signal = firstCompletedCloseAbove(candles);
  assert.ok(signal);
  assert.equal(nextBarEntry(candles, signal), null);
});

test('same-distance tie stays deterministic and chooses higher premium', () => {
  const selected = chooseSingleClosest(
    { symbol: 'CE', optionType: 'CE', premium: 176 },
    { symbol: 'PE', optionType: 'PE', premium: 184 },
  );
  assert.equal(selected.optionType, 'PE');
});
