import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPeadSignal, peadDriftWindow, selectPeadExpiry, standardizedUnexpectedEarnings } from '../research/pead-signal.mjs';

const sessions = Array.from({ length: 40 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 7, 3 + index));
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
});

test('uses explicitly named analyst-estimate dispersion for SUE', () => {
  assert.equal(standardizedUnexpectedEarnings({ actualEps: 12, consensusEstimateEps: 10, analystEstimateDispersion: 1 }), 2);
  assert.equal(standardizedUnexpectedEarnings({ actualEps: 12, consensusEstimateEps: 10, analystEstimateDispersion: 0 }), null);
});

test('classifies only two-sigma surprises', () => {
  assert.equal(classifyPeadSignal({ actualEps: 12, consensusEstimateEps: 10, analystEstimateDispersion: 1 }).direction, 'CE');
  assert.equal(classifyPeadSignal({ actualEps: 8, consensusEstimateEps: 10, analystEstimateDispersion: 1 }).direction, 'PE');
  assert.equal(classifyPeadSignal({ actualEps: 11, consensusEstimateEps: 10, analystEstimateDispersion: 1 }).status, 'NO_TRADE');
});

test('a pre-open release may use that open but an intraday or after-close release waits for the next session', () => {
  const unique = [...new Set(sessions)];
  const date = unique[2];
  const next = unique[3];
  assert.equal(peadDriftWindow({ announcementTimestamp: `${date}T08:00:00+05:30`, tradingSessions: unique }).entryDate, date);
  assert.equal(peadDriftWindow({ announcementTimestamp: `${date}T12:00:00+05:30`, tradingSessions: unique }).entryDate, next);
  assert.equal(peadDriftWindow({ announcementTimestamp: `${date}T18:00:00+05:30`, tradingSessions: unique }).entryDate, next);
});

test('uses the supplied exchange-session calendar and requires a complete 20-session window', () => {
  const unique = [...new Set(sessions)];
  const result = peadDriftWindow({ announcementTimestamp: `${unique[0]}T18:00:00+05:30`, tradingSessions: unique });
  assert.equal(result.targetExitDate, unique[21]);
  assert.equal(peadDriftWindow({ announcementTimestamp: `${unique.at(-2)}T18:00:00+05:30`, tradingSessions: unique }).status, 'INSUFFICIENT_DATA');
});

test('expiry must cover the entire drift window', () => {
  assert.equal(selectPeadExpiry(['2026-08-27', '2026-09-24'], '2026-09-01'), '2026-09-24');
  assert.equal(selectPeadExpiry(['2026-08-27'], '2026-09-01'), null);
});
