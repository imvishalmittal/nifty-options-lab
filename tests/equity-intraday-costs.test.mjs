import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEquityIntradayRoundTrip, equityIntradayCostScenarios } from '../research/equity-intraday-costs.mjs';

test('long intraday costs apply stamp on buy and STT on sell', () => {
  const result = calculateEquityIntradayRoundTrip({ direction: 'LONG', entry: 100, exit: 101, quantity: 500 });
  assert.ok(result.entryCharges.stamp > 0);
  assert.equal(result.entryCharges.stt, 0);
  assert.ok(result.exitCharges.stt > 0);
  assert.equal(result.exitCharges.stamp, 0);
  assert.ok(result.netPnl < 500);
});

test('short intraday costs apply sell taxes to entry and adverse slippage', () => {
  const base = equityIntradayCostScenarios({ direction: 'SHORT', entry: 100, exit: 99, quantity: 500 });
  assert.ok(base.normalized.entryCharges.stt > 0);
  assert.ok(base.normalized.exitCharges.stamp > 0);
  assert.ok(base.normalized.netPnl > base.stress2bps.netPnl);
  assert.ok(base.stress2bps.netPnl > base.stress5bps.netPnl);
});
