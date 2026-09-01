import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPER_RULES, PAPER_VARIANTS, firstSignal, initialPosition, lotsAffordable, nextBarEntry, premiumBracket, processCompletedBar, selectSide, variantEligible } from '../paper/paper-engine.mjs';

const c = (timestamp, open, high, low, close) => ({ timestamp, open, high, low, close });
const variant = (id) => PAPER_VARIANTS.find((row) => row.id === id);

function position(id, entry = 184.15, entryTime = '2026-08-17T09:31:00+05:30') {
  return initialPosition({ entry, entryTime, variant: variant(id) });
}

test('paper observation keeps the six existing variants and four 170/210 comparators', () => {
  assert.deepEqual(PAPER_VARIANTS.map((row) => row.id), ['V2', 'V3_5', 'V3_10', 'V6', 'V7', 'V8', 'V9', 'V10_5', 'V10_10', 'V11']);
  assert.equal(variant('V3_5').trailStep, 5);
  assert.equal(variant('V3_10').trailStep, 10);
});

test('170/210 cohort is eligible only for executable entries strictly inside its band', () => {
  assert.equal(variantEligible(180, variant('V9')), true);
  assert.equal(variantEligible(170, variant('V9')), false);
  assert.equal(variantEligible(210, variant('V9')), false);
  assert.equal(variantEligible(215, variant('V2')), true);
});

test('V9 uses a 170 stop and activates the continuous trail at 210', () => {
  let p = position('V9', 180);
  assert.equal(p.initialStop, 170);
  p = processCompletedBar(p, c('2026-09-01T09:31:00+05:30', 180, 209.99, 175, 205));
  assert.equal(p.activeStop, 170);
  p = processCompletedBar(p, c('2026-09-01T09:32:00+05:30', 205, 214, 180, 212));
  assert.equal(p.activeStop, 194);
});

test('V10-5 and V10-10 wait for 210 then step from the same absolute anchor', () => {
  let v105 = position('V10_5', 180); let v1010 = position('V10_10', 180);
  const below = c('2026-09-01T09:31:00+05:30', 180, 209.99, 175, 205);
  v105 = processCompletedBar(v105, below); v1010 = processCompletedBar(v1010, below);
  assert.equal(v105.activeStop, 170); assert.equal(v1010.activeStop, 170);
  const activated = c('2026-09-01T09:32:00+05:30', 205, 216, 180, 212);
  v105 = processCompletedBar(v105, activated); v1010 = processCompletedBar(v1010, activated);
  assert.equal(v105.activeStop, 195);
  assert.equal(v1010.activeStop, 190);
});

test('V11 applies V6 fixed 2R logic from the 170 stop', () => {
  let p = position('V11', 180);
  assert.equal(p.initialStop, 170);
  assert.equal(p.targetPremium, 200);
  p = processCompletedBar(p, c('2026-09-01T09:31:00+05:30', 180, 202, 175, 200));
  assert.equal(p.exit.result, 'FIXED_TARGET');
  assert.equal(p.exit.price, 200);
});

test('V6 uses a conservative fixed 2R target and checks stop first', () => {
  let p = position('V6', 190);
  assert.equal(p.initialStop, 160);
  assert.equal(p.targetPremium, 250);
  p = processCompletedBar(p, c('2026-08-17T09:31:00+05:30', 190, 255, 158, 240));
  assert.equal(p.exit.result, 'INITIAL_STOP');
  assert.equal(p.exit.price, 160);

  p = position('V6', 190);
  p = processCompletedBar(p, c('2026-08-17T09:31:00+05:30', 190, 252, 180, 250));
  assert.equal(p.exit.result, 'FIXED_TARGET');
  assert.equal(p.exit.price, 250);
});

test('V7 schedules a causal failure exit after 15 unproductive completed bars', () => {
  let p = position('V7', 190);
  for (let minute = 31; minute <= 45; minute += 1) {
    p = processCompletedBar(p, c(`2026-08-17T09:${minute}:00+05:30`, 190, 198, 175, 189));
  }
  assert.equal(p.exit, null);
  assert.equal(p.pendingTimeExitFrom, '2026-08-17T09:45:00+05:30');
  p = processCompletedBar(p, c('2026-08-17T09:46:00+05:30', 188, 192, 180, 190));
  assert.equal(p.exit.result, 'TIME_FAILURE_EXIT');
  assert.equal(p.exit.price, 188);
});

test('V8 uses entry-minus-20 initial risk with the V3-10 trail', () => {
  let p = position('V8', 184.15);
  assert.equal(p.initialStop, 164.15);
  p = processCompletedBar(p, c('2026-08-17T09:31:00+05:30', 184.15, 204.15, 170, 200));
  assert.equal(p.activeStop, 184.15);
  assert.equal(position('V8', 165).initialStop, 160);
});

test('premium reference is bracketed only with observations on both sides', () => {
  const valid = premiumBracket([{ premium: 148 }, { premium: 244.5 }]);
  assert.equal(valid.bracketed, true);
  assert.equal(valid.below.premium, 148);
  assert.equal(valid.above.premium, 244.5);

  const onlyAbove = premiumBracket([{ premium: 506.3 }]);
  assert.equal(onlyAbove.bracketed, false);
  assert.equal(onlyAbove.below, null);
  assert.equal(onlyAbove.above.premium, 506.3);
});

test('signal is the first completed close above 180 after 09:30', () => {
  const candles = [c('2026-08-17T09:25:00+05:30', 184, 186, 183, 184), c('2026-08-17T09:30:00+05:30', 185, 188, 184, 186)];
  assert.equal(firstSignal(candles)?.timestamp, '2026-08-17T09:30:00+05:30');
});

test('entry is next bar open and must remain inside 160-220 band', () => {
  const candles = [c('2026-08-17T09:29:00+05:30', 178, 180, 177, 179), c('2026-08-17T09:30:00+05:30', 179, 185, 178, 182), c('2026-08-17T09:31:00+05:30', 184.15, 190, 182, 188)];
  const entry = nextBarEntry(candles, firstSignal(candles));
  assert.equal(entry.entry, 184.15);
  assert.equal(entry.entryBar.timestamp, '2026-08-17T09:31:00+05:30');
});

test('only the 09:25 contract closest to 180 is eligible to signal', () => {
  const callRows = [c('2026-08-17T09:25:00+05:30', 176, 177, 175, 176), c('2026-08-17T09:30:00+05:30', 178, 180, 177, 179), c('2026-08-17T09:31:00+05:30', 181, 183, 180, 182)];
  const putRows = [c('2026-08-17T09:25:00+05:30', 190, 191, 189, 190), c('2026-08-17T09:30:00+05:30', 195, 196, 194, 195), c('2026-08-17T09:31:00+05:30', 196, 197, 195, 196)];
  const selected = selectSide(callRows, putRows);
  assert.equal(selected.side, 'CE');
  assert.equal(selected.signal.timestamp, '2026-08-17T09:31:00+05:30');
});

test('one shared candle stream produces independent V2/V3 stops', () => {
  const bar = c('2026-08-17T09:31:00+05:30', 184.15, 199.15, 170, 195);
  const v2 = processCompletedBar(position('V2'), bar);
  const v35 = processCompletedBar(position('V3_5'), bar);
  const v310 = processCompletedBar(position('V3_10'), bar);
  assert.equal(v2.activeStop, 160);
  assert.equal(v35.activeStop, 179.15);
  assert.equal(v310.activeStop, 174.15);
});

test('V2 activates continuous trail only after premium reaches 220', () => {
  let p = position('V2');
  p = processCompletedBar(p, c('2026-08-17T09:31:00+05:30', 184.15, 219.99, 170, 210));
  assert.equal(p.activeStop, 160);
  p = processCompletedBar(p, c('2026-08-17T09:32:00+05:30', 210, 224, 170, 221));
  assert.equal(p.exit, null);
  assert.equal(p.activeStop, 204);
  p = processCompletedBar(p, c('2026-08-17T09:33:00+05:30', 205, 230, 202, 210));
  assert.equal(p.exit.price, 204);
});

test('V3-5 and V3-10 diverge on the same completed candles', () => {
  let v35 = position('V3_5'); let v310 = position('V3_10');
  const first = c('2026-08-17T09:31:00+05:30', 184.15, 199.15, 170, 195);
  v35 = processCompletedBar(v35, first); v310 = processCompletedBar(v310, first);
  const second = c('2026-08-17T09:32:00+05:30', 195, 198, 176, 180);
  v35 = processCompletedBar(v35, second); v310 = processCompletedBar(v310, second);
  assert.equal(v35.exit.price, 179.15);
  assert.equal(v310.exit, null);
  assert.equal(v310.activeStop, 174.15);
});

test('exit bar does not credit unobservable post-stop excursion', () => {
  for (const id of ['V3_5', 'V3_10']) {
    let p = position(id, 191.7);
    p = processCompletedBar(p, c('2026-08-17T09:31:00+05:30', 191.7, 202.45, 182, 200));
    assert.equal(p.activeStop, 181.7);
    p = processCompletedBar(p, c('2026-08-17T09:32:00+05:30', 200, 216.45, 179.8, 210));
    assert.equal(p.exit.price, 181.7);
    assert.equal(p.peakHigh, 202.45);
  }
});

test('gap below active stop fills at bar open', () => {
  let p = position('V3_10', 184);
  p = processCompletedBar(p, c('2026-08-17T09:31:00+05:30', 184, 204, 180, 200));
  assert.equal(p.activeStop, 184);
  p = processCompletedBar(p, c('2026-08-17T09:32:00+05:30', 175, 180, 170, 178));
  assert.equal(p.exit.price, 175);
});

test('₹60k sizing buys whole current NIFTY lots only', () => {
  assert.equal(PAPER_RULES.lotSize, 65);
  assert.equal(PAPER_RULES.trailActivation, 220);
  assert.equal(PAPER_RULES.trailGap, 20);
  assert.equal(PAPER_RULES.initialStop, 160);
  assert.equal(PAPER_RULES.capital, 60000);
  assert.equal(lotsAffordable(184.15), 5);
});
