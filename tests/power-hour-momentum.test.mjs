import test from 'node:test';
import assert from 'node:assert/strict';
import { backtestPowerHourMomentum } from '../research/power-hour-momentum.mjs';

const c = (date, time, open, high, low, close, volume, symbol) => ({
  timestamp: `${date}T${time}:00+05:30`, open, high, low, close, volume, symbol,
});

function day(date, base, decisionClose, volume, symbol, stop = false) {
  const rows = [c(date, '09:15', base, base + 1, base - 1, base, volume / 4, symbol)];
  for (const time of ['09:20', '09:25', '10:00', '11:00', '12:00', '13:00']) {
    rows.push(c(date, time, base, base + 1, base - 1, base, volume / 12, symbol));
  }
  const long = decisionClose > base;
  rows.push(c(
    date,
    '14:25',
    decisionClose + (long ? -0.1 : 0.1),
    decisionClose + 0.2,
    decisionClose - 0.2,
    decisionClose,
    volume / 4,
    symbol,
  ));
  const entry = decisionClose;
  rows.push(c(date, '14:30', entry, entry + 0.2, stop ? entry - 10 : entry - 0.1, entry + (long ? 0.1 : -0.1), volume / 12, symbol));
  rows.push(c(date, '15:10', entry + (long ? 0.5 : -0.5), entry + 0.7, entry - 0.7, entry + (long ? 0.5 : -0.5), volume / 12, symbol));
  return rows;
}

function date(index) {
  return new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10);
}

test('power-hour entry uses the bar after the completed 14:25 decision', () => {
  const rows = [];
  for (let i = 0; i < 22; i += 1) rows.push(...day(date(i), 100, 100.2, 1000, 'AAA'));
  const signalDate = date(22);
  rows.push(...day(signalDate, 100, 102, 1500, 'AAA'));
  const result = backtestPowerHourMomentum(rows, { minimumAbsoluteMove: 0.0075, minimumRelativeVolume: 1.2 });
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].signalTime, `${signalDate}T14:25:00+05:30`);
  assert.equal(result.trades[0].entryTime, `${signalDate}T14:30:00+05:30`);
  assert.equal(result.trades[0].direction, 'LONG');
});

test('cross-sectional selection takes at most one leader and one laggard per day', () => {
  const rows = [];
  for (const symbol of ['AAA', 'BBB', 'CCC']) {
    for (let i = 0; i < 22; i += 1) rows.push(...day(date(i), 100, 100.2, 1000, symbol));
  }
  const signalDate = date(22);
  rows.push(...day(signalDate, 100, 102, 1500, 'AAA'));
  rows.push(...day(signalDate, 100, 103, 1500, 'BBB'));
  rows.push(...day(signalDate, 100, 98, 1500, 'CCC'));
  const result = backtestPowerHourMomentum(rows);
  assert.equal(result.trades.length, 2);
  assert.deepEqual(result.trades.map((trade) => trade.symbol).sort(), ['BBB', 'CCC']);
});

test('same entry bar stop is scored conservatively before close exit', () => {
  const rows = [];
  for (let i = 0; i < 22; i += 1) rows.push(...day(date(i), 100, 100.2, 1000, 'AAA'));
  const signalDate = date(22);
  rows.push(...day(signalDate, 100, 102, 1500, 'AAA', true));
  const result = backtestPowerHourMomentum(rows);
  assert.equal(result.trades[0].result, 'STOP');
  assert.equal(result.trades[0].exitTime, `${signalDate}T14:30:00+05:30`);
  assert.ok(result.trades[0].costs.stress5bps.netPnl < result.trades[0].costs.normalized.netPnl);
});
