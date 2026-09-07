import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCloseEntryTrades } from '../research/groww-backtest-nifty-180-close-entry-stops.mjs';
import { mergeCloseEntryStopShards } from '../research/merge-nifty-180-close-entry-stop-shards.mjs';
import { evaluateCloseEntryStopGates } from '../research/nifty-180-close-entry-stop-gates.mjs';

function trade(side, value, date = '2020-01-02') {
  const scenario = (netPnl) => ({ netPnl });
  return { date, side, money: { current: scenario(value), stress0_5: scenario(value - 10), stress1_0: scenario(value - 20) } };
}

test('summary reports CE, PE and combined cost scenarios', () => {
  const summary = summarizeCloseEntryTrades([trade('CE', 100), trade('PE', -50)]);
  assert.equal(summary.combined.current.totalNetPnl, 50);
  assert.equal(summary.CE.current.trades, 1);
  assert.equal(summary.PE.current.totalNetPnl, -50);
});

test('gate requires profitability through one-point stress', () => {
  const passing = { trades: 100, totalNetPnl: 1, profitFactor: 1.01 };
  const result = { study: 'x', variants: { A: { summary: { combined: { current: passing, stress0_5: passing, stress1_0: passing } } } } };
  assert.equal(evaluateCloseEntryStopGates(result).passed, true);
  result.variants.A.summary.combined.stress1_0 = { ...passing, totalNetPnl: -1, profitFactor: 0.99 };
  assert.equal(evaluateCloseEntryStopGates(result).passed, false);
});

test('merger rejects incomplete shards', () => {
  assert.throws(() => mergeCloseEntryStopShards([], '2020-01-01', '2024-12-31', 60), /Expected 60 shards/);
});

test('merger recomputes ten variant summaries', () => {
  const variants = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`V${index}`, { trades: [trade(index % 2 ? 'CE' : 'PE', 10)] }]));
  const document = (month) => ({
    period: { startDate: `2020-${month}-01` }, study: 'x', methodology: {}, sessionLedger: [],
    variants: Object.fromEntries(Object.entries(variants).map(([key, value]) => [key, { trades: value.trades.map((row) => ({ ...row, date: `2020-${month}-02` })) }])),
  });
  const merged = mergeCloseEntryStopShards([document('01'), document('02')], '2020-01-01', '2020-02-29', 2);
  assert.equal(Object.keys(merged.variants).length, 10);
  assert.equal(merged.variants.V0.summary.combined.current.trades, 2);
});
