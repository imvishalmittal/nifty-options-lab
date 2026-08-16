import test from 'node:test';
import assert from 'node:assert/strict';
import { candlesToCsv, chunkDateRange, normalizeTimestamp } from '../research/groww-fetch-opening-range.mjs';

test('chunkDateRange stays within Groww 30-day limit and covers range without overlap', () => {
  assert.deepEqual(chunkDateRange('2026-01-01', '2026-03-05'), [
    { startDate: '2026-01-01', endDate: '2026-01-30' },
    { startDate: '2026-01-31', endDate: '2026-03-01' },
    { startDate: '2026-03-02', endDate: '2026-03-05' },
  ]);
});

test('normalizeTimestamp marks Groww local timestamps as India time', () => {
  assert.equal(normalizeTimestamp('2026-08-14T09:15:00'), '2026-08-14T09:15:00+05:30');
  assert.equal(normalizeTimestamp('2026-08-14 09:20:00'), '2026-08-14T09:20:00+05:30');
  assert.equal(normalizeTimestamp('2026-08-14T09:25:00+05:30'), '2026-08-14T09:25:00+05:30');
});

test('candlesToCsv emits backtester-compatible columns', () => {
  const csv = candlesToCsv('RELIANCE', [
    ['2026-08-14T09:15:00', 100, 102, 99, 101, 12345, null],
  ]);
  assert.equal(csv, [
    'timestamp,symbol,open,high,low,close,volume',
    '2026-08-14T09:15:00+05:30,RELIANCE,100,102,99,101,12345',
    '',
  ].join('\n'));
});
