import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePaperRiskFamilies, PAPER_RISK_PAIRS } from '../research/compare-nifty-180-paper-risk-families.mjs';

function trade(date, entry, pnl, symbol = 'NIFTY-CALL') {
  const costs = (netPnl) => ({ netPnl });
  return {
    date, entry, entryTime: `${date}T09:32:00+05:30`, signalTime: `${date}T09:31:00+05:30`,
    contract: { symbol }, grossPnlRupees: pnl + 10,
    costs: { normalized: costs(pnl), stress0_5: costs(pnl - 5), stress1_0: costs(pnl - 10) },
  };
}

test('compares each live policy and a causally identical common-entry cohort', () => {
  const variants = {};
  for (const pair of PAPER_RISK_PAIRS) {
    variants[pair.wide] = { trades: [trade('2026-01-02', 165, 50), trade('2026-01-05', 180, -20), trade('2026-01-06', 215, 30)] };
    variants[pair.narrow] = { trades: [trade('2026-01-05', 180, 40)] };
  }
  const report = comparePaperRiskFamilies({ strategy: 'nifty-180-entry-relative-risk', period: { startDate: '2026-01-01', endDate: '2026-08-31' }, variants });
  assert.equal(report.integrity, 'PASS');
  assert.equal(report.pairs.continuous.livePolicy.wide.summary.trades, 3);
  assert.equal(report.pairs.continuous.livePolicy.narrow.summary.trades, 1);
  assert.equal(report.pairs.continuous.commonEntryCohort.wide.summary.trades, 1);
  assert.equal(report.pairs.continuous.commonEntryCohort.normalizedPnlDifferenceNarrowMinusWide, 60);
});

test('rejects a nominally paired cohort with different executable fills', () => {
  const variants = {};
  for (const pair of PAPER_RISK_PAIRS) {
    variants[pair.wide] = { trades: [trade('2026-01-05', 180, 10)] };
    variants[pair.narrow] = { trades: [trade('2026-01-05', 181, 10)] };
  }
  assert.throws(() => comparePaperRiskFamilies({ strategy: 'nifty-180-entry-relative-risk', variants }), /paired entry mismatch/);
});
