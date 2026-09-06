import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseStrategyArtifact } from '../research/artifact-strategy-diagnostics.mjs';

function trade(date, pnl, extras = {}) {
  return {
    date,
    status: 'TRADE',
    exitReason: extras.exitReason ?? 'TIME',
    entryCredit: extras.entryCredit,
    selection: extras.selection,
    costs: { normalized: { netPnl: pnl } },
  };
}

test('reports win/loss economics, tails, years and descriptive bins', () => {
  const selection = {
    shortCall: { impliedVolatility: 0.2 },
    shortPut: { impliedVolatility: 0.3 },
  };
  const report = diagnoseStrategyArtifact({
    strategy: 'example',
    results: [
      trade('2023-01-01', 100, { entryCredit: 20, selection, exitReason: 'TARGET' }),
      trade('2023-01-02', 50, { entryCredit: 20, selection, exitReason: 'TARGET' }),
      trade('2024-01-01', -300, { entryCredit: 8, selection, exitReason: 'STOP' }),
      { date: '2024-01-02', status: 'NO_TRADE' },
    ],
  });

  assert.equal(report.generatedFromTradeRows, 3);
  assert.deepEqual(report.overall, {
    trades: 3,
    winners: 2,
    losers: 1,
    winRatePct: 66.67,
    netPnl: -150,
    grossProfit: 150,
    grossLoss: 300,
    profitFactor: 0.5,
    averageWinner: 75,
    averageLoser: -300,
    payoffRatio: 0.25,
    medianPnl: 50,
    p05Pnl: -265,
    p95Pnl: 95,
    bestTrade: 100,
    worstTrade: -300,
  });
  assert.equal(report.byYear['2023'].netPnl, 150);
  assert.equal(report.byYear['2024'].netPnl, -300);
  assert.equal(report.tailLossConcentration.worst5.lossSharePct, 100);
  assert.equal(report.exitReasons.TARGET, 2);
  assert.equal(report.descriptiveOnly.byEntryCredit['15–25'].trades, 2);
  assert.equal(report.descriptiveOnly.byAverageShortIv['0.20–0.30'].trades, 3);
});

test('selects a requested cost scenario and ignores malformed rows', () => {
  const report = diagnoseStrategyArtifact({
    results: [
      { date: '2024-01-01', status: 'TRADE', costs: { normalized: { netPnl: 5 }, stress1_0: { netPnl: -2 } } },
      { date: '2024-01-02', status: 'TRADE', costs: {} },
      null,
    ],
  }, 'stress1_0');
  assert.equal(report.generatedFromTradeRows, 1);
  assert.equal(report.overall.netPnl, -2);
});
