import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePaperOutcomes, markdownSummary } from '../paper/assert-session-outcome.mjs';

test('closed and genuine no-trade sessions are healthy', () => {
  const result = evaluatePaperOutcomes(
    { date: '2026-08-26', status: 'CLOSED', trades: [{ totalPnl: 1 }] },
    { date: '2026-08-26', status: 'NO_TRADE', reason: 'No confirmed signal' },
  );
  assert.equal(result.ok, true);
});

test('DATA_BOUNDARY is persisted but must fail workflow health', () => {
  const boundary = {
    date: '2026-08-26', status: 'DATA_BOUNDARY', reason: 'Could not bracket',
    selectionAudit: { ce: { candidatesChecked: [{ strike: 24300, premium: 193.3 }] }, pe: { candidatesChecked: [] } },
  };
  const result = evaluatePaperOutcomes(boundary, boundary);
  assert.equal(result.ok, false);
  assert.deepEqual(result.invalid.map((row) => row.thread), ['BASE', 'V4/V5']);
  assert.match(markdownSummary(result), /24300:₹193.3/);
  assert.match(markdownSummary(result), /Incomplete data status/);
});

test('mismatched session dates fail even when both statuses are terminal', () => {
  const result = evaluatePaperOutcomes(
    { date: '2026-08-25', status: 'CLOSED' },
    { date: '2026-08-26', status: 'NO_TRADE' },
  );
  assert.equal(result.ok, false);
  assert.equal(result.dateConsistent, false);
});
