import test from 'node:test';
import assert from 'node:assert/strict';
import { isCompleteMomentumResult, momentumIntegrityIssues } from '../research/momentum-result-integrity.mjs';

function completeResult() {
  const trades = [{ date: '2025-01-01' }, { date: '2025-01-02' }];
  return {
    baselineDiagnostics: { scoredTrades: 2, missingDays: 0, boundaryDays: 0, ambiguousDays: 0, rateLimitRetries: 0 },
    variants: Object.fromEntries(['5','10','15','20'].map((gap) => [gap, { trades: structuredClone(trades) }]))
  };
}

test('accepts a complete momentum month', () => {
  assert.equal(isCompleteMomentumResult(completeResult()), true);
});

test('rejects missing or boundary sessions and retry-contaminated results', () => {
  const result = completeResult();
  result.baselineDiagnostics.missingDays = 1;
  result.baselineDiagnostics.boundaryDays = 2;
  result.baselineDiagnostics.rateLimitRetries = 1;
  const issues = momentumIntegrityIssues(result);
  assert.ok(issues.includes('missingDays=1'));
  assert.ok(issues.includes('boundaryDays=2'));
  assert.ok(issues.includes('rateLimitRetries=1'));
  assert.equal(isCompleteMomentumResult(result), false);
});

test('rejects silent loss of a baseline trade in any trail variant', () => {
  const result = completeResult();
  result.variants['10'].trades.pop();
  assert.ok(momentumIntegrityIssues(result).some((issue) => issue.includes('trail 10: 1 trades != baseline 2')));
});
