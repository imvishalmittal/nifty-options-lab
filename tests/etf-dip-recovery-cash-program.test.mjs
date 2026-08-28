import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateCashProgram, xirr } from '../research/etf-dip-recovery-cash-program.mjs';

test('xirr returns 10% for a one-year two-cash-flow investment', () => {
  const result = xirr([
    { date: '2025-01-01', amount: -100 },
    { date: '2026-01-01', amount: 110 },
  ]);
  assert.ok(Math.abs(result - 0.10) < 1e-8);
});

test('daily funding pools cash and reinvests full sale proceeds', () => {
  const sessions = ['2025-01-02', '2025-01-03', '2025-01-06', '2025-01-07'];
  const trades = [
    {
      date: '2025-01-02', symbol: 'AAA', targetReturnPct: 10, status: 'TARGET',
      exitDate: '2025-01-06', grossReturnPct: 10,
    },
    {
      date: '2025-01-06', symbol: 'BBB', targetReturnPct: 10, status: 'TARGET',
      exitDate: '2025-01-07', grossReturnPct: 10,
    },
  ];
  const result = simulateCashProgram({
    sessions,
    trades,
    startDate: '2025-01-02',
    fundingMonths: 1,
    dailyContribution: 15_000,
  });
  assert.equal(result.totalContributed, 60_000);
  assert.equal(result.purchaseLedger[0].invested, 15_000);
  assert.equal(result.purchaseLedger[1].invested, 46_500);
  assert.equal(result.terminalValue, 66_150);
  assert.equal(result.profit, 6_150);
});
