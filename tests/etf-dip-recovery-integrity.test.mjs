import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectResult } from '../research/etf-dip-recovery-integrity.mjs';

function validResult() {
  const trade = {
    date: '2026-06-01', symbol: 'GOLDETF', category: 'GOLD', entryPrice: 100,
    dayReturnPct: -1.2, thirtyDayReturnPct: -3.5, volumeToEntry: 600_000,
    targetPrice: 107, status: 'OPEN', exitDate: null, exitPrice: null, sessionsToTarget: null,
  };
  return {
    schemaVersion: 1,
    period: { startDate: '2026-05-28', endDate: '2026-08-27', sessions: 63 },
    rules: { dailyDropPct: -1, maxThirtyDayReturnPct: -2.5, minVolume: 500_000, targetReturnPct: 7, exit: 'limit target; no stop and no forced exit' },
    universe: { instruments: 100 },
    dataQuality: { successfulSymbols: 100 },
    selections: [{ date: '2026-06-01', status: 'SELECTED' }],
    trades: [trade],
    summary: { trades: 1, targets: 0, open: 1 },
  };
}

test('integrity passes a frozen-rule result with a truthful open position', () => {
  assert.equal(inspectResult(validResult()).status, 'PASS');
});

test('integrity rejects an open position relabelled as an exit', () => {
  const result = validResult();
  result.trades[0].exitDate = '2026-08-27';
  const integrity = inspectResult(result);
  assert.equal(integrity.status, 'FAIL');
  assert.equal(integrity.checks.find((item) => item.name === 'open_positions_not_relabelled').pass, false);
});

test('integrity rejects an unclassified selected ETF', () => {
  const result = validResult();
  result.trades[0].category = 'UNCLASSIFIED:MYSTERY';
  assert.equal(inspectResult(result).status, 'FAIL');
});
