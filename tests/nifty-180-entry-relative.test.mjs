import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTRY_RELATIVE_RULES,
  ENTRY_RELATIVE_VARIANTS,
  evaluateEntryRelativePosition,
} from '../research/nifty-180-entry-relative.mjs';
import { validateEntryRelativeResult } from '../research/nifty-180-entry-relative-integrity.mjs';
import { evaluateEntryRelativeGate } from '../research/nifty-180-entry-relative-gate.mjs';

const bar = (clock, open, high, low, close) => ({
  timestamp: `2026-08-25T${clock}:00+05:30`, open, high, low, close, volume: 1,
});
const variant = (id) => ENTRY_RELATIVE_VARIANTS.find((row) => row.id === id);

test('fixed 160/220 control preserves the current exact levels', () => {
  const candles = [
    bar('09:30', 180, 190, 178, 185),
    bar('09:31', 182, 225, 175, 215),
  ];
  const result = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('FIXED_160_220') });
  assert.equal(result.entry, 182);
  assert.equal(result.initialStop, 160);
  assert.equal(result.target, 220);
  assert.equal(result.exit, 220);
  assert.equal(result.result, 'TARGET');
});

test('fixed 170/210 comparator uses exact levels and stop-first ambiguity', () => {
  const candles = [
    bar('09:30', 180, 190, 178, 185),
    bar('09:31', 182, 215, 168, 205),
  ];
  const result = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('FIXED_170_210') });
  assert.equal(result.entry, 182);
  assert.equal(result.initialStop, 170);
  assert.equal(result.target, 210);
  assert.equal(result.exit, 170);
  assert.equal(result.result, 'INITIAL_STOP');
});

test('fixed 170/210 comparator rejects an entry outside its stop-target band', () => {
  const candles = [bar('09:30', 180, 190, 178, 185), bar('09:31', 212, 215, 205, 210)];
  const result = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('FIXED_170_210') });
  assert.equal(result.rejected, true);
  assert.match(result.reason, /170-210/);
});

test('stop and fixed 2R target are derived from the executable entry', () => {
  const candles = [
    bar('09:30', 180, 190, 178, 185),
    bar('09:31', 202.15, 210, 195, 208),
    bar('09:32', 210, 245, 205, 240),
  ];
  const result = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('RELATIVE_FIXED_2R') });
  assert.equal(result.entry, 202.15);
  assert.equal(result.initialStop, 182.15);
  assert.equal(result.target, 242.15);
  assert.equal(result.exit, 242.15);
  assert.equal(result.result, 'TARGET');
});

test('same-bar stop and target ambiguity resolves stop-first', () => {
  const candles = [
    bar('09:30', 180, 190, 178, 185),
    bar('09:31', 200, 245, 175, 230),
  ];
  const result = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('RELATIVE_FIXED_2R') });
  assert.equal(result.initialStop, 180);
  assert.equal(result.target, 240);
  assert.equal(result.exit, 180);
  assert.equal(result.result, 'INITIAL_STOP');
});

test('continuous trail activates at entry plus 40 and is effective next bar', () => {
  const candles = [
    bar('09:30', 180, 190, 178, 185),
    bar('09:31', 200, 205, 195, 204),
    bar('09:32', 205, 242, 181, 238),
    bar('09:33', 230, 231, 220, 221),
  ];
  const result = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('RELATIVE_CONTINUOUS') });
  assert.equal(result.initialStop, 180);
  assert.equal(result.target, 240);
  assert.equal(result.exit, 222);
  assert.equal(result.exitTime, candles[3].timestamp);
  assert.equal(result.result, 'TRAIL_STOP');
});

test('five-point stepped trail ratchets from the entry-relative floor', () => {
  const candles = [
    bar('09:30', 180, 190, 178, 185),
    bar('09:31', 200, 216, 195, 214),
    bar('09:32', 210, 211, 194, 195),
  ];
  const result = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('RELATIVE_STEP_5') });
  assert.equal(result.initialStop, 180);
  assert.equal(result.finalStop, 195);
  assert.equal(result.exit, 195);
  assert.equal(result.result, 'TRAIL_STOP');
});

test('paper V2 and V9 use their exact 160/220 and 170/210 continuous rules', () => {
  const candles = [
    bar('09:30', 180, 190, 178, 185),
    bar('09:31', 182, 209, 175, 205),
    bar('09:32', 205, 214, 180, 212),
    bar('09:33', 193, 195, 188, 190),
  ];
  const v2 = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('PAPER_160_V2') });
  const v9 = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('PAPER_170_V9') });
  assert.equal(v2.initialStop, 160);
  assert.equal(v2.trailActivated, false);
  assert.equal(v9.initialStop, 170);
  assert.equal(v9.finalStop, 194);
  assert.equal(v9.exit, 193);
  assert.equal(v9.result, 'TRAIL_STOP');
});

test('paper V10 variants preserve V3 entry-anchored stepping with a 170 stop floor', () => {
  const candles = [
    bar('09:30', 180, 190, 178, 185),
    bar('09:31', 180, 196, 175, 195),
    bar('09:32', 174, 176, 169, 170),
  ];
  const v105 = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('PAPER_170_V10_5') });
  const v1010 = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('PAPER_170_V10_10') });
  assert.equal(v105.finalStop, 175);
  assert.equal(v105.exit, 174);
  assert.equal(v1010.finalStop, 170);
  assert.equal(v1010.exit, 170);
});

test('paper V6 and V11 compare fixed 2R from their absolute stops', () => {
  const candles = [bar('09:30', 180, 190, 178, 185), bar('09:31', 182, 230, 175, 220)];
  const v6 = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('PAPER_160_V6') });
  const v11 = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('PAPER_170_V11') });
  assert.equal(v6.target, 226);
  assert.equal(v6.result, 'TARGET');
  assert.equal(v11.target, 206);
  assert.equal(v11.result, 'TARGET');
});

test('frozen eligibility band remains separate from relative risk geometry', () => {
  const candles = [bar('09:30', 180, 190, 178, 185), bar('09:31', 220, 221, 210, 215)];
  const result = evaluateEntryRelativePosition(candles, candles[0], { variant: variant('RELATIVE_FIXED_2R') });
  assert.equal(result.rejected, true);
  assert.match(result.reason, /eligibility band/);
  assert.equal(ENTRY_RELATIVE_RULES.initialRiskPoints, 20);
  assert.equal(ENTRY_RELATIVE_RULES.rewardPoints, 40);
});

test('integrity rejects a fixed stop masquerading as entry-relative risk', () => {
  const emptyVariants = Object.fromEntries(ENTRY_RELATIVE_VARIANTS.map((row) => [row.id, { trades: [] }]));
  emptyVariants.RELATIVE_FIXED_2R.trades.push({
    date: '2026-08-25', signalTime: '2026-08-25T09:30:00+05:30', entryTime: '2026-08-25T09:31:00+05:30',
    exitTime: '2026-08-25T09:32:00+05:30', entry: 202.15, initialStop: 160, target: 242.15,
    stopHistory: [{ stop: 160 }],
    costs: { normalized: { netPnl: -1 }, stress0_5: { netPnl: -2 }, stress1_0: { netPnl: -3 } },
  });
  const report = validateEntryRelativeResult({ strategy: 'nifty-180-entry-relative-risk', variants: emptyVariants });
  assert.equal(report.valid, false);
  assert(report.errors.some((error) => error.includes('frozen rule')));
});

test('discovery gate cannot promote entry-relative variants automatically', () => {
  const variants = Object.fromEntries(ENTRY_RELATIVE_VARIANTS.map((row) => [row.id, {
    label: row.label,
    trades: [],
    summary: { totalNetPnlRupees: 0, totalNetPnlStress0_5: 0, totalNetPnlStress1_0: 0 },
  }]));
  const gate = evaluateEntryRelativeGate({ strategy: 'nifty-180-entry-relative-risk', variants });
  assert.equal(gate.decision, 'RESEARCH_GATE_FAIL');
  assert.equal(gate.automaticPromotion, false);
  assert.deepEqual(gate.passingVariants, []);
});
