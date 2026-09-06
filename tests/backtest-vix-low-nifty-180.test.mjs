import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLowVixFilter } from '../research/backtest-vix-low-nifty-180.mjs';

function vixRowsThrough(dateCount) {
  const rows = [];
  const start = new Date('2019-01-01T00:00:00Z');
  for (let index = 0; index < dateCount; index += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    rows.push({ date: day.toISOString().slice(0, 10), close: index + 1 });
  }
  return rows;
}

test('O1 keeps only sessions whose prior VIX percentile is at or below 50', () => {
  const source = {
    methodology: { strategy: 'fixture' },
    period: { startDate: '2019-09-11', endDate: '2019-09-12' },
    sessionLedger: [
      { date: '2019-09-11', status: 'TRADE' },
      { date: '2019-09-12', status: 'TRADE' },
    ],
    variants: {
      V2: {
        trades: [
          { date: '2019-09-11', money: { current: { netPnl: 100 }, stress0_5: { netPnl: 50 }, stress1_0: { netPnl: 0 } } },
          { date: '2019-09-12', money: { current: { netPnl: -40 }, stress0_5: { netPnl: -60 }, stress1_0: { netPnl: -80 } } },
        ],
      },
      V3_10: {
        trades: [
          { date: '2019-09-11', money: { current: { netPnl: 120 }, stress0_5: { netPnl: 80 }, stress1_0: { netPnl: 40 } } },
          { date: '2019-09-12', money: { current: { netPnl: -30 }, stress0_5: { netPnl: -50 }, stress1_0: { netPnl: -70 } } },
        ],
      },
    },
  };
  const rows = vixRowsThrough(254);
  rows[252].close = 1;
  rows[253].close = 253;

  const result = applyLowVixFilter(source, rows);

  assert.equal(result.sessionCounts.source, 2);
  assert.equal(result.sessionCounts.retained, 1);
  assert.equal(result.filteredSessions[0].filterStatus, 'TRADE');
  assert.equal(result.filteredSessions[1].filterStatus, 'VIX_FILTERED');
  assert.equal(result.variants.V2.summary.current.trades, 1);
  assert.equal(result.variants.V2.summary.current.totalNetPnl, 100);
  assert.equal(result.variants.V3_10.summary.stress1_0.totalNetPnl, 40);
});

test('O1 treats insufficient VIX history as filtered, not as a no-trade', () => {
  const source = {
    methodology: {},
    period: { startDate: '2020-01-01', endDate: '2020-01-01' },
    sessionLedger: [{ date: '2020-01-01', status: 'TRADE' }],
    variants: { V2: { trades: [{ date: '2020-01-01', money: { current: { netPnl: 10 }, stress0_5: { netPnl: 9 }, stress1_0: { netPnl: 8 } } }] }, V3_10: { trades: [] } },
  };
  const result = applyLowVixFilter(source, [{ date: '2019-12-31', close: 15 }]);
  assert.equal(result.sessionCounts.regimes.INSUFFICIENT_HISTORY, 1);
  assert.equal(result.filteredSessions[0].filterStatus, 'VIX_FILTERED');
  assert.equal(result.variants.V2.summary.current.trades, 0);
});
