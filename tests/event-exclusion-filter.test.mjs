import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEventExclusion, eventDatesInHoldingInterval } from '../research/event-exclusion-filter.mjs';

test('finds events anywhere in an inclusive multi-day holding interval', () => {
  const result = { entryTimestamp: '2024-02-05T09:45:00+05:30', exitTimestamp: '2024-02-09T15:15:00+05:30' };
  assert.deepEqual(eventDatesInHoldingInterval(result, [{ date: '2024-02-08', type: 'RBI' }]), [{ date: '2024-02-08', type: 'RBI' }]);
});

test('marks malformed trades missing instead of silently retaining them', () => {
  const [row] = applyEventExclusion([{ date: '2024-01-01', status: 'TRADE' }], []);
  assert.equal(row.eventFilter.status, 'DATA_MISSING');
});

test('retains non-event trades and preserves non-trade status', () => {
  const rows = applyEventExclusion([
    { date: '2024-01-01', status: 'TRADE', entryTimestamp: '2024-01-01T09:45:00+05:30', exitTimestamp: '2024-01-02T15:15:00+05:30' },
    { date: '2024-01-03', status: 'NO_TRADE' },
  ], [{ date: '2024-01-04', type: 'RBI' }]);
  assert.equal(rows[0].eventFilter.status, 'EVENT_OPEN');
  assert.equal(rows[1].eventFilter.status, 'NO_TRADE');
});
