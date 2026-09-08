import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProfitOnlyPromotionGates } from '../research/profit-only-promotion-gates.mjs';

const summary = (pnl) => ({ trades: 120, totalNetPnl: pnl, profitFactor: pnl > 0 ? 1.2 : 0.8 });
test('economic gate ignores the special zero-directional-loss diagnostic', () => {
  const variants = Object.fromEntries(['RETEST15_CONFIRM_BE_10', 'PREVIOUS_DAY_BREAK_CONFIRM_BE_10'].map((key) =>
    [key, { directionalLossTrades: 50, summary: { combined: { current: summary(100), stress0_5: summary(50), stress1_0: summary(10) } } }]));
  const gate = evaluateProfitOnlyPromotionGates({ variants });
  assert.equal(gate.passed, true);
  assert.equal(gate.variants.RETEST15_CONFIRM_BE_10.passed, true);
});

test('a variant failing adverse stress does not pass promotion', () => {
  const variants = Object.fromEntries(['RETEST15_CONFIRM_BE_10', 'PREVIOUS_DAY_BREAK_CONFIRM_BE_10'].map((key) =>
    [key, { summary: { combined: { current: summary(100), stress0_5: summary(50), stress1_0: summary(-1) } } }]));
  assert.equal(evaluateProfitOnlyPromotionGates({ variants }).passed, false);
});
