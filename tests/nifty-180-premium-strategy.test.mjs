import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNiftyOptionContract, nearestExpiry, itmContracts, chooseClosestPremium, evaluatePremiumDay } from '../research/nifty-180-premium-strategy.mjs';

const candle = (timestamp, open, high, low, close) => ({ timestamp, open, high, low, close });

test('parses NIFTY option symbols and selects nearest non-expired expiry', () => {
  assert.deepEqual(parseNiftyOptionContract('NSE-NIFTY-20Aug26-25000-CE'), {
    symbol: 'NSE-NIFTY-20Aug26-25000-CE', expiryCode: '20Aug26', strike: 25000, optionType: 'CE',
  });
  assert.equal(nearestExpiry(['2026-08-13', '2026-08-20', '2026-08-27'], '2026-08-16'), '2026-08-20');
});

test('ITM selection is based on contemporaneous NIFTY spot', () => {
  const contracts = [
    'NSE-NIFTY-20Aug26-24900-CE',
    'NSE-NIFTY-20Aug26-25000-CE',
    'NSE-NIFTY-20Aug26-25100-CE',
    'NSE-NIFTY-20Aug26-24900-PE',
    'NSE-NIFTY-20Aug26-25000-PE',
    'NSE-NIFTY-20Aug26-25100-PE',
  ];
  assert.deepEqual(itmContracts(contracts, 25050, 'CE').map((x) => x.strike), [25000, 24900]);
  assert.deepEqual(itmContracts(contracts, 25050, 'PE').map((x) => x.strike), [25100]);
});

test('chooses the ITM contract whose 09:25 premium is closest to 180', () => {
  const candidates = [
    { symbol: 'A', strike: 25000, optionType: 'CE' },
    { symbol: 'B', strike: 24950, optionType: 'CE' },
  ];
  const selected = chooseClosestPremium(candidates, { A: 172, B: 191 });
  assert.equal(selected.symbol, 'A');
});

test('first side to close above 180 wins and enters on next one-minute candle', () => {
  const callCandles = [
    candle('2026-08-14T09:29:00+05:30', 178, 181, 177, 179),
    candle('2026-08-14T09:30:00+05:30', 179, 183, 178, 182),
    candle('2026-08-14T09:31:00+05:30', 183, 190, 182, 188),
    candle('2026-08-14T09:32:00+05:30', 188, 221, 187, 220),
  ];
  const putCandles = [
    candle('2026-08-14T09:30:00+05:30', 175, 178, 170, 174),
    candle('2026-08-14T09:31:00+05:30', 174, 180, 171, 179),
    candle('2026-08-14T09:32:00+05:30', 179, 183, 178, 181),
  ];
  const result = evaluatePremiumDay({ call: { symbol: 'CE' }, put: { symbol: 'PE' }, callCandles, putCandles });
  assert.equal(result.status, 'TRADE');
  assert.equal(result.side, 'CE');
  assert.equal(result.signalTime, '2026-08-14T09:30:00+05:30');
  assert.equal(result.entryTime, '2026-08-14T09:31:00+05:30');
  assert.equal(result.result, 'TARGET');
});

test('same-minute CE and PE confirmations are rejected as ambiguous', () => {
  const callCandles = [candle('2026-08-14T09:30:00+05:30', 179, 183, 178, 182), candle('2026-08-14T09:31:00+05:30', 182, 184, 180, 183)];
  const putCandles = [candle('2026-08-14T09:30:00+05:30', 179, 184, 178, 181), candle('2026-08-14T09:31:00+05:30', 181, 183, 179, 182)];
  const result = evaluatePremiumDay({ call: { symbol: 'CE' }, put: { symbol: 'PE' }, callCandles, putCandles });
  assert.equal(result.status, 'AMBIGUOUS');
});
