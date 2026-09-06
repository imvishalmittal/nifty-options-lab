import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMorningTeaLiquidityGate, MORNING_TEA_LIQUIDITY_GATE } from '../research/morning-tea/liquidity-gate.mjs';

test('uses the frozen six-name universe', () => {
  assert.deepEqual(MORNING_TEA_LIQUIDITY_GATE.symbols, ['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'INFY', 'TCS']);
});

test('retains allowed symbols and skips other valid trades', () => {
  const rows = applyMorningTeaLiquidityGate([
    { status: 'TRADE', signal: { symbol: 'INFY' } },
    { status: 'TRADE', signal: { symbol: 'MARUTI' } },
    { status: 'NO_TRADE' },
  ]);
  assert.equal(rows[0].liquidityGate.status, 'LIQUIDITY_OPEN');
  assert.equal(rows[1].liquidityGate.status, 'LIQUIDITY_SKIPPED');
  assert.equal(rows[2].liquidityGate.status, 'NO_TRADE');
});
