import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLongOptionRoundTripCosts } from '../research/groww-option-costs.mjs';

test('round-trip option costs include brokerage, statutory charges and GST', () => {
  const result = calculateLongOptionRoundTripCosts({ entryPremium: 180, exitPremium: 220, lotSize: 65 });
  assert.equal(result.grossPnl, 2600);
  assert.equal(result.charges.brokerage, 40);
  assert.ok(result.charges.stt > 0);
  assert.ok(result.charges.exchange > 0);
  assert.ok(result.charges.gst > 0);
  assert.ok(result.netPnl < result.grossPnl);
});

test('slippage stress worsens both entry and exit for a long option', () => {
  const clean = calculateLongOptionRoundTripCosts({ entryPremium: 180, exitPremium: 220, lotSize: 65 });
  const stressed = calculateLongOptionRoundTripCosts({ entryPremium: 180, exitPremium: 220, lotSize: 65, slippagePointsPerLeg: 1 });
  assert.equal(stressed.effectiveEntry, 181);
  assert.equal(stressed.effectiveExit, 219);
  assert.ok(stressed.netPnl < clean.netPnl);
});

test('lot size is mandatory so points are never mistaken for rupee P&L', () => {
  assert.throws(() => calculateLongOptionRoundTripCosts({ entryPremium: 180, exitPremium: 220, lotSize: 0 }), /lotSize/);
});
