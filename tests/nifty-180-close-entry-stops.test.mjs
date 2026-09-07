import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXIT_FAMILIES,
  STOP_VARIANTS,
  evaluateAllCloseEntryVariants,
  evaluateCloseEntryPosition,
  firstIntrabar180Signal,
} from '../research/nifty-180-close-entry-stops.mjs';

const c = (time, open, high, low, close) => ({ timestamp: `2026-01-01T${time}:00+05:30`, open, high, low, close });
const stop = (key) => STOP_VARIANTS.find((row) => row.key === key);
const family = (key) => EXIT_FAMILIES.find((row) => row.key === key);

test('signal is first intrabar touch even when candle closes below 180', () => {
  const candles = [c('09:29', 175, 181, 174, 176), c('09:30', 176, 185, 174, 179)];
  assert.equal(firstIntrabar180Signal(candles), candles[1]);
});

test('entry is signal close and signal low is not applied retroactively', () => {
  const candles = [
    c('09:30', 176, 185, 174, 179),
    c('09:31', 179, 183, 176, 181),
    c('09:32', 181, 184, 173, 174),
  ];
  const result = evaluateCloseEntryPosition(candles, candles[0], stop('SIGNAL_LOW'), family('V2'));
  assert.equal(result.entry, 179);
  assert.equal(result.entryTime, candles[1].timestamp);
  assert.equal(result.exit, 174);
  assert.equal(result.exitTime, candles[2].timestamp);
});

test('immediate breakeven stop begins on next candle', () => {
  const candles = [c('09:30', 176, 185, 174, 179), c('09:31', 179, 181, 178, 180)];
  const result = evaluateCloseEntryPosition(candles, candles[0], stop('IMMEDIATE_BE'), family('V2'));
  assert.equal(result.entry, 179);
  assert.equal(result.exit, 179);
  assert.equal(result.result, 'BREAKEVEN_STOP');
});

test('delayed breakeven becomes effective only on following candle', () => {
  const candles = [
    c('09:30', 176, 185, 174, 179),
    c('09:31', 179, 184, 176, 183),
    c('09:32', 183, 185, 175, 180),
    c('09:33', 178, 182, 177, 179),
  ];
  const result = evaluateCloseEntryPosition(candles, candles[0], stop('BE_5'), family('V2'));
  assert.equal(result.exitTime, candles[2].timestamp);
  assert.equal(result.exit, 179);
  assert.equal(result.breakevenActivated, true);
});

test('all five stop variants cross both exit families', () => {
  const result = evaluateAllCloseEntryVariants([
    c('09:30', 176, 185, 174, 179),
    c('09:31', 179, 183, 176, 181),
  ]);
  assert.equal(result.status, 'SIGNAL');
  assert.equal(Object.keys(result.positions).length, 10);
});
