import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMomentumPosition } from '../research/nifty-180-momentum-trail.mjs';
import { evaluateSteppedMomentumPosition } from '../research/nifty-180-stepped-trail.mjs';
import { moneyScenarios } from '../research/groww-backtest-nifty-180-hybrids.mjs';
import {
  HYBRID_STRATEGIES,
  HYBRID_VARIANTS,
  choosePrimaryBackup,
  classifyHybridEntry,
  evaluateHybridPosition,
  niftyReferenceRange,
  recoverySignal,
} from '../research/nifty-180-hybrid-strategies.mjs';

const bar = (time, open, close, high = Math.max(open, close) + 1, low = Math.min(open, close) - 1) => ({
  timestamp: `2026-01-05T${time}:00+05:30`,
  open,
  high,
  low,
  close,
  volume: 1000,
});

const call = { symbol: 'NSE-NIFTY-08JAN26-24000-CE', optionType: 'CE', premium: 178 };
const put = { symbol: 'NSE-NIFTY-08JAN26-24500-PE', optionType: 'PE', premium: 190 };
const s1 = HYBRID_STRATEGIES.find((row) => row.key === 'S1');
const s2 = HYBRID_STRATEGIES.find((row) => row.key === 'S2');
const s3 = HYBRID_STRATEGIES.find((row) => row.key === 'S3');
const v2 = HYBRID_VARIANTS.find((row) => row.key === 'V2');
const v35 = HYBRID_VARIANTS.find((row) => row.key === 'V3_5');

function niftyRangeCandles() {
  return [
    bar('09:25', 95, 96, 98, 94),
    bar('09:26', 96, 97, 99, 95),
    bar('09:27', 97, 96, 100, 95),
    bar('09:28', 96, 95, 98, 93),
    bar('09:29', 95, 96, 99, 92),
  ];
}

test('primary is the single contract closest to 180 and backup is opposite side', () => {
  const chosen = choosePrimaryBackup(call, put);
  assert.equal(chosen.primary.symbol, call.symbol);
  assert.equal(chosen.backup.symbol, put.symbol);
});

test('S1 recovers an earlier old-rule backup crossing when primary has not qualified yet', () => {
  const callCandles = [bar('09:25', 178, 178), bar('09:30', 179, 179), bar('09:31', 179, 179), bar('09:32', 180, 181), bar('09:33', 182, 183)];
  const putCandles = [bar('09:25', 190, 179), bar('09:30', 179, 179), bar('09:31', 179, 183), bar('09:32', 184, 185)];
  const signal = recoverySignal({ primary: call, backup: put, primaryCandles: callCandles, backupCandles: putCandles });
  assert.equal(signal.source, 'BACKUP');
  assert.equal(signal.signal.timestamp, '2026-01-05T09:31:00+05:30');
});

test('Primary wins a same-minute S1 tie', () => {
  const callCandles = [bar('09:25', 178, 178), bar('09:30', 179, 179), bar('09:31', 180, 183), bar('09:32', 184, 185)];
  const putCandles = [bar('09:25', 190, 179), bar('09:30', 179, 179), bar('09:31', 179, 184), bar('09:32', 185, 186)];
  const signal = recoverySignal({ primary: call, backup: put, primaryCandles: callCandles, backupCandles: putCandles });
  assert.equal(signal.source, 'PRIMARY');
  assert.equal(signal.side, 'CE');
});

test('S1 and S2 have identical entry classification', () => {
  const callCandles = [bar('09:25', 178, 178), bar('09:30', 181, 182), bar('09:31', 184, 185)];
  const putCandles = [bar('09:25', 190, 179), bar('09:30', 179, 179), bar('09:31', 179, 181), bar('09:32', 182, 183)];
  const args = { callSelection: call, putSelection: put, callCandles, putCandles };
  const a = classifyHybridEntry({ strategy: s1, ...args });
  const b = classifyHybridEntry({ strategy: s2, ...args });
  assert.equal(a.status, 'SIGNAL');
  assert.equal(b.status, 'SIGNAL');
  assert.equal(a.source, b.source);
  assert.equal(a.signal.timestamp, b.signal.timestamp);
  assert.equal(a.entryTime, b.entryTime);
  assert.equal(a.entry, b.entry);
});

test('S2 fail-fast exits next bar open after an unestablished close back below 180', () => {
  const candles = [
    bar('09:30', 181, 182),
    bar('09:31', 185, 184, 187, 181),
    bar('09:32', 184, 178, 186, 170),
    bar('09:33', 177, 179, 181, 175),
  ];
  const result = evaluateHybridPosition(candles, candles[0], v2, { failFast: true });
  assert.equal(result.result, 'FAILED_BREAKOUT_EXIT');
  assert.equal(result.exitTime, '2026-01-05T09:33:00+05:30');
  assert.equal(result.exit, 177);
});

test('S3 waits for NIFTY direction confirmation after the option is armed', () => {
  const callCandles = [bar('09:25', 178, 178), bar('09:30', 181, 183), bar('09:31', 184, 185), bar('09:32', 186, 187)];
  const putCandles = [bar('09:25', 190, 190), bar('09:30', 189, 188), bar('09:31', 188, 187), bar('09:32', 187, 186)];
  const niftyCandles = [...niftyRangeCandles(), bar('09:30', 99, 99, 100, 98), bar('09:31', 100, 101, 102, 99), bar('09:32', 101, 102, 103, 100)];
  const result = classifyHybridEntry({ strategy: s3, callSelection: call, putSelection: put, callCandles, putCandles, niftyCandles });
  assert.equal(result.status, 'SIGNAL');
  assert.equal(result.signal.timestamp, '2026-01-05T09:31:00+05:30');
  assert.equal(result.niftySignal.timestamp, '2026-01-05T09:31:00+05:30');
  assert.equal(result.entryTime, '2026-01-05T09:32:00+05:30');
});

test('S3 refuses incomplete 09:25-09:29 NIFTY range data', () => {
  const incomplete = niftyRangeCandles().slice(0, 4);
  assert.equal(niftyReferenceRange(incomplete), null);
  const callCandles = [bar('09:25', 178, 178), bar('09:30', 181, 183), bar('09:31', 184, 185)];
  const putCandles = [bar('09:25', 190, 190), bar('09:30', 189, 188), bar('09:31', 188, 187)];
  const result = classifyHybridEntry({ strategy: s3, callSelection: call, putSelection: put, callCandles, putCandles, niftyCandles: incomplete });
  assert.equal(result.status, 'DATA_MISSING');
});

test('S1 generic V2 evaluator preserves existing V2 P&L path when fail-fast is disabled', () => {
  const candles = [
    bar('09:30', 181, 182),
    bar('09:31', 185, 186, 188, 183),
    bar('09:32', 190, 210, 215, 189),
    bar('09:33', 212, 222, 225, 210),
    bar('09:34', 223, 224, 226, 204),
  ];
  const expected = evaluateMomentumPosition(candles, candles[0], { trailGapPoints: 20 });
  const actual = evaluateHybridPosition(candles, candles[0], v2, { failFast: false });
  for (const key of ['entry', 'exit', 'exitTime', 'result', 'finalStop', 'pnlPerUnit']) assert.equal(actual[key], expected[key]);
});

test('S1 generic stepped evaluator preserves existing stepped P&L path when fail-fast is disabled', () => {
  const candles = [
    bar('09:30', 181, 182),
    bar('09:31', 185, 186, 188, 183),
    bar('09:32', 190, 194, 196, 189),
    bar('09:33', 195, 201, 202, 194),
    bar('09:34', 199, 200, 201, 180),
  ];
  const expected = evaluateSteppedMomentumPosition(candles, candles[0], { trailStepPoints: 5, trailGapPoints: 20 });
  const actual = evaluateHybridPosition(candles, candles[0], v35, { failFast: false });
  for (const key of ['entry', 'exit', 'exitTime', 'result', 'finalStop', 'pnlPerUnit']) assert.equal(actual[key], expected[key]);
});

test('risk layer reports one-lot feasibility separately from max-affordable sizing', () => {
  const position = { entry: 178, exit: 190, pnlPerUnit: 12 };
  const money = moneyScenarios(position, '2026-01-05', 65);
  assert.equal(money.initialRiskPerLot, 1170);
  assert.equal(money.oneLot.lots, 1);
  assert.ok(money.affordable.lots > 1);
  assert.equal(money.risk1Pct, null);
  assert.equal(money.risk2Pct.lots, 1);
});
