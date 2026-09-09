import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISCOVERY_PASSED_RISK_CAP_CANDIDATES,
  evaluateRiskCapValidationGates,
} from '../research/profit-only-risk-cap-validation-gates.mjs';
import { RISK_CAP_VARIANTS } from '../research/profit-only-risk-cap-gates.mjs';

const scenario = (pnl) => ({ trades: 120, totalNetPnl: pnl, profitFactor: pnl > 0 ? 1.2 : 0.8 });
const summary = (pnl) => ({ current: scenario(pnl), stress0_5: scenario(pnl), stress1_0: scenario(pnl) });

test('validation evaluates only candidates that passed discovery', () => {
  const variants = Object.fromEntries(RISK_CAP_VARIANTS.map((key) => [key, { summary: {
    combined: summary(-1), CE: summary(-1), PE: summary(-1),
  } }]));
  const [key, side] = DISCOVERY_PASSED_RISK_CAP_CANDIDATES[0];
  variants[key].summary[side] = summary(10);
  const gate = evaluateRiskCapValidationGates({ variants });
  assert.equal(gate.discoveryCandidateCount, 14);
  assert.deepEqual(gate.passedCandidates, [{ key, side }]);
  assert.equal(gate.passed, true);
});

test('a holdout failure rejects every discovery candidate', () => {
  const variants = Object.fromEntries(RISK_CAP_VARIANTS.map((key) => [key, { summary: {
    combined: summary(-1), CE: summary(-1), PE: summary(-1),
  } }]));
  const gate = evaluateRiskCapValidationGates({ variants });
  assert.equal(gate.passed, false);
  assert.equal(gate.decision, 'REJECT_AT_VALIDATION');
});
