import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUnderlyingVariants } from '../research/next/underlying-result-integrity.mjs';
import { evaluateUnderlyingDiscovery, evaluateVwapDiscovery } from '../research/next/research-gates.mjs';

function trade(date, symbol, value = 1) {
  return {
    date, symbol, signalTime: `${date}T14:25:00+05:30`, entryTime: `${date}T14:30:00+05:30`, exitTime: `${date}T15:10:00+05:30`,
    quantity: 10, riskPoints: 1, stress2bpsNetR: value, stress5bpsNetR: value * 0.9,
    costs: { normalized: { netPnl: 10 }, stress2bps: { netPnl: 9 }, stress5bps: { netPnl: 8 } },
  };
}

test('underlying integrity rejects duplicate symbol/day and non-causal entry', () => {
  const row = trade('2024-01-02', 'AAA');
  const report = validateUnderlyingVariants({ variants: [{ key: 'x', result: { trades: [row, { ...row, entryTime: row.signalTime }] } }] }, { maximumTradesPerDate: 2 });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes('duplicate')));
  assert.ok(report.errors.some((error) => error.includes('non-causal')));
});

test('underlying gate never promotes automatically', () => {
  const trades = [];
  for (let index = 0; index < 120; index += 1) trades.push(trade(`${2020 + (index % 5)}-01-${String(1 + (index % 20)).padStart(2, '0')}`, `S${index % 5}`, 1));
  const report = evaluateUnderlyingDiscovery({ variants: [{ key: 'primary', primary: true, result: { trades } }] });
  assert.equal(report.automaticPromotion, false);
  assert.equal(report.decision, 'RESEARCH_GATE_PASS');
});

test('VWAP discovery gate fails when one-point stress is negative', () => {
  const results = [{ date: '2020-01-02', status: 'TRADE', costs: { stress1_0: { netPnl: -10 } } }];
  const report = evaluateVwapDiscovery({
    strategy: 'selective-vwap-trend-pullback-v2', results,
    summary: { trades: 100, profitFactorBeforeCosts: 1.3, normalizedCosts: { totalNetPnlRupees: 100 }, stress0_5: { totalNetPnlRupees: 50 }, stress1_0: { totalNetPnlRupees: -1 } },
  });
  assert.equal(report.decision, 'RESEARCH_GATE_FAIL');
});
