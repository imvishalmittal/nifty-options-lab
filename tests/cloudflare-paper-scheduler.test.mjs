import test from 'node:test';
import assert from 'node:assert/strict';
import { dueDispatches } from '../infra/cloudflare/paper-scheduler/src/index.mjs';

function labels(iso) {
  return dueDispatches(new Date(iso)).map((row) => row.label);
}

test('dispatches primary at 08:55 IST on weekday', () => {
  assert.deepEqual(labels('2026-08-17T03:25:00Z'), ['NIFTY paper primary']);
});

test('dispatches retry at 09:10 IST on weekday', () => {
  assert.deepEqual(labels('2026-08-17T03:40:00Z'), ['NIFTY paper retry']);
});

test('does nothing between configured attempts', () => {
  assert.deepEqual(labels('2026-08-17T03:30:00Z'), []);
});

test('does nothing on weekends', () => {
  assert.deepEqual(labels('2026-08-16T03:25:00Z'), []);
  assert.deepEqual(labels('2026-08-16T03:40:00Z'), []);
});

test('dispatches the paper workflow with force disabled', () => {
  const [dispatch] = dueDispatches(new Date('2026-08-17T03:25:00Z'));
  assert.equal(dispatch.workflow, 'nifty-paper-session.yml');
  assert.deepEqual(dispatch.inputs, { force: 'false' });
});
