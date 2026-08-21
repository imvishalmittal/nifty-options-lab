import fs from 'node:fs';

export const WORKFLOWS = Object.freeze({
  late: {
    name: 'Research - NIFTY late breakout retest',
    file: 'nifty-opportunity-late-breakout.yml',
    runKey: 'late_breakout_run_id',
  },
  vwap: {
    name: 'Research - NIFTY VWAP trend pullback',
    file: 'nifty-opportunity-vwap-pullback.yml',
    runKey: 'vwap_pullback_run_id',
  },
  failed: {
    name: 'Research - NIFTY failed opening-range break',
    file: 'nifty-opportunity-failed-break.yml',
    runKey: 'failed_break_run_id',
  },
  afternoon: {
    name: 'Research - NIFTY afternoon compression breakout',
    file: 'nifty-opportunity-afternoon-breakout.yml',
    runKey: 'afternoon_breakout_run_id',
  },
  comparison: {
    name: 'Research - compare NIFTY opportunity strategies',
    file: 'nifty-opportunity-comparison.yml',
  },
});

const ORDER = ['late', 'vwap', 'failed', 'afternoon'];

export function planAdvance({ suite, completedWorkflow, conclusion, runId }) {
  if (!suite.enabled) return { action: 'ignore', suite };
  if (suite.expectedWorkflow !== completedWorkflow) return { action: 'ignore', suite };
  if (suite.expectedRunId && String(suite.expectedRunId) !== String(runId)) return { action: 'ignore', suite };

  const currentKey = Object.keys(WORKFLOWS).find((key) => WORKFLOWS[key].name === completedWorkflow);
  if (!currentKey) return { action: 'ignore', suite };

  const nextSuite = structuredClone(suite);
  nextSuite.updatedAt = new Date().toISOString();
  delete nextSuite.expectedRunId;

  if (conclusion !== 'success') {
    nextSuite.enabled = false;
    nextSuite.status = 'failed';
    nextSuite.failedWorkflow = completedWorkflow;
    nextSuite.failedRunId = Number(runId);
    return { action: 'stop', suite: nextSuite };
  }

  if (currentKey === 'comparison') {
    nextSuite.enabled = false;
    nextSuite.status = 'complete';
    nextSuite.comparisonRunId = Number(runId);
    return { action: 'complete', suite: nextSuite };
  }

  nextSuite.runs ??= {};
  nextSuite.runs[WORKFLOWS[currentKey].runKey] = String(runId);
  const index = ORDER.indexOf(currentKey);
  if (index < ORDER.length - 1) {
    const next = WORKFLOWS[ORDER[index + 1]];
    nextSuite.expectedWorkflow = next.name;
    return {
      action: 'dispatch',
      workflow: next.file,
      inputs: { scope: nextSuite.scope },
      suite: nextSuite,
    };
  }

  nextSuite.expectedWorkflow = WORKFLOWS.comparison.name;
  return {
    action: 'dispatch',
    workflow: WORKFLOWS.comparison.file,
    inputs: nextSuite.runs,
    suite: nextSuite,
  };
}

async function github(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function main() {
  const requestFile = process.env.SUITE_FILE;
  const suite = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  const plan = planAdvance({
    suite,
    completedWorkflow: process.env.COMPLETED_WORKFLOW,
    conclusion: process.env.CONCLUSION,
    runId: process.env.COMPLETED_RUN_ID,
  });
  if (plan.action === 'ignore') return;

  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const apiPath = `/repos/${owner}/${repo}/contents/${requestFile}`;
  const current = await github(`${apiPath}?ref=${encodeURIComponent(process.env.RUN_BRANCH)}`);
  await github(apiPath, {
    method: 'PUT',
    body: {
      branch: process.env.RUN_BRANCH,
      message: `Advance opportunity suite after ${process.env.COMPLETED_WORKFLOW}`,
      sha: current.sha,
      content: Buffer.from(`${JSON.stringify(plan.suite, null, 2)}\n`).toString('base64'),
    },
  });

  if (plan.action === 'dispatch') {
    await github(`/repos/${owner}/${repo}/actions/workflows/${plan.workflow}/dispatches`, {
      method: 'POST',
      body: { ref: process.env.RUN_BRANCH, inputs: plan.inputs },
    });
  }
}

if (process.argv[1]?.endsWith('chain-dispatch.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
