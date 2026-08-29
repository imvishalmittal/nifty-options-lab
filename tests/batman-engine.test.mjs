import test from 'node:test';
import assert from 'node:assert/strict';
import { BATMAN_RULES, evaluateBatmanPosition, selectBatmanContracts, summarizeBatmanResults } from '../research/batman/engine.mjs';

function symbol(strike, type) { return `NSE-NIFTY-30Sep25-${strike}-${type}`; }

test('selects ordered symmetric six-leg defined-risk Batman structure', () => {
  const contracts = [];
  for (let strike = 19000; strike <= 21000; strike += 50) for (const type of ['CE', 'PE']) contracts.push(symbol(strike, type));
  const selected = selectBatmanContracts(contracts, 20000, BATMAN_RULES);
  assert.deepEqual([selected.innerCall.strike, selected.bodyCall.strike, selected.outerCall.strike], [20200, 20400, 20600]);
  assert.deepEqual([selected.innerPut.strike, selected.bodyPut.strike, selected.outerPut.strike], [19800, 19600, 19400]);
  assert.equal(selected.bodyCall.quantity, 2);
});

test('six-leg costs can turn a flat gross result into a net loss', () => {
  const selection = selectBatmanContracts(Array.from({ length: 82 }, (_, index) => {
    const strike = 19000 + Math.floor(index / 2) * 50; return symbol(strike, index % 2 ? 'PE' : 'CE');
  }), 20000);
  const entryQuotes = Object.fromEntries(Object.keys(selection).map((name) => [name, 10]));
  const result = evaluateBatmanPosition({ selection, entryQuotes, exitQuotes: entryQuotes, lotSize: 75, tradeDate: '2025-08-06' });
  assert.equal(result.status, 'TRADE');
  assert.equal(result.grossPnlRupees, 0);
  assert.ok(result.netPnlRupees < 0);
});

test('summary reports win probability separately from expectancy', () => {
  const summary = summarizeBatmanResults([{ status: 'TRADE', costs: { normalized: { netPnlRupees: 100 }, stress0_5: { netPnlRupees: 50 }, stress1_0: { netPnlRupees: -20 } } }, { status: 'TRADE', costs: { normalized: { netPnlRupees: -300 }, stress0_5: { netPnlRupees: -350 }, stress1_0: { netPnlRupees: -400 } } }]);
  assert.equal(summary.normalized.winRate, 0.5);
  assert.equal(summary.normalized.expectancyRupees, -100);
});
