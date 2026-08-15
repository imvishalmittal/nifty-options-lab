import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRobustnessReport,
  reportUnderlyingTrades,
  reportOptionResults,
} from '../research/strategy-robustness-report.mjs';

const underlyingTrades = [
  { date: '2026-01-02', symbol: 'AAA', direction: 'LONG', realizedR: 1 },
  { date: '2026-01-02', symbol: 'BBB', direction: 'SHORT', realizedR: -0.5 },
  { date: '2026-01-03', symbol: 'AAA', direction: 'LONG', realizedR: 2 },
  { date: '2026-02-02', symbol: 'BBB', direction: 'LONG', realizedR: -1 },
];

test('underlying report clusters uncertainty by session and shows symbol concentration', () => {
  const report = reportUnderlyingTrades(underlyingTrades, { bootstrapSamples: 500 });
  assert.equal(report.observations, 4);
  assert.equal(report.robustness.clusteredMeanConfidence.clusters, 3);
  assert.equal(report.byMonth['2026-01'].count, 3);
  assert.equal(report.bySymbol.AAA.total, 3);
  assert.ok(report.symbolContribution.topAbsoluteContributionShare > 0);
});

test('option report separates gross, costs and slippage scenarios', () => {
  const rows = [
    {
      date: '2026-08-10', status: 'TRADE', side: 'CE', grossPnlRupees: 1000,
      costs: {
        currentGroww2026: { netPnl: 900 },
        slippageStress0_5: { netPnl: 800 },
        slippageStress1_0: { netPnl: 700 },
      },
    },
    {
      date: '2026-08-11', status: 'TRADE', side: 'PE', grossPnlRupees: -500,
      costs: {
        currentGroww2026: { netPnl: -600 },
        slippageStress0_5: { netPnl: -700 },
        slippageStress1_0: { netPnl: -800 },
      },
    },
    { date: '2026-08-12', status: 'NO_TRADE', reason: 'No crossing' },
  ];
  const report = reportOptionResults(rows, { bootstrapSamples: 500 });
  assert.equal(report.tradeSessions, 2);
  assert.equal(report.statuses.TRADE, 2);
  assert.equal(report.noTradeReasons['No crossing'], 1);
  assert.equal(report.gross.robustness.performance.total, 500);
  assert.equal(report.currentCosts.robustness.performance.total, 300);
  assert.equal(report.slippageStress1_0.robustness.performance.total, -100);
});

test('format detector supports Quick Flip, Stocks-in-Play and option-session payloads', () => {
  const quickFlip = buildRobustnessReport({ trades: underlyingTrades }, { bootstrapSamples: 100 });
  assert.equal(quickFlip.type, 'UNDERLYING_TRADES');

  const variants = buildRobustnessReport({
    variants: [{ key: 'rvol-1.2', minRelativeVolume: 1.2, result: { trades: underlyingTrades } }],
  }, { bootstrapSamples: 100 });
  assert.equal(variants.type, 'UNDERLYING_VARIANTS');
  assert.equal(variants.variants[0].key, 'rvol-1.2');

  const option = buildRobustnessReport({
    results: [{ date: '2026-08-10', status: 'NO_TRADE', reason: 'No crossing' }],
  }, { bootstrapSamples: 100 });
  assert.equal(option.type, 'OPTION_SESSIONS');
});
