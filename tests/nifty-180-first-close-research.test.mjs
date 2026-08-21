import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePremiumDay } from '../research/nifty-180-premium-strategy.mjs';

function candle(time, { open, high, low, close }) {
  return {
    timestamp: `2026-01-05T${time}:00+05:30`,
    open,
    high,
    low,
    close,
    volume: 1000,
  };
}

const contractCE = { symbol: 'NSE-NIFTY-06Jan26-26000-CE', optionType: 'CE', strike: 26000, premium: 184 };
const contractPE = { symbol: 'NSE-NIFTY-06Jan26-26400-PE', optionType: 'PE', strike: 26400, premium: 176 };

test('accepts first 09:30 close above 180 even when contract was already above 180', () => {
  const callCandles = [
    candle('09:29', { open: 184, high: 187, low: 183, close: 185 }),
    candle('09:30', { open: 185, high: 188, low: 184, close: 186 }),
    candle('09:31', { open: 187, high: 190, low: 181, close: 188 }),
    candle('09:45', { open: 189, high: 190, low: 188, close: 189 }),
  ];
  const putCandles = [
    candle('09:29', { open: 176, high: 178, low: 174, close: 176 }),
    candle('09:30', { open: 176, high: 179, low: 175, close: 178 }),
    candle('09:31', { open: 178, high: 179, low: 176, close: 177 }),
    candle('09:45', { open: 176, high: 177, low: 175, close: 176 }),
  ];
  const result = evaluatePremiumDay({ call: contractCE, put: contractPE, callCandles, putCandles });
  assert.equal(result.status, 'TRADE');
  assert.equal(result.side, 'CE');
  assert.equal(result.signalTime, '2026-01-05T09:30:00+05:30');
  assert.equal(result.signalClose, 186);
  assert.equal(result.entryTime, '2026-01-05T09:31:00+05:30');
  assert.equal(result.entry, 187);
});

test('still waits when early candles are below 180', () => {
  const callCandles = [
    candle('09:29', { open: 176, high: 178, low: 175, close: 177 }),
    candle('09:30', { open: 177, high: 180, low: 176, close: 179 }),
    candle('09:31', { open: 179, high: 184, low: 178, close: 182 }),
    candle('09:32', { open: 183, high: 188, low: 181, close: 185 }),
    candle('09:45', { open: 186, high: 187, low: 185, close: 186 }),
  ];
  const putCandles = [
    candle('09:29', { open: 170, high: 172, low: 168, close: 170 }),
    candle('09:30', { open: 170, high: 173, low: 169, close: 171 }),
    candle('09:31', { open: 171, high: 174, low: 170, close: 172 }),
    candle('09:32', { open: 172, high: 175, low: 171, close: 173 }),
    candle('09:45', { open: 174, high: 175, low: 173, close: 174 }),
  ];
  const result = evaluatePremiumDay({ call: contractCE, put: contractPE, callCandles, putCandles });
  assert.equal(result.status, 'TRADE');
  assert.equal(result.signalTime, '2026-01-05T09:31:00+05:30');
  assert.equal(result.entryTime, '2026-01-05T09:32:00+05:30');
  assert.equal(result.entry, 183);
});

test('marks same-minute CE and PE first closes above 180 as ambiguous', () => {
  const callCandles = [
    candle('09:29', { open: 185, high: 187, low: 184, close: 185 }),
    candle('09:30', { open: 185, high: 188, low: 184, close: 186 }),
    candle('09:31', { open: 186, high: 188, low: 184, close: 187 }),
  ];
  const putCandles = [
    candle('09:29', { open: 182, high: 184, low: 181, close: 183 }),
    candle('09:30', { open: 183, high: 186, low: 182, close: 184 }),
    candle('09:31', { open: 184, high: 186, low: 182, close: 185 }),
  ];
  const result = evaluatePremiumDay({ call: contractCE, put: contractPE, callCandles, putCandles });
  assert.equal(result.status, 'AMBIGUOUS');
});

test('does not enter from a 09:44 confirmation because next bar is 09:45 cutoff', () => {
  const callCandles = [
    candle('09:43', { open: 176, high: 179, low: 175, close: 178 }),
    candle('09:44', { open: 179, high: 184, low: 178, close: 182 }),
    candle('09:45', { open: 183, high: 185, low: 181, close: 184 }),
  ];
  const putCandles = [
    candle('09:43', { open: 170, high: 172, low: 169, close: 171 }),
    candle('09:44', { open: 171, high: 173, low: 170, close: 172 }),
    candle('09:45', { open: 172, high: 174, low: 171, close: 173 }),
  ];
  const result = evaluatePremiumDay({ call: contractCE, put: contractPE, callCandles, putCandles });
  assert.equal(result.status, 'NO_TRADE');
  assert.equal(result.reason, 'No executable holding interval after confirmation');
});
