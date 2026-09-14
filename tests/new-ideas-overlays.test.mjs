import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateNewIdeaOverlays, NEW_IDEA_RULES } from '../research/new-ideas-overlays.mjs';

function trade(date, pnl, { oi = 100_000, entry = 100, lotSize = 25 } = {}) {
  return {
    date, signalTime: `${date}T10:00:00+05:30`, entry, exit: entry + pnl / 25,
    allocatedCapital: 60_000, lotSize, signalOpenInterest: oi,
    money: { current: pnl, stress0_5: pnl - 25, stress1_0: pnl - 50 },
  };
}

function document(rows) {
  return {
    period: { startDate: rows[0].date, endDate: rows.at(-1).date },
    sessions: rows.map((row) => ({ date: row.date })),
    variants: { [NEW_IDEA_RULES.hostKey]: { trades: rows } },
  };
}

test('frequency overlay enforces six accepted entries in a rolling twenty-session window', () => {
  const rows = Array.from({ length: 25 }, (_, index) => trade(`2020-01-${String(index + 1).padStart(2, '0')}`, index === 0 ? 1000 : -10));
  const result = evaluateNewIdeaOverlays(document(rows));
  assert.equal(result.candidates.IDEA2_FREQUENCY_CAP.trades.length, 11);
  assert.equal(result.candidates.IDEA2_FREQUENCY_CAP.diagnostics.skippedTrades, 14);
});

test('OI overlay measures open interest in historical lots and rejects missing OI', () => {
  const rows = [trade('2020-01-01', 100, { oi: null }), trade('2020-01-02', 100, { oi: 24_999 }), trade('2020-01-03', 100, { oi: 25_000 })];
  const result = evaluateNewIdeaOverlays(document(rows));
  const candidate = result.candidates.IDEA5_OPEN_INTEREST_FILTER;
  assert.equal(candidate.diagnostics.missingOi, 1);
  assert.equal(candidate.diagnostics.excludedBelowThreshold, 1);
  assert.equal(candidate.trades.length, 1);
});

test('throttle threshold uses profitable trades only', () => {
  const rows = Array.from({ length: 20 }, (_, index) => trade(`2020-02-${String(index + 1).padStart(2, '0')}`, index < 18 ? -10 : (index === 18 ? 100 : 1000)));
  const result = evaluateNewIdeaOverlays(document(rows));
  assert.equal(result.candidates.IDEA1_CONCENTRATION_THROTTLE.diagnostics.threshold, 910);
});
