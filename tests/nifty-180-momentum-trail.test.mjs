import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMomentumDay, evaluateMomentumPosition, lotsAffordable } from '../research/nifty-180-momentum-trail.mjs';

const c = (timestamp, open, high, low, close) => ({ timestamp, open, high, low, close });

test('12-Aug-style momentum continues beyond 220 and exits on trailing stop', () => {
  const call = [
    c('2025-08-12T09:29:00+05:30', 178, 181, 176, 179),
    c('2025-08-12T09:30:00+05:30', 179, 184, 178, 182),
    c('2025-08-12T09:31:00+05:30', 184.15, 190, 182, 188),
    c('2025-08-12T09:32:00+05:30', 188, 205, 186, 202),
    c('2025-08-12T09:33:00+05:30', 202, 224, 200, 221),
    c('2025-08-12T09:34:00+05:30', 221, 235, 219, 232),
    c('2025-08-12T09:35:00+05:30', 232, 247, 229, 244),
    c('2025-08-12T09:36:00+05:30', 244, 246, 223, 226),
  ];
  const result = evaluateMomentumDay({ call:{symbol:'CE'}, put:{symbol:'PE'}, callCandles:call, putCandles:[], trailGapPoints:20 });
  assert.equal(result.status, 'TRADE');
  assert.equal(result.entry, 184.15);
  assert.equal(result.result, 'TRAIL_STOP');
  assert.equal(result.exit, 227);
  assert.equal(result.peakPremium, 247);
  assert.ok(Math.abs(result.mfePoints - 62.85) < 1e-9);
});

test('new stop from a completed bar is not applied retroactively inside that same bar', () => {
  const candles = [
    c('2025-01-01T09:30:00+05:30', 179, 185, 178, 182),
    c('2025-01-01T09:31:00+05:30', 183, 190, 181, 188),
    c('2025-01-01T09:32:00+05:30', 188, 225, 170, 220),
    c('2025-01-01T09:33:00+05:30', 221, 226, 204, 205),
  ];
  const result = evaluateMomentumPosition(candles, candles[0], { trailGapPoints:20 });
  assert.equal(result.result, 'TRAIL_STOP');
  assert.equal(result.exitTime, '2025-01-01T09:33:00+05:30');
  assert.equal(result.exit, 205);
});

test('gap below active stop exits at bar open rather than impossible stop price', () => {
  const candles = [
    c('2025-01-01T09:30:00+05:30',179,185,178,182),
    c('2025-01-01T09:31:00+05:30',183,225,181,222),
    c('2025-01-01T09:32:00+05:30',190,195,185,188),
  ];
  const result = evaluateMomentumPosition(candles, candles[0], { trailGapPoints:20 });
  assert.equal(result.finalStop, 205);
  assert.equal(result.exit, 190);
});

test('initial stop remains active before momentum reaches 220', () => {
  const call = [
    c('2025-01-01T09:29:00+05:30',178,179,177,179),
    c('2025-01-01T09:30:00+05:30',179,184,178,182),
    c('2025-01-01T09:31:00+05:30',183,190,170,185),
    c('2025-01-01T09:32:00+05:30',185,190,158,159),
  ];
  const result = evaluateMomentumDay({ call:{symbol:'CE'}, put:{symbol:'PE'}, callCandles:call, putCandles:[], trailGapPoints:20 });
  assert.equal(result.result, 'INITIAL_STOP');
  assert.equal(result.exit, 160);
  assert.equal(result.trailActivated, false);
});

test('capital sizing buys only whole historical lots', () => {
  assert.equal(lotsAffordable({capital:50000, entryPremium:184.15, lotSize:75}), 3);
  assert.equal(lotsAffordable({capital:60000, entryPremium:184.15, lotSize:75}), 4);
  assert.equal(lotsAffordable({capital:70000, entryPremium:184.15, lotSize:75}), 5);
  assert.equal(lotsAffordable({capital:10000, entryPremium:184.15, lotSize:75}), 0);
});
