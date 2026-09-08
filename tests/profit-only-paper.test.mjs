import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactProfitOnlyPaperSession,
  shouldRunProfitOnlyPaper,
  upsertProfitOnlyPaperJournal,
} from '../paper/profit-only-paper-journal.mjs';

test('profit-only paper lane starts prospectively and prevents terminal duplicates', () => {
  assert.equal(shouldRunProfitOnlyPaper({ sessions: [] }, '2026-09-07').run, false);
  const journal = { sessions: [{ date: '2026-09-08', status: 'NO_TRADE' }] };
  assert.equal(shouldRunProfitOnlyPaper(journal, '2026-09-08').run, false);
  assert.equal(shouldRunProfitOnlyPaper(journal, '2026-09-08', true).run, true);
});

test('selected strategies are compacted with capital and all stress outcomes', () => {
  const trade = { date: '2026-09-08', side: 'CE', contract: { symbol: 'NIFTY-CE', expiryCode: '10Sep26', strike: 25000 },
    signalTime: '2026-09-08T09:30:00+05:30', entryTime: '2026-09-08T09:35:00+05:30', exitTime: '2026-09-08T10:00:00+05:30',
    entry: 200, exit: 220, peak: 230, result: 'SESSION_EXIT', pnlPerUnit: 20,
    money: { current: 6000, stress0_5: 5800, stress1_0: 5600 } };
  const result = { methodology: { capital: 60000, lotSize: 65 }, sessions: [{ date: '2026-09-08', status: 'PROCESSED' }],
    variants: { RETEST15_TRAIL_5_AFTER_BE_10: { trades: [trade] } } };
  const session = compactProfitOnlyPaperSession(result, '2026-09-08', '2026-09-08T10:01:00Z');
  assert.equal(session.status, 'TRADE');
  assert.equal(session.strategies.RETEST15_TRAIL_5_AFTER_BE_10.amountInvested, 52000);
  assert.equal(session.strategies.RETEST15_TRAIL_5_AFTER_BE_10.stress1_0NetPnl, 5600);
  assert.equal(Object.keys(session.strategies).length, 4);
  const journal = upsertProfitOnlyPaperJournal({ sessions: [] }, session);
  assert.equal(journal.meta.excludedFromV2V11Totals, true);
  assert.equal(journal.sessions.length, 1);
});
