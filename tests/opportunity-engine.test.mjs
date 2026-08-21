import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES,
  detectOpportunityFromEnriched,
  enrichIndicators,
  evaluateOptionPosition,
  niftyLotSizeForExpiry,
} from '../research/opportunity/opportunity-engine.mjs';
import { normalizeCandles } from '../research/opportunity/groww-opportunity-backtest.mjs';
import { validateOpportunityResult } from '../research/opportunity/result-integrity.mjs';

function times(start, end) {
  const output = [];
  let [hour, minute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  while (hour < endHour || (hour === endHour && minute <= endMinute)) {
    output.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    minute += 1;
    if (minute === 60) { hour += 1; minute = 0; }
  }
  return output;
}

function row(time, overrides = {}) {
  return {
    timestamp: `2026-01-02T${time}:00+05:30`,
    open: 100,
    high: 110,
    low: 90,
    close: 100,
    volume: 1000,
    ema9: 100,
    ema22: 100,
    adx14: 20,
    vwap: 100,
    vwapMode: 'volume',
    ...overrides,
  };
}

function enrichedSession(end = '14:31') {
  return times('09:15', end).map((time) => row(time));
}

function replace(rows, time, overrides) {
  const index = rows.findIndex((item) => item.timestamp.includes(`T${time}:`));
  rows[index] = { ...rows[index], ...overrides };
}

test('late breakout waits for a completed retest instead of entering the first break', () => {
  const rows = enrichedSession('11:31');
  replace(rows, '09:44', { adx14: 19 });
  replace(rows, '09:45', { open: 109, high: 114, low: 108, close: 113, ema9: 108, ema22: 104, adx14: 21 });
  replace(rows, '09:46', { open: 114, high: 116, low: 114, close: 115, ema9: 109, ema22: 105, adx14: 22 });
  replace(rows, '09:47', { open: 113, high: 115, low: 111, close: 114, ema9: 110, ema22: 106, adx14: 23 });
  const result = detectOpportunityFromEnriched(rows, 'late-breakout-retest');
  assert.equal(result.status, 'SIGNAL');
  assert.equal(result.signalTime, '2026-01-02T09:47:00+05:30');
  assert.equal(result.optionType, 'CE');
});

test('VWAP pullback requires trend re-acceptance on a completed candle', () => {
  const rows = enrichedSession('13:31');
  replace(rows, '09:45', { open: 107, high: 108, low: 103, close: 105, ema9: 106, ema22: 103, vwap: 104, adx14: 24 });
  replace(rows, '09:46', { open: 106, high: 113, low: 105, close: 112, ema9: 108, ema22: 104, vwap: 105, adx14: 25 });
  const result = detectOpportunityFromEnriched(rows, 'vwap-trend-pullback');
  assert.equal(result.status, 'SIGNAL');
  assert.equal(result.signalTime, '2026-01-02T09:46:00+05:30');
  assert.equal(result.optionType, 'CE');
});

test('failed opening-range high produces a put signal only after close returns inside', () => {
  const rows = enrichedSession('12:31');
  replace(rows, '09:45', { open: 113, high: 115, low: 107, close: 108, adx14: 22 });
  const result = detectOpportunityFromEnriched(rows, 'failed-opening-range-break');
  assert.equal(result.status, 'SIGNAL');
  assert.equal(result.optionType, 'PE');
  assert.equal(result.signalTime, '2026-01-02T09:45:00+05:30');
});

test('afternoon breakout is rejected unless the midday range is compressed', () => {
  const rows = enrichedSession();
  for (const item of rows) {
    const time = item.timestamp.slice(11, 16);
    if (time >= '11:00' && time < '13:15') Object.assign(item, { open: 106, high: 110, low: 104, close: 106 });
  }
  replace(rows, '13:14', { close: 108, ema9: 107, ema22: 105, adx14: 20 });
  replace(rows, '13:15', { open: 109, high: 114, low: 108, close: 113, ema9: 109, ema22: 106, adx14: 22 });
  const result = detectOpportunityFromEnriched(rows, 'afternoon-compression-breakout');
  assert.equal(result.status, 'SIGNAL');
  assert.equal(result.optionType, 'CE');
  assert.ok(result.evidence.compressionRatio <= DEFAULT_RULES.maximumCompressionRatio);
});

test('indicator values for known candles do not change when future candles are appended', () => {
  const candles = times('09:15', '10:00').map((time, index) => row(time, {
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    ema9: undefined,
    ema22: undefined,
    adx14: undefined,
    vwap: undefined,
    vwapMode: undefined,
  }));
  const prefix = enrichIndicators(candles.slice(0, 35));
  const full = enrichIndicators(candles);
  assert.deepEqual(prefix, full.slice(0, 35));
});

test('option entry uses next bar and same-bar ambiguity is resolved stop-first', () => {
  const candles = [
    row('09:45', { open: 175, high: 185, low: 174, close: 182 }),
    row('09:46', { open: 180, high: 225, low: 155, close: 200 }),
    row('15:20', { open: 210, high: 212, low: 208, close: 211 }),
  ];
  const result = evaluateOptionPosition(candles, candles[0].timestamp);
  assert.equal(result.entryTime, candles[1].timestamp);
  assert.equal(result.result, 'STOP');
  assert.equal(result.exit, 160);
  assert.equal(result.ambiguousBar, true);
});

test('duplicate provider timestamps are merged before selecting the next entry bar', () => {
  const candles = normalizeCandles([
    ['2024-01-01 09:45:00', 180, 185, 178, 182, 1000, 10000],
    ['2024-01-01 09:45:00', 181, 188, 176, 184, 1200, 10100],
    ['2024-01-01 09:46:00', 185, 190, 184, 189, 900, 10200],
    ['2024-01-01 15:20:00', 190, 192, 189, 191, 800, 9900],
  ]);
  assert.equal(candles.length, 3);
  assert.deepEqual(candles[0], {
    timestamp: '2024-01-01T09:45:00+05:30',
    open: 180,
    high: 188,
    low: 176,
    close: 184,
    volume: 1200,
    openInterest: 10100,
  });
  const result = evaluateOptionPosition(candles, candles[0].timestamp);
  assert.equal(result.entryTime, '2024-01-01T09:46:00+05:30');
});

test('integrity gate rejects a same-candle look-ahead entry', () => {
  const signalTime = '2026-01-02T09:45:00+05:30';
  const document = {
    schemaVersion: 1,
    strategy: 'failed-opening-range-break',
    period: { startDate: '2026-01-02', endDate: '2026-01-02' },
    rules: DEFAULT_RULES,
    executionModel: { lotSize: null },
    summary: { observedSessions: 1, trades: 1 },
    results: [{
      date: '2026-01-02', status: 'TRADE', entry: 180, exit: 220, pnlPerUnit: 40,
      entryTime: signalTime, exitTime: '2026-01-02T10:00:00+05:30',
      signal: { strategy: 'failed-opening-range-break', optionType: 'CE', signalTime },
      selection: { contract: { optionType: 'CE', signalPremium: 180 } },
    }],
  };
  const report = validateOpportunityResult(document);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((message) => message.includes('non-causal entry')));
});

test('lot size is derived from expiry across transition periods', () => {
  assert.equal(niftyLotSizeForExpiry('2021-07-29'), 75);
  assert.equal(niftyLotSizeForExpiry('2021-08-05'), 50);
  assert.equal(niftyLotSizeForExpiry('2024-04-25'), 50);
  assert.equal(niftyLotSizeForExpiry('2024-05-02'), 25);
  assert.equal(niftyLotSizeForExpiry('2024-12-19'), 25);
  assert.equal(niftyLotSizeForExpiry('2025-01-02'), 75);
  assert.equal(niftyLotSizeForExpiry('2025-12-23'), 75);
  assert.equal(niftyLotSizeForExpiry('2026-01-06'), 65);
});
