import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSteppedMomentumPosition, steppedTrailStop } from '../research/nifty-180-stepped-trail.mjs';

const c = (timestamp, open, high, low, close) => ({ timestamp, open, high, low, close });

test('5-point and 10-point step variants reach breakeven after 20 favorable points', () => {
  const common = { entry: 184.15, peakHigh: 204.15, initialStop: 160, trailGapPoints: 20 };
  assert.ok(Math.abs(steppedTrailStop({ ...common, trailStepPoints: 5 }) - 184.15) < 1e-9);
  assert.ok(Math.abs(steppedTrailStop({ ...common, trailStepPoints: 10 }) - 184.15) < 1e-9);
});

test('10-point variant ratchets in 10-point steps', () => {
  const common = { entry: 184.15, initialStop: 160, trailGapPoints: 20, trailStepPoints: 10 };
  assert.equal(steppedTrailStop({ ...common, peakHigh: 194.14 }), 160);
  assert.ok(Math.abs(steppedTrailStop({ ...common, peakHigh: 194.15 }) - 174.15) < 1e-9);
  assert.ok(Math.abs(steppedTrailStop({ ...common, peakHigh: 204.15 }) - 184.15) < 1e-9);
  assert.ok(Math.abs(steppedTrailStop({ ...common, peakHigh: 214.15 }) - 194.15) < 1e-9);
});

test('5-point variant ratchets more frequently than 10-point variant', () => {
  const common = { entry: 184.15, peakHigh: 199.15, initialStop: 160, trailGapPoints: 20 };
  assert.ok(Math.abs(steppedTrailStop({ ...common, trailStepPoints: 5 }) - 179.15) < 1e-9);
  assert.ok(Math.abs(steppedTrailStop({ ...common, trailStepPoints: 10 }) - 174.15) < 1e-9);
});

test('new stepped stop is not applied retroactively inside source bar', () => {
  const candles = [
    c('2025-01-01T09:30:00+05:30', 179, 185, 178, 182),
    c('2025-01-01T09:31:00+05:30', 184.15, 204.15, 170, 202),
    c('2025-01-01T09:32:00+05:30', 185, 190, 180, 182),
  ];
  const result = evaluateSteppedMomentumPosition(candles, candles[0], { trailStepPoints: 10 });
  assert.equal(result.result, 'TRAIL_STOP');
  assert.ok(Math.abs(result.exit - 184.15) < 1e-9);
  assert.equal(result.exitTime, '2025-01-01T09:32:00+05:30');
});

test('gap below stepped stop fills at bar open', () => {
  const candles = [
    c('2025-01-01T09:30:00+05:30', 179, 185, 178, 182),
    c('2025-01-01T09:31:00+05:30', 184, 234, 180, 225),
    c('2025-01-01T09:32:00+05:30', 200, 205, 195, 198),
  ];
  const result = evaluateSteppedMomentumPosition(candles, candles[0], { trailStepPoints: 10 });
  assert.equal(result.finalStop, 214);
  assert.equal(result.exit, 200);
});
