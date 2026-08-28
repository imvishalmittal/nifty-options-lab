import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_HAI_RULES,
  attachVideoHaiCosts,
  buildVideoHaiCandidates,
  entryCreditPoints,
  evaluateVideoHaiPosition,
  maximumExpiryLossPoints,
  roundedUpHundredAnchor,
  selectCandidateFromEntryQuotes,
} from '../research/video-hai-ratio-engine.mjs';
import { evaluateVideoHaiGates } from '../research/video-hai-ratio-gates.mjs';
import { validateVideoHaiResult } from '../research/video-hai-ratio-integrity.mjs';
import { expiryYearsForVideoPeriod } from '../research/groww-video-hai-ratio-backtest.mjs';

const symbol = (strike) => `NSE-NIFTY-01SEP26-${strike}-CE`;
const candle = (timestamp, open, close = open) => ({ timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close });

function legs(rows) {
  return { lowerLong: rows.lowerLong, middleShort: rows.middleShort, upperLong: rows.upperLong };
}

test('video anchor rounds a 50-ending spot upward and builds exact 1:3:2 spacing', () => {
  assert.equal(roundedUpHundredAnchor(24150), 24200);
  const candidates = buildVideoHaiCandidates([
    symbol(24400), symbol(24600), symbol(24800), symbol(24500), symbol(24700), symbol(24900),
  ], 24150);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates[0].lowerLong.strike, 24400);
  assert.deepEqual(candidates[0].middleShort.strike, 24600);
  assert.deepEqual(candidates[0].upperLong.strike, 24800);
  assert.deepEqual([candidates[0].lowerLong.lots, candidates[0].middleShort.lots, candidates[0].upperLong.lots], [1, 3, 2]);
});

test('entry-credit filter shifts the entire structure outward', () => {
  const candidates = buildVideoHaiCandidates([
    symbol(24400), symbol(24600), symbol(24800), symbol(24500), symbol(24700), symbol(24900),
  ], 24150);
  const quotes = new Map([
    [24400, { lowerLong: 20, middleShort: 10, upperLong: 1 }], // 8 points = 0.57%, allowed at 65
    [24500, { lowerLong: 20, middleShort: 12, upperLong: 1 }],
  ]);
  const result = selectCandidateFromEntryQuotes(candidates, (selection) => quotes.get(selection.lowerLong.strike), 65);
  assert.equal(result.selection.lowerLong.strike, 24400);
  assert.equal(entryCreditPoints(result.entryPrices), 8);

  const shifted = selectCandidateFromEntryQuotes(candidates, (selection) => selection.lowerLong.strike === 24400
    ? { lowerLong: 20, middleShort: 16, upperLong: 1 }
    : { lowerLong: 20, middleShort: 10, upperLong: 1 }, 65);
  assert.equal(shifted.selection.lowerLong.strike, 24500);
});

test('target is detected on a completed package close and filled at next synchronized open', () => {
  const selection = buildVideoHaiCandidates([symbol(24400), symbol(24600), symbol(24800)], 24150)[0];
  const legCandles = legs({
    lowerLong: [candle('2026-02-02T09:45:00+05:30', 10), candle('2026-02-02T09:46:00+05:30', 10, 40), candle('2026-02-02T09:47:00+05:30', 38), candle('2026-02-06T15:15:00+05:30', 35)],
    middleShort: [candle('2026-02-02T09:45:00+05:30', 5), candle('2026-02-02T09:46:00+05:30', 5), candle('2026-02-02T09:47:00+05:30', 5), candle('2026-02-06T15:15:00+05:30', 4)],
    upperLong: [candle('2026-02-02T09:45:00+05:30', 2), candle('2026-02-02T09:46:00+05:30', 2), candle('2026-02-02T09:47:00+05:30', 2), candle('2026-02-06T15:15:00+05:30', 2)],
  });
  const result = evaluateVideoHaiPosition({ selection, legCandles, entryTimestamp: '2026-02-02T09:45:00+05:30', fridayDate: '2026-02-06', lotSize: 65 });
  assert.equal(result.result, 'TARGET');
  assert.equal(result.thresholdTime, '2026-02-02T09:46:00+05:30');
  assert.equal(result.exitTime, '2026-02-02T09:47:00+05:30');
});

test('overnight gap stop uses the opening package and may exceed nominal one percent', () => {
  const selection = buildVideoHaiCandidates([symbol(24400), symbol(24600), symbol(24800)], 24150)[0];
  const legCandles = legs({
    lowerLong: [candle('2026-02-02T09:45:00+05:30', 10), candle('2026-02-03T09:15:00+05:30', 1), candle('2026-02-06T15:15:00+05:30', 1)],
    middleShort: [candle('2026-02-02T09:45:00+05:30', 5), candle('2026-02-03T09:15:00+05:30', 20), candle('2026-02-06T15:15:00+05:30', 20)],
    upperLong: [candle('2026-02-02T09:45:00+05:30', 2), candle('2026-02-03T09:15:00+05:30', 1), candle('2026-02-06T15:15:00+05:30', 1)],
  });
  const result = evaluateVideoHaiPosition({ selection, legCandles, entryTimestamp: '2026-02-02T09:45:00+05:30', fridayDate: '2026-02-06', lotSize: 65 });
  assert.equal(result.result, 'STOP');
  assert.equal(result.exitTime, '2026-02-03T09:15:00+05:30');
  assert.ok(result.grossPnlRupees < -(140000 * VIDEO_HAI_RULES.stopCapitalRatio));
});

test('defined-risk payoff and historical STT dates are calculated per transaction side', () => {
  const selection = buildVideoHaiCandidates([symbol(24400), symbol(24600), symbol(24800)], 24150)[0];
  const entryPrices = { lowerLong: 10, middleShort: 5, upperLong: 2 };
  assert.equal(maximumExpiryLossPoints(selection, entryPrices), 199);
  const position = {
    status: 'TRADE', lotSize: 65,
    entryTime: '2026-03-30T09:45:00+05:30', exitTime: '2026-04-03T15:15:00+05:30',
    entryPrices, exitPrices: { lowerLong: 8, middleShort: 3, upperLong: 1 },
  };
  const costs = attachVideoHaiCosts(position, { slippagePointsPerLeg: 0 });
  assert.equal(costs.legs.middleShort.tradeDate, '2026-03-30');
  assert.equal(costs.legs.middleShort.sttSellRate, 0.001);
  assert.equal(costs.legs.lowerLong.tradeDate, '2026-04-03');
  assert.equal(costs.legs.lowerLong.sttSellRate, 0.0015);
});

test('integrity rejects a malformed ratio and precommitted gates reject a tiny sample', () => {
  const selection = buildVideoHaiCandidates([symbol(24400), symbol(24600), symbol(24800)], 24150)[0];
  selection.middleShort.lots = 2;
  const document = {
    schemaVersion: 1,
    strategy: 'video-hai-call-ratio-1x3x2',
    period: { startDate: '2026-02-02', endDate: '2026-02-06' },
    rules: VIDEO_HAI_RULES,
    summary: { observedMondays: 1, trades: 0 },
    publicationEraSummary: { postPublication: { stress0_5: {}, stress1_0: {} } },
    results: [{ date: '2026-02-02', fridayDate: '2026-02-06', expiry: '2026-02-10', status: 'NO_TRADE', selection }],
  };
  const integrity = validateVideoHaiResult(document);
  assert.equal(integrity.valid, false);
  assert.ok(integrity.errors.some((error) => error.includes('1:3:2 ratio')));
  const gates = evaluateVideoHaiGates(document);
  assert.equal(gates.pass, false);
  assert.equal(gates.checks.find((row) => row.name === 'post-publication Mondays').pass, false);
});

test('expiry coverage includes the following calendar year only when the period needs it', () => {
  assert.deepEqual(expiryYearsForVideoPeriod('2025-09-01', '2026-08-21'), [2025, 2026]);
  assert.deepEqual(expiryYearsForVideoPeriod('2025-12-01', '2025-12-26'), [2025, 2026]);
});
