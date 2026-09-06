import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVixLowNifty180Gates } from '../research/vix-low-nifty-180-gates.mjs';

test('O1 gate advances if any variant survives sample and slippage profitability', () => {
  const gate = evaluateVixLowNifty180Gates({
    variants: {
      V2: { summary: { current: { trades: 120, totalNetPnl: 1, profitFactor: 1.1 }, stress0_5: { totalNetPnl: 1, profitFactor: 1.05 }, stress1_0: { totalNetPnl: 1, profitFactor: 1.01 } } },
      V3_10: { summary: { current: { trades: 0 } } },
    },
  });
  assert.equal(gate.passed, true);
  assert.equal(gate.variants.V2.passed, true);
});

test('O1 gate rejects thin or slippage-fragile discovery results', () => {
  const gate = evaluateVixLowNifty180Gates({
    variants: {
      V2: { summary: { current: { trades: 99, totalNetPnl: 100, profitFactor: 1.5 }, stress0_5: { totalNetPnl: 80, profitFactor: 1.2 }, stress1_0: { totalNetPnl: 60, profitFactor: 1.1 } } },
      V3_10: { summary: { current: { trades: 150, totalNetPnl: 100, profitFactor: 1.5 }, stress0_5: { totalNetPnl: 80, profitFactor: 1.2 }, stress1_0: { totalNetPnl: -1, profitFactor: 0.9 } } },
    },
  });
  assert.equal(gate.passed, false);
  assert.equal(gate.decision, 'REJECT_DISCOVERY');
});
