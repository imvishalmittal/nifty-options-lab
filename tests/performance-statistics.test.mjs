import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maxDrawdown,
  longestLosingStreak,
  summarizePerformance,
  clusterBootstrapMean,
  robustnessReport,
} from '../research/performance-statistics.mjs';

test('max drawdown is measured from cumulative equity peak', () => {
  const result = maxDrawdown([1, 2, -1, -4, 2]);
  assert.equal(result.maxDrawdown, 5);
  assert.equal(result.peakIndex, 1);
  assert.equal(result.troughIndex, 3);
});

test('losing streak reports both length and cumulative streak damage', () => {
  const result = longestLosingStreak([1, -1, -2, -3, 2, -4]);
  assert.equal(result.longestLosingStreak, 3);
  assert.equal(result.worstStreakLoss, -6);
});

test('performance summary does not let win rate stand in for expectancy', () => {
  const result = summarizePerformance([1, 1, 1, 1, -10]);
  assert.equal(result.winRate, 0.8);
  assert.equal(result.total, -6);
  assert.equal(result.mean, -1.2);
  assert.ok(result.profitFactor < 1);
});

test('cluster bootstrap treats same-session trades as one resampling unit', () => {
  const trades = [
    { date: '2026-01-01', r: 1 },
    { date: '2026-01-01', r: 1 },
    { date: '2026-01-02', r: -1 },
    { date: '2026-01-03', r: 2 },
  ];
  const result = clusterBootstrapMean(trades, {
    value: (t) => t.r,
    cluster: (t) => t.date,
    samples: 1000,
    seed: 42,
  });
  assert.equal(result.clusters, 3);
  assert.equal(result.observations, 4);
  assert.equal(result.mean, 0.75);
  assert.ok(result.lower <= result.mean);
  assert.ok(result.upper >= result.mean);
});

test('robustness report combines path risk and clustered uncertainty', () => {
  const trades = [
    { date: '2026-01-01', pnl: 100 },
    { date: '2026-01-02', pnl: -50 },
    { date: '2026-01-03', pnl: 25 },
  ];
  const result = robustnessReport(trades, {
    value: (t) => t.pnl,
    cluster: (t) => t.date,
    bootstrapSamples: 500,
    seed: 7,
  });
  assert.equal(result.performance.total, 75);
  assert.equal(result.clusteredMeanConfidence.clusters, 3);
});
