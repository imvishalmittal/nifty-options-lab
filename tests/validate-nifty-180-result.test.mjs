import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNifty180Result } from '../research/validate-nifty-180-result.mjs';

test('accepts a complete NIFTY premium research result', () => {
  const out = validateNifty180Result({ diagnostics: {
    tradingDates: 20,
    scoredTrades: 8,
    missingDays: 0,
    boundaryDays: 0,
    ambiguousDays: 0,
  }});
  assert.equal(out.valid, true);
  assert.deepEqual(out.blockers, []);
});

test('rejects partial or unresolved NIFTY premium research results', () => {
  const out = validateNifty180Result({ diagnostics: {
    tradingDates: 23,
    scoredTrades: 8,
    missingDays: 10,
    boundaryDays: 1,
    ambiguousDays: 2,
  }});
  assert.equal(out.valid, false);
  assert.deepEqual(out.blockers, [
    '10 DATA_MISSING session(s)',
    '1 CANDIDATE_BOUNDARY session(s)',
    '2 AMBIGUOUS session(s)',
  ]);
});
