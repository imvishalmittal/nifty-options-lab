import test from 'node:test';
import assert from 'node:assert/strict';
import { planAdvance, WORKFLOWS } from '../research/opportunity/chain-dispatch.mjs';

function suite() {
  return {
    enabled: true,
    status: 'running',
    scope: 'discovery-2020-2024',
    expectedWorkflow: WORKFLOWS.late.name,
    runs: {},
  };
}

test('suite advances through separate strategy workflows', () => {
  const next = planAdvance({ suite: suite(), completedWorkflow: WORKFLOWS.late.name, conclusion: 'success', runId: 101 });
  assert.equal(next.action, 'dispatch');
  assert.equal(next.workflow, WORKFLOWS.vwap.file);
  assert.deepEqual(next.inputs, { scope: 'discovery-2020-2024' });
  assert.equal(next.suite.runs.late_breakout_run_id, '101');
  assert.equal(next.suite.expectedWorkflow, WORKFLOWS.vwap.name);
});

test('last strategy dispatches comparison with recorded run IDs', () => {
  const current = suite();
  current.expectedWorkflow = WORKFLOWS.afternoon.name;
  current.runs = { late_breakout_run_id: '1', vwap_pullback_run_id: '2', failed_break_run_id: '3' };
  const next = planAdvance({ suite: current, completedWorkflow: WORKFLOWS.afternoon.name, conclusion: 'success', runId: 4 });
  assert.equal(next.workflow, WORKFLOWS.comparison.file);
  assert.deepEqual(next.inputs, {
    late_breakout_run_id: '1',
    vwap_pullback_run_id: '2',
    failed_break_run_id: '3',
    afternoon_breakout_run_id: '4',
  });
});

test('failure stops the suite and unexpected workflows are ignored', () => {
  const failed = planAdvance({ suite: suite(), completedWorkflow: WORKFLOWS.late.name, conclusion: 'failure', runId: 9 });
  assert.equal(failed.action, 'stop');
  assert.equal(failed.suite.enabled, false);
  assert.equal(failed.suite.failedRunId, 9);

  const ignored = planAdvance({ suite: suite(), completedWorkflow: WORKFLOWS.vwap.name, conclusion: 'success', runId: 10 });
  assert.equal(ignored.action, 'ignore');

  const awaitingRerun = suite();
  awaitingRerun.expectedRunId = '12';
  const stale = planAdvance({ suite: awaitingRerun, completedWorkflow: WORKFLOWS.late.name, conclusion: 'failure', runId: 11 });
  assert.equal(stale.action, 'ignore');
  const rerun = planAdvance({ suite: awaitingRerun, completedWorkflow: WORKFLOWS.late.name, conclusion: 'success', runId: 12 });
  assert.equal(rerun.action, 'dispatch');
  assert.equal(rerun.suite.expectedRunId, undefined);
});
