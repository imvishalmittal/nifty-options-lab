import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPER_RULES, PAPER_VARIANTS, firstSignal, initialPosition, lotsAffordable, nextBarEntry, premiumBracket, processCompletedBar, selectSide } from '../paper/paper-engine.mjs';

const c = (timestamp, open, high, low, close) => ({ timestamp, open, high, low, close });
const variant = (id) => PAPER_VARIANTS.find((row) => row.id === id);

function position(id, entry = 184.15, entryTime = '2026-08-17T09:31:00+05:30') {
  return initialPosition({ entry, entryTime, variant: variant(id) });
}

test('paper observation variants are exactly V2, V3-5 and V3-10', () => {
  assert.deepEqual(PAPER_VARIANTS.map((row) => row.id), ['V2', 'V3_5', 'V3_10']);
  assert.equal(variant('V3_5').trailStep, 5);
  assert.equal(variant('V3_10').trailStep, 10);
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

test('signal requires completed crossing after 09:30', () => {
  const candles = [c('2026-08-17T09:29:00+05:30', 179, 181, 178, 179), c('2026-08-17T09:30:00+05:30', 179, 184, 178, 182)];
  assert.equal(firstSignal(candles)?.timestamp, '2026-08-17T09:30:00+05:30');
});

test('entry is next bar open and must remain inside 160-220 band', () => {
  const candles = [c('2026-08-17T09:29:00+05:30', 178, 180, 177, 179), c('2026-08-17T09:30:00+05:30', 179, 185, 178, 182), c('2026-08-17T09:31:00+05:30', 184.15, 190, 182, 188)];
  const entry = nextBarEntry(candles, firstSignal(candles));
  assert.equal(entry.entry, 184.15);
  assert.equal(entry.entryBar.timestamp, '2026-08-17T09:31:00+05:30');
});

test('same-minute CE and PE signals are ambiguous', () => {
  const rows = [c('2026-08-17T09:29:00+05:30', 178, 180, 177, 179), c('2026-08-17T09:30:00+05:30', 179, 185, 178, 182)];
  assert.equal(selectSide(rows, rows).ambiguous, true);
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
