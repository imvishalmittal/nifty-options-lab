import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCandles } from '../paper/groww-paper-client.mjs';
import { paperContractCandidates, selectPaperContracts, selectPremiumContract } from '../paper/paper-contract-selection.mjs';

const symbol = (strike, type) => `NSE-NIFTY-01Sep26-${strike}-${type}`;

test('sparse Groww chain is completed with the expected 50-point near-spot strikes', () => {
  const contracts = [
    symbol(24300, 'CE'), symbol(24100, 'CE'), symbol(24000, 'CE'),
    symbol(24400, 'PE'), symbol(24450, 'PE'), symbol(24500, 'PE'),
  ];
  const ce = paperContractCandidates(contracts, 24353.3, 'CE', 3);
  assert.equal(ce.strikeStep, 50);
  assert.deepEqual(ce.candidates.slice(0, 5).map((row) => row.strike), [24350, 24300, 24400, 24250, 24450]);
  assert.equal(ce.candidates[0].discoverySource, 'synthetic_gap_fill');
  assert.equal(ce.candidates[1].discoverySource, 'contracts_api');
  assert.ok(ce.missingStrikes.includes(24350));
  assert.ok(ce.missingStrikes.includes(24400));
});

test('today sparse CE ladder brackets 180 instead of jumping from 24300 to 24100', async () => {
  const contracts = [symbol(24300, 'CE'), symbol(24100, 'CE')];
  const premiums = new Map([[symbol(24350, 'CE'), 176.4], [symbol(24300, 'CE'), 193.3]]);
  const fetchCandles = async (_segment, growwSymbol) => {
    const premium = premiums.get(growwSymbol);
    return Number.isFinite(premium) ? [{ timestamp: '2026-08-26T09:25:00+05:30', open: premium, high: premium, low: premium, close: premium }] : [];
  };
  const result = await selectPremiumContract({
    fetchCandles,
    date: '2026-08-26',
    candidateSet: paperContractCandidates(contracts, 24353.3, 'CE', 3),
  });
  assert.equal(result.bracketed, true);
  assert.equal(result.below.strike, 24350);
  assert.equal(result.above.strike, 24300);
  assert.equal(result.selected.strike, 24350);
  assert.equal(result.fetched, 2);
});

test('invalid synthesized symbol is auditable and does not hide later valid candidates', async () => {
  const contracts = [symbol(24300, 'CE')];
  const fetchCandles = async (_segment, growwSymbol) => {
    if (growwSymbol === symbol(24350, 'CE')) throw new Error('Groww /historical/candles failed (400): invalid symbol');
    const premium = growwSymbol === symbol(24300, 'CE') ? 193.3 : 160;
    return [{ timestamp: '2026-08-26T09:25:00+05:30', open: premium, high: premium, low: premium, close: premium }];
  };
  const result = await selectPremiumContract({ fetchCandles, date: '2026-08-26', candidateSet: paperContractCandidates(contracts, 24353.3, 'CE', 2) });
  assert.equal(result.bracketed, true);
  assert.match(result.candidatesChecked[0].error, /invalid symbol/);
  assert.equal(result.selected.strike, 24300);
});

test('both sides must independently bracket before paper signal evaluation', async () => {
  const contracts = [symbol(24300, 'CE'), symbol(24400, 'PE')];
  const premiums = new Map([
    [symbol(24350, 'CE'), 176], [symbol(24300, 'CE'), 193],
    [symbol(24350, 'PE'), 154], [symbol(24400, 'PE'), 186],
  ]);
  const fetchCandles = async (_segment, growwSymbol) => {
    const premium = premiums.get(growwSymbol);
    return Number.isFinite(premium) ? [{ timestamp: '2026-08-26T09:25:00+05:30', open: premium, high: premium, low: premium, close: premium }] : [];
  };
  const result = await selectPaperContracts({
    fetchCandles,
    loadContracts: async () => contracts,
    date: '2026-08-26',
    spot: 24353.3,
    maxAttempts: 1,
  });
  assert.equal(result.complete, true);
  assert.equal(result.ce.selected.strike, 24350);
  assert.equal(result.pe.selected.strike, 24400);
});

test('duplicate one-minute fragments merge causally into one candle', () => {
  const candles = normalizeCandles([
    ['2026-08-26 09:31:00', 180, 185, 179, 183, 100],
    ['2026-08-26 09:31:00', 183, 188, 178, 186, 120],
  ]);
  assert.deepEqual(candles, [{
    timestamp: '2026-08-26T09:31:00+05:30', open: 180, high: 188, low: 178, close: 186, volume: 120,
  }]);
});
