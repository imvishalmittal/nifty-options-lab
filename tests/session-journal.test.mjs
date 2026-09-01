import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPaperSession, upsertPaperSessions } from '../paper/session-journal.mjs';

const selectionAudit = {
  spot925: 24108.6,
  expiry: '2026-08-25',
  referencePremium: 180,
  ce: { selected: { symbol: 'NSE-NIFTY-25Aug26-24050-CE', strike: 24050, optionType: 'CE', premium: 179.4 } },
  pe: { selected: { symbol: 'NSE-NIFTY-25Aug26-24250-PE', strike: 24250, optionType: 'PE', premium: 187.6 } },
};

test('compactPaperSession preserves a NO_TRADE session without inventing a trade', () => {
  const row = compactPaperSession({
    date: '2026-08-19', updatedAt: '2026-08-19T04:16:04.179Z', status: 'NO_TRADE',
    reason: 'No valid ₹180 crossing before 09:45', selectionAudit,
  }, 'BASE');

  assert.equal(row.thread, 'BASE');
  assert.deepEqual(row.strategyVersions, ['V2', 'V3-5', 'V3-10', 'V6', 'V7', 'V8', 'V9', 'V10-5', 'V10-10', 'V11']);
  assert.equal(row.status, 'NO_TRADE');
  assert.equal(row.tradeCount, 0);
  assert.equal(row.totalPnl, null);
  assert.equal(row.ce.strike, 24050);
  assert.equal(row.pe.strike, 24250);
});

test('compactPaperSession records V4 identity and signal source when present', () => {
  const row = compactPaperSession({
    date: '2026-08-20', updatedAt: '2026-08-20T04:10:00.000Z', status: 'OPEN', selectionAudit,
    side: 'PE', strike: 24250, entry: 188.2, entryTime: '2026-08-20T09:36:00+05:30', signalSource: 'BACKUP',
  }, 'V4');

  assert.deepEqual(row.strategyVersions, ['V4', 'V5']);
  assert.equal(row.side, 'PE');
  assert.equal(row.entry, 188.2);
  assert.equal(row.signalSource, 'BACKUP');
});

test('upsertPaperSessions replaces reruns for the same date/thread instead of duplicating them', () => {
  const first = compactPaperSession({ date: '2026-08-19', status: 'DATA_BOUNDARY', selectionAudit }, 'BASE');
  const repaired = compactPaperSession({ date: '2026-08-19', status: 'NO_TRADE', reason: 'repaired', selectionAudit }, 'BASE');
  const v4 = compactPaperSession({ date: '2026-08-19', status: 'NO_TRADE', reason: 'v4', selectionAudit }, 'V4');

  const journal = upsertPaperSessions(upsertPaperSessions(null, [first]), [repaired, v4]);
  assert.equal(journal.sessions.length, 2);
  assert.equal(journal.sessions.find((row) => row.thread === 'BASE').status, 'NO_TRADE');
  assert.equal(journal.sessions.find((row) => row.thread === 'BASE').reason, 'repaired');
  assert.equal(journal.sessions.find((row) => row.thread === 'V4').reason, 'v4');
});
