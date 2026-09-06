import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHighVixOpeningRangeFilter } from '../research/backtest-vix-high-opening-range-credit.mjs';

function rows(count) {
  const output = [];
  const start = new Date('2019-01-01T00:00:00Z');
  for (let index = 0; index < count; index += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    output.push({ date: day.toISOString().slice(0, 10), close: index + 1 });
  }
  return output;
}

test('C3 keeps opening-range trades only when prior VIX percentile is at or above 50', () => {
  const vixRows = rows(254);
  vixRows[252].close = 253;
  vixRows[253].close = 1;
  const document = {
    schemaVersion: 1,
    strategy: 'opening-range-atm-credit-spread',
    period: { startDate: '2019-09-11', endDate: '2019-09-12' },
    rules: {},
    results: [
      { date: '2019-09-11', status: 'TRADE', signal: { status: 'SIGNAL' }, exitReason: 'TARGET', costs: { normalized: { netPnl: 100 }, stress0_5: { netPnl: 80 }, stress1_0: { netPnl: 60 } } },
      { date: '2019-09-12', status: 'TRADE', signal: { status: 'SIGNAL' }, exitReason: 'STOP', costs: { normalized: { netPnl: -40 }, stress0_5: { netPnl: -60 }, stress1_0: { netPnl: -80 } } },
    ],
  };
  const result = applyHighVixOpeningRangeFilter(document, vixRows);
  assert.equal(result.results[0].status, 'TRADE');
  assert.equal(result.results[1].status, 'VIX_FILTERED');
  assert.equal(result.summary.trades, 1);
  assert.equal(result.summary.vixFiltered, 1);
  assert.equal(result.summary.normalized.netPnl, 100);
});
