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
    'NSE-NIFTY-20Aug26-24900-CE', 'NSE-NIFTY-20Aug26-25000-CE', 'NSE-NIFTY-20Aug26-25100-CE',
    'NSE-NIFTY-20Aug26-24900-PE', 'NSE-NIFTY-20Aug26-25000-PE', 'NSE-NIFTY-20Aug26-25100-PE',
  ];
  assert.deepEqual(itmContracts(contracts, 25050, 'CE').map((x) => x.strike), [25000, 24900]);
  assert.deepEqual(itmContracts(contracts, 25050, 'PE').map((x) => x.strike), [25100]);
});

test('chooses the ITM contract whose 09:25 premium is closest to 180', () => {
  const candidates = [{ symbol: 'A', strike: 25000, optionType: 'CE' }, { symbol: 'B', strike: 24950, optionType: 'CE' }];
  assert.equal(chooseClosestPremium(candidates, { A: 172, B: 191 }).symbol, 'A');
});

test('first post-09:30 crossing above 180 wins and enters on next one-minute candle', () => {
  const callCandles = [
    candle('2026-08-14T09:29:00+05:30', 178, 181, 177, 179),
    candle('2026-08-14T09:30:00+05:30', 179, 183, 178, 182),
    candle('2026-08-14T09:31:00+05:30', 183, 190, 182, 188),
    candle('2026-08-14T09:32:00+05:30', 188, 221, 187, 220),
  ];
  const putCandles = [
    candle('2026-08-14T09:29:00+05:30', 175, 178, 170, 174),
    candle('2026-08-14T09:30:00+05:30', 174, 179, 171, 176),
    candle('2026-08-14T09:31:00+05:30', 176, 180, 173, 179),
    candle('2026-08-14T09:32:00+05:30', 179, 183, 178, 181),
  ];
  const result = evaluatePremiumDay({ call: { symbol: 'CE' }, put: { symbol: 'PE' }, callCandles, putCandles });
  assert.equal(result.status, 'TRADE');
  assert.equal(result.side, 'CE');
  assert.equal(result.signalTime, '2026-08-14T09:30:00+05:30');
  assert.equal(result.entryTime, '2026-08-14T09:31:00+05:30');
  assert.equal(result.result, 'TARGET');
});

test('contract already above 180 before 09:30 does not trigger by merely staying above', () => {
  const callCandles = [
    candle('2026-08-14T09:29:00+05:30', 200, 205, 198, 202),
    candle('2026-08-14T09:30:00+05:30', 202, 210, 201, 208),
    candle('2026-08-14T09:31:00+05:30', 208, 215, 205, 210),
  ];
  const putCandles = [
    candle('2026-08-14T09:29:00+05:30', 170, 175, 168, 172),
    candle('2026-08-14T09:30:00+05:30', 172, 178, 170, 176),
    candle('2026-08-14T09:31:00+05:30', 176, 179, 173, 178),
  ];
  assert.equal(evaluatePremiumDay({ call: { symbol: 'CE' }, put: { symbol: 'PE' }, callCandles, putCandles }).status, 'NO_TRADE');
});

test('confirmation that has already reached the 220 target is rejected', () => {
  const callCandles = [
    candle('2026-08-14T09:29:00+05:30', 175, 179, 170, 178),
    candle('2026-08-14T09:30:00+05:30', 178, 230, 177, 225),
    candle('2026-08-14T09:31:00+05:30', 224, 228, 215, 218),
  ];
  const putCandles = [candle('2026-08-14T09:29:00+05:30', 170, 174, 168, 171), candle('2026-08-14T09:30:00+05:30', 171, 176, 169, 174)];
  const result = evaluatePremiumDay({ call: { symbol: 'CE' }, put: { symbol: 'PE' }, callCandles, putCandles });
  assert.equal(result.status, 'NO_TRADE');
  assert.match(result.reason, /target/i);
});

test('next-bar entry at or above 220 is rejected instead of counted as a target', () => {
  const callCandles = [
    candle('2026-08-14T09:29:00+05:30', 175, 179, 170, 178),
    candle('2026-08-14T09:30:00+05:30', 178, 195, 177, 190),
    candle('2026-08-14T09:31:00+05:30', 225, 230, 218, 222),
  ];
  const putCandles = [candle('2026-08-14T09:29:00+05:30', 170, 174, 168, 171), candle('2026-08-14T09:30:00+05:30', 171, 176, 169, 174)];
  const result = evaluatePremiumDay({ call: { symbol: 'CE' }, put: { symbol: 'PE' }, callCandles, putCandles });
  assert.equal(result.status, 'NO_TRADE');
  assert.equal(result.entry, 225);
  assert.match(result.reason, /outside/i);
});

test('same-minute CE and PE crossings are rejected as ambiguous', () => {
  const callCandles = [candle('2026-08-14T09:29:00+05:30',175,179,173,178), candle('2026-08-14T09:30:00+05:30',179,183,178,182), candle('2026-08-14T09:31:00+05:30',182,184,180,183)];
  const putCandles = [candle('2026-08-14T09:29:00+05:30',176,179,174,178), candle('2026-08-14T09:30:00+05:30',179,184,178,181), candle('2026-08-14T09:31:00+05:30',181,183,179,182)];
  assert.equal(evaluatePremiumDay({ call:{symbol:'CE'}, put:{symbol:'PE'}, callCandles, putCandles }).status, 'AMBIGUOUS');
});

test('unresolved trade exits at the 09:45 bar open, not its later close', () => {
  const callCandles = [
    candle('2026-08-14T09:29:00+05:30',175,179,173,178),
    candle('2026-08-14T09:30:00+05:30',179,184,178,182),
    candle('2026-08-14T09:31:00+05:30',183,190,180,185),
    candle('2026-08-14T09:44:00+05:30',190,195,185,192),
    candle('2026-08-14T09:45:00+05:30',191,230,150,210),
  ];
  const result=evaluatePremiumDay({call:{symbol:'CE'},put:{symbol:'PE'},callCandles,putCandles:[]});
  assert.equal(result.status,'TRADE');
  assert.equal(result.result,'TIME');
  assert.equal(result.exit,191);
  assert.equal(result.exitTime,'2026-08-14T09:45:00+05:30');
});

test('09:44 confirmation is rejected because next-bar entry is at forced-exit time', () => {
  const callCandles = [
    candle('2026-08-14T09:43:00+05:30',175,179,173,178),
    candle('2026-08-14T09:44:00+05:30',179,184,178,182),
    candle('2026-08-14T09:45:00+05:30',183,190,180,185),
  ];
  const result=evaluatePremiumDay({call:{symbol:'CE'},put:{symbol:'PE'},callCandles,putCandles:[]});
  assert.equal(result.status,'NO_TRADE');
  assert.match(result.reason,/holding interval/i);
});
