import fs from 'node:fs';

export const TERMINAL_PAPER_STATUSES = new Set(['CLOSED', 'NO_TRADE', 'AMBIGUOUS']);

export function indiaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shouldRunPaperSession(status, date = indiaDate(), force = false) {
  if (force) return { run: true, reason: 'forced manual run' };
  if (!status || status.date !== date) return { run: true, reason: 'no terminal record for today' };
  if (!TERMINAL_PAPER_STATUSES.has(status.status)) {
    return { run: true, reason: `today is retryable (${status.status ?? 'UNKNOWN'})` };
  }
  return { run: false, reason: `today already completed with ${status.status}` };
}

function readStatus(path) {
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const statusPath = process.env.PAPER_STATUS_PATH || 'public/paper/session-status.json';
  const force = String(process.env.FORCE || '').toLowerCase() === 'true';
  const result = shouldRunPaperSession(readStatus(statusPath), indiaDate(), force);
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    fs.appendFileSync(output, `run=${result.run}\nreason=${result.reason}\n`);
  }
  console.log(JSON.stringify(result));
}

if (process.argv[1]?.endsWith('session-guard.mjs')) main();
