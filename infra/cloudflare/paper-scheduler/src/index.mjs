const OWNER = 'imvishalmittal';
const REPOSITORY = 'nifty-options-lab';
const REF = 'main';
const WORKFLOW = 'nifty-paper-session.yml';
const TIME_ZONE = 'Asia/Kolkata';
const SCHEDULER_VERSION = '2026-08-18-0920';

// Cloudflare is the primary scheduler. A spaced retry protects against a
// transient dispatch failure without changing the paper trading window.
const ATTEMPTS = new Map([
  ['09:20', 'primary'],
  ['09:23', 'retry'],
]);

function localClock(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return { weekday: values.weekday, time: `${values.hour}:${values.minute}` };
}

export function dueDispatches(timestamp) {
  const local = localClock(timestamp);
  if (local.weekday === 'Sat' || local.weekday === 'Sun') return [];
  const attempt = ATTEMPTS.get(local.time);
  if (!attempt) return [];
  return [{ workflow: WORKFLOW, inputs: { force: 'false' }, label: `NIFTY paper ${attempt}` }];
}

async function dispatchWorkflow(env, dispatch) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is not configured');
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPOSITORY}/actions/workflows/${dispatch.workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'nifty-options-lab-cloudflare-scheduler',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: REF, inputs: dispatch.inputs }),
  });
  if (response.status !== 204) {
    const body = await response.text();
    throw new Error(`GitHub dispatch failed for ${dispatch.label}: ${response.status} ${body}`);
  }
  console.log(`Dispatched ${dispatch.label} [${SCHEDULER_VERSION}]`);
}

export async function runSchedule(timestamp, env) {
  const dispatches = dueDispatches(timestamp);
  await Promise.all(dispatches.map((dispatch) => dispatchWorkflow(env, dispatch)));
  return dispatches.map(({ label }) => label);
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runSchedule(new Date(controller.scheduledTime), env));
  },
  async fetch() {
    return Response.json({ service: 'nifty-options-lab-paper-scheduler', status: 'healthy', schedulerVersion: SCHEDULER_VERSION, tokenConfigured: 'redacted' });
  },
};
