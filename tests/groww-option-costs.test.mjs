import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLongOptionRoundTripCosts, growwOptionRatesForTradeDate } from '../research/groww-option-costs.mjs';

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

test('STT schedule switches on 1 April 2026 without changing strategy economics', () => {
  assert.equal(growwOptionRatesForTradeDate('2026-03-31').sttSellRate, 0.0010);
  assert.equal(growwOptionRatesForTradeDate('2026-04-01').sttSellRate, 0.0015);
  const march = calculateLongOptionRoundTripCosts({ entryPremium: 180, exitPremium: 220, lotSize: 65, tradeDate: '2026-03-31' });
  const april = calculateLongOptionRoundTripCosts({ entryPremium: 180, exitPremium: 220, lotSize: 65, tradeDate: '2026-04-01' });
  assert.equal(march.sttSellRate, 0.0010);
  assert.equal(april.sttSellRate, 0.0015);
  assert.ok(march.netPnl > april.netPnl);
});
