import test from 'node:test';
import assert from 'node:assert/strict';
import { openingRangeSignal, retestSignal, regimeAlignedSignal, selectItmContract, evaluateImmediateBreakeven } from '../research/profit-only-directional-engine.mjs';

const c = (time, open, high, low, close, volume = 1) => ({ timestamp: `2026-01-02T${time}:00+05:30`, open, high, low, close, volume });
const opening = [c('09:15',100,103,99,102),c('09:20',102,104,101,103),c('09:25',103,105,102,104)];

test('opening-range breakout supports CE and PE directions', () => {
  assert.equal(openingRangeSignal([...opening,c('09:30',104,107,103,106)]).direction, 'UP');
  assert.equal(openingRangeSignal([...opening,c('09:30',104,105,97,98)]).direction, 'DOWN');
});

test('retest waits for a later completed holding candle', () => {
  const rows=[...opening,c('09:30',104,108,104,107),c('09:35',107,108,104,106)];
  assert.equal(retestSignal(rows).signal.timestamp, rows.at(-1).timestamp);
});

test('regime filter aligns direction with prior fifty-session SMA', () => {
  const prior=Array.from({length:50},(_,i)=>90+i/5);
  assert.equal(regimeAlignedSignal([...opening,c('09:30',104,107,103,106)],prior).direction,'UP');
  assert.equal(regimeAlignedSignal([...opening,c('09:30',104,105,97,98)],prior),null);
});

test('200-point ITM selection is independent of option premium', () => {
  const contracts=[{optionType:'CE',strike:23800},{optionType:'CE',strike:23900},{optionType:'PE',strike:24200}];
  assert.equal(selectItmContract(contracts,24000,'UP').strike,23800);
  assert.equal(selectItmContract(contracts,24000,'DOWN').strike,24200);
});

test('entry is signal option close and breakeven starts next bar', () => {
  const rows=[c('09:30',175,185,174,179),c('09:35',179,181,178,180)];
  const result=evaluateImmediateBreakeven(rows,rows[0].timestamp);
  assert.equal(result.entry,179); assert.equal(result.exit,179); assert.equal(result.result,'BREAKEVEN_STOP');
});

test('confirmation breakeven starts at signal low and moves after ten points', () => {
  const rows=[c('09:30',175,185,174,179),c('09:35',179,190,176,188),c('09:40',188,189,178,181)];
  const result=evaluateImmediateBreakeven(rows,rows[0].timestamp,'CONFIRM_BE_10');
  assert.equal(result.exit,179); assert.equal(result.result,'BREAKEVEN_STOP');
});

test('five-point trail ratchets only after completed favorable candles', () => {
  const rows=[c('09:30',195,202,190,200),c('09:35',200,215,198,213),c('09:40',210,211,204,206)];
  const result=evaluateImmediateBreakeven(rows,rows[0].timestamp,'TRAIL_5_AFTER_BE_10');
  assert.equal(result.exit,205);
  assert.equal(result.result,'TRAILING_STOP');
});

test('ten-point trail retains a wider ratchet between milestones', () => {
  const rows=[c('09:30',195,202,190,200),c('09:35',200,220,198,218),c('09:40',215,216,209,211)];
  const result=evaluateImmediateBreakeven(rows,rows[0].timestamp,'TRAIL_10_AFTER_BE_10');
  assert.equal(result.exit,210);
  assert.equal(result.result,'TRAILING_STOP');
});
