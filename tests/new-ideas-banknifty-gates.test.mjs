import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateBankNiftyCandidate } from '../research/new-ideas-banknifty-gates.mjs';

test('BANKNIFTY gate rejects NIFTY contamination and non-dated sizes', () => {
  const document = {
    period: { startDate: '2020-01-01', endDate: '2024-12-31' },
    sessions: [{ date: '2020-01-01', status: 'PROCESSED' }],
    variants: { RETEST15_CONFIRM_BE_10: { trades: [{
      date: '2020-01-01', underlying: 'NIFTY', lotSize: 65,
      money: { current: 1, stress0_5: 1, stress1_0: 1 },
    }] } },
  };
  const result = evaluateBankNiftyCandidate(document);
  assert.equal(result.checks.bankNiftyOnly, false);
  assert.equal(result.checks.datedLotSizes, false);
  assert.equal(result.passed, false);
});
