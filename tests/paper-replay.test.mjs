import test from 'node:test';
import assert from 'node:assert/strict';

import { replayBase, replayConfirmed } from '../paper/replay-session.mjs';

const c = (clock, open, high, low, close) => ({ timestamp: `2026-08-26T${clock}:00+05:30`, open, high, low, close, volume: 1 });
const ce = { symbol: 'NSE-NIFTY-01Sep26-24350-CE', optionType: 'CE', strike: 24350, premium: 176 };
const pe = { symbol: 'NSE-NIFTY-01Sep26-24400-PE', optionType: 'PE', strike: 24400, premium: 190 };

const callCandles = [
  c('09:25', 176, 177, 175, 176), c('09:26', 176, 178, 175, 177), c('09:27', 177, 179, 176, 178),
  c('09:28', 178, 179, 177, 178), c('09:29', 178, 180, 177, 179), c('09:30', 179, 184, 178, 182),
  c('09:31', 185, 190, 180, 186), c('09:32', 158, 165, 150, 160),
];
const putCandles = [
  c('09:25', 190, 191, 189, 190), c('09:26', 189, 190, 188, 189), c('09:27', 188, 189, 187, 188),
  c('09:28', 187, 188, 186, 187), c('09:29', 186, 187, 185, 186), c('09:30', 185, 186, 184, 185),
  c('09:31', 184, 185, 183, 184), c('09:32', 183, 184, 182, 183),
];
const niftyCandles = [
  c('09:25', 24353, 24355, 24350, 24354), c('09:26', 24354, 24356, 24352, 24355),
  c('09:27', 24355, 24357, 24353, 24356), c('09:28', 24356, 24358, 24354, 24357),
  c('09:29', 24357, 24359, 24355, 24358), c('09:30', 24358, 24365, 24357, 24362),
  c('09:31', 24362, 24366, 24360, 24364), c('09:32', 24364, 24365, 24350, 24352),
];

test('base replay uses causal next-bar entry and closes every declared variant', () => {
  const result = replayBase({ date: '2026-08-26', expiry: '2026-09-01', ce, pe, callCandles, putCandles });
  assert.equal(result.status, 'CLOSED');
  assert.equal(result.signalTime, '09:30');
  assert.equal(result.entryTime, '09:31');
  assert.equal(result.entry, 185);
  assert.equal(result.trades.length, 10);
  assert.ok(result.trades.every((row) => row.source === 'PAPER_REPLAY' && row.reconstructed));
  assert.equal(result.trades.find((row) => row.strategyVersion === 'V2').exitReason, 'INITIAL_STOP');
  assert.equal(result.trades.find((row) => row.strategyVersion === 'V8').startStopLoss, 165);
  assert.equal(result.trades.find((row) => row.strategyVersion === 'V9').startStopLoss, 170);
  assert.equal(result.trades.find((row) => row.strategyVersion === 'V11').startTarget, 215);
});

test('base replay records 170/210 variants as ineligible when entry exceeds 210', () => {
  const expensive = callCandles.map((row) => row.timestamp.includes('09:31') ? { ...row, open: 211, high: 215, low: 180, close: 212 } : row);
  const result = replayBase({ date: '2026-08-26', expiry: '2026-09-01', ce, pe, callCandles: expensive, putCandles });
  assert.equal(result.status, 'CLOSED');
  assert.equal(result.trades.length, 6);
  assert.deepEqual(result.ineligibleStrategies, ['V9', 'V10_5', 'V10_10', 'V11']);
});

test('confirmed replay requires NIFTY range confirmation and uses next-bar entry', () => {
  const result = replayConfirmed({ date: '2026-08-26', expiry: '2026-09-01', ce, pe, callCandles, putCandles, niftyCandles });
  assert.equal(result.status, 'CLOSED');
  assert.equal(result.signalSource, 'PRIMARY');
  assert.equal(result.signalTime, '09:30');
  assert.equal(result.entryTime, '09:31');
  assert.equal(result.trades.length, 2);
  assert.ok(result.trades.every((row) => row.niftySignalTime === '09:30'));
});

test('replay records a genuine no-trade when no premium crosses before cutoff', () => {
  const quiet = callCandles.map((row) => ({ ...row, open: 170, high: 175, low: 165, close: 172 }));
  const quietPut = putCandles.map((row) => ({ ...row, open: 168, high: 174, low: 164, close: 171 }));
  const result = replayBase({ date: '2026-08-26', expiry: '2026-09-01', ce: { ...ce, premium: 170 }, pe: { ...pe, premium: 168 }, callCandles: quiet, putCandles: quietPut });
  assert.equal(result.status, 'NO_TRADE');
  assert.equal(result.complete, true);
  assert.equal(result.trades.length, 0);
});
