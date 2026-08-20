import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPaperSession } from '../paper/session-journal.mjs';

test('session journal keeps variant P/L separate instead of presenting an additive account result', () => {
  const row = compactPaperSession({
    date: '2026-08-21', status: 'CLOSED', updatedAt: '2026-08-21T10:00:00Z',
    trades: [
      { strategyVersion: 'V2', totalPnl: 100 },
      { strategyVersion: 'V3', trailStepPoints: 10, totalPnl: 80 },
      { strategyVersion: 'V6', totalPnl: 120 },
    ],
  }, 'BASE');
  assert.deepEqual(row.strategyVersions, ['V2', 'V3-5', 'V3-10', 'V6', 'V7', 'V8']);
  assert.deepEqual(row.strategyOutcomes.V2, { tradeCount: 1, totalPnl: 100 });
  assert.deepEqual(row.strategyOutcomes['V3-10'], { tradeCount: 1, totalPnl: 80 });
  assert.deepEqual(row.strategyOutcomes.V6, { tradeCount: 1, totalPnl: 120 });
});

test('confirmed thread declares both V4 and V5', () => {
  const row = compactPaperSession({ date: '2026-08-21', status: 'NO_TRADE' }, 'V4');
  assert.deepEqual(row.strategyVersions, ['V4', 'V5']);
});
