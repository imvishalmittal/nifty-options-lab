import test from 'node:test';
import assert from 'node:assert/strict';
import { MULTI_INDEX_SPREAD_RULES, indexLotSizeForExpiry, parseIndexOptionContract, selectCrossingSkewedSpread, selectListedIntervalCreditSpread } from '../research/multi-index-credit-engine.mjs';

function ladder(type, strikes) {
  return strikes.map((strike) => ({ symbol: `x-${strike}-${type}`, strike, optionType: type }));
}

test('parses each configured NSE index without hard-coding NIFTY', () => {
  for (const { underlying } of MULTI_INDEX_SPREAD_RULES.underlyings) {
    const parsed = parseIndexOptionContract(`NSE-${underlying}-26Dec24-25000-CE`, underlying);
    assert.equal(parsed.underlying, underlying);
    assert.equal(parsed.strike, 25000);
  }
});

test('uses six actual listed intervals rather than assuming a point width', () => {
  const putStrikes = [44000, 44100, 44200, 44400, 44500, 44600, 44700, 44800];
  const selected = selectListedIntervalCreditSpread(ladder('PE', putStrikes), 44720, 'UP', 6);
  assert.equal(selected.short.strike, 44700);
  assert.equal(selected.long.strike, 44000);
  assert.equal(selected.listedIntervals, 6);
});

test('refuses a spread if the full listed hedge distance is unavailable', () => {
  assert.equal(selectListedIntervalCreditSpread(ladder('CE', [100, 150, 200]), 100, 'DOWN', 6), null);
});

test('crossing agreement keeps ATM while disagreement shifts one interval OTM', () => {
  const contracts = [...ladder('PE', [50, 100, 150, 200, 250, 300, 350, 400, 450]), ...ladder('CE', [50, 100, 150, 200, 250, 300, 350, 400, 450])];
  const agree = selectCrossingSkewedSpread({ contracts, spot: 350, direction: 'UP', crossingDirection: 'UP', hedgeIntervals: 3 });
  const disagree = selectCrossingSkewedSpread({ contracts, spot: 350, direction: 'UP', crossingDirection: 'DOWN', hedgeIntervals: 3 });
  assert.equal(agree.short.strike, 350);
  assert.equal(disagree.short.strike, 300);
  assert.equal(disagree.long.strike, 150);
});

test('uses dated exchange lot schedules for all three indices', () => {
  assert.equal(indexLotSizeForExpiry('NIFTY', '2020-06-25'), 75);
  assert.equal(indexLotSizeForExpiry('NIFTY', '2024-05-30'), 25);
  assert.equal(indexLotSizeForExpiry('BANKNIFTY', '2020-06-25'), 20);
  assert.equal(indexLotSizeForExpiry('BANKNIFTY', '2020-07-30'), 25);
  assert.equal(indexLotSizeForExpiry('BANKNIFTY', '2023-07-27'), 15);
  assert.equal(indexLotSizeForExpiry('FINNIFTY', '2024-04-30'), 40);
  assert.equal(indexLotSizeForExpiry('FINNIFTY', '2024-05-28'), 25);
});
