import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRunPaperSession } from '../paper/session-guard.mjs';

const date = '2026-08-17';

test('terminal paper outcomes suppress duplicate scheduled retries', () => {
  for (const status of ['CLOSED', 'NO_TRADE', 'AMBIGUOUS']) {
    assert.equal(shouldRunPaperSession({ date, status }, date).run, false);
  }
});

test('data and infrastructure failures remain retryable', () => {
  for (const status of ['STARTING', 'WAITING_SIGNAL', 'OPEN', 'NO_SESSION', 'DATA_MISSING', 'DATA_BOUNDARY', 'ERROR', 'FAILED']) {
    assert.equal(shouldRunPaperSession({ date, status }, date).run, true);
  }
});

test('old-session status never blocks today', () => {
  assert.equal(shouldRunPaperSession({ date: '2026-08-14', status: 'NO_TRADE' }, date).run, true);
});

test('explicit manual force bypasses terminal-session guard', () => {
  assert.equal(shouldRunPaperSession({ date, status: 'NO_TRADE' }, date, true).run, true);
});
