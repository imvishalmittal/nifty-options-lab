import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateImmediateBreakeven } from '../research/profit-only-directional-engine.mjs';
import { evaluateRiskCapGates, RISK_CAP_VARIANTS } from '../research/profit-only-risk-cap-gates.mjs';

const row = (minute, open, high, low, close) => ({ timestamp: `2026-01-01T09:${minute}:00+05:30`, open, high, low, close });

test('risk cap raises a distant signal-low stop and starts it on the next candle', () => {
  const rows = [row('30', 205, 210, 180, 200), row('31', 200, 204, 194, 196)];
  const capped = evaluateImmediateBreakeven(rows, rows[0].timestamp, 'CONFIRM_BE_10_CAP_5');
  const uncapped = evaluateImmediateBreakeven(rows, rows[0].timestamp, 'CONFIRM_BE_10');
  assert.equal(capped.exit, 195);
  assert.equal(capped.result, 'INITIAL_STOP');
  assert.equal(uncapped.exit, 196);
  assert.equal(uncapped.result, 'SESSION_EXIT');
});

test('risk-cap gate evaluates combined, CE, and PE independently', () => {
  const scenario = (totalNetPnl) => ({ trades: 120, totalNetPnl, profitFactor: totalNetPnl > 0 ? 1.2 : 0.8 });
  const variants = Object.fromEntries(RISK_CAP_VARIANTS.map((key) => [key, { summary: {
    combined: { current: scenario(-1), stress0_5: scenario(-1), stress1_0: scenario(-1) },
    CE: { current: scenario(-1), stress0_5: scenario(-1), stress1_0: scenario(-1) },
    PE: { current: scenario(10), stress0_5: scenario(5), stress1_0: scenario(1) },
  } }]));
  const gate = evaluateRiskCapGates({ variants });
  assert.equal(gate.variants[RISK_CAP_VARIANTS[0]].PE.passed, true);
  assert.equal(gate.variants[RISK_CAP_VARIANTS[0]].CE.passed, false);
  assert.equal(gate.passedCandidates.length, 8);
});
