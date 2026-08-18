import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSingleClosest,
  classifySingleClosestSignal,
} from '../research/nifty-180-single-closest.mjs';

function candle(time, open, close, high = Math.max(open, close) + 1, low = Math.min(open, close) - 1) {
  return { timestamp: `2026-01-05T${time}:00+05:30`, open, high, low, close, volume: 1000 };
}

test('chooses one contract overall by absolute distance from 180', () => {
  const call = { symbol: 'CE', optionType: 'CE', premium: 164.8 };
  const put = { symbol: 'PE', optionType: 'PE', premium: 180.45 };
  assert.equal(chooseSingleClosest(call, put).symbol, 'PE');
});

test('closest premium may be above or below 180', () => {
  assert.equal(chooseSingleClosest(
    { symbol: 'CE', optionType: 'CE', premium: 184 },
    { symbol: 'PE', optionType: 'PE', premium: 172 },
  ).symbol, 'CE');
  assert.equal(chooseSingleClosest(
    { symbol: 'CE', optionType: 'CE', premium: 176 },
    { symbol: 'PE', optionType: 'PE', premium: 190 },
  ).symbol, 'CE');
});

test('first 09:30 close above 180 qualifies even if contract was never below 180', () => {
  const result = classifySingleClosestSignal([
    candle('09:25', 184, 185),
    candle('09:29', 185, 186),
    candle('09:30', 186, 188),
    candle('09:31', 189, 190),
  ]);
  assert.equal(result.status, 'SIGNAL');
  assert.equal(result.signalTime, '2026-01-05T09:30:00+05:30');
  assert.equal(result.signalClose, 188);
  assert.equal(result.entryTime, '2026-01-05T09:31:00+05:30');
  assert.equal(result.entry, 189);
});

test('waits for first close above 180 when selected contract starts below', () => {
  const result = classifySingleClosestSignal([
    candle('09:25', 176, 177),
    candle('09:30', 178, 179),
    candle('09:31', 179, 181.9),
    candle('09:32', 183.5, 184),
  ]);
  assert.equal(result.status, 'SIGNAL');
  assert.equal(result.signalTime, '2026-01-05T09:31:00+05:30');
  assert.equal(result.entry, 183.5);
});

test('09:44 signal is not executable because next bar is the cutoff', () => {
  const result = classifySingleClosestSignal([
    candle('09:43', 178, 179),
    candle('09:44', 179, 181),
    candle('09:45', 182, 183),
  ]);
  assert.equal(result.status, 'NO_TRADE');
  assert.equal(result.reason, 'No executable next-bar entry before 09:45 cutoff');
});

test('entry must remain inside 160-220 even if signal close is above 180', () => {
  const result = classifySingleClosestSignal([
    candle('09:30', 218, 221),
    candle('09:31', 222, 223),
  ]);
  assert.equal(result.status, 'NO_TRADE');
  assert.equal(result.entry, 222);
});
