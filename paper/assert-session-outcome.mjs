import fs from 'node:fs';

export const VALID_SESSION_STATUSES = new Set(['CLOSED', 'NO_TRADE', 'AMBIGUOUS']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function strikes(status, side) {
  const rows = status?.selectionAudit?.[side]?.candidatesChecked ?? [];
  return rows.map((row) => `${row.strike}:${Number.isFinite(row.premium) ? `₹${row.premium}` : 'missing'}`).join(', ') || 'n/a';
}

export function evaluatePaperOutcomes(base, confirmed) {
  const rows = [
    { thread: 'BASE', ...base },
    { thread: 'V4/V5', ...confirmed },
  ];
  const dates = new Set(rows.map((row) => row.date).filter(Boolean));
  const dateConsistent = dates.size === 1;
  const invalid = rows.filter((row) => !VALID_SESSION_STATUSES.has(row.status));
  return {
    ok: dateConsistent && invalid.length === 0,
    dateConsistent,
    invalid,
    rows,
  };
}

export function markdownSummary(evaluation) {
  const lines = [
    '## NIFTY paper-session outcome',
    '',
    '| Thread | Date | Status | Trades | Reason |',
    '|---|---|---|---:|---|',
  ];
  for (const row of evaluation.rows) {
    lines.push(`| ${row.thread} | ${row.date ?? 'unknown'} | ${row.status ?? 'UNKNOWN'} | ${row.trades?.length ?? 0} | ${String(row.reason ?? '').replaceAll('|', '\\|')} |`);
  }
  lines.push('', '### Contract-selection audit', '');
  for (const row of evaluation.rows) {
    lines.push(`- **${row.thread} CE:** ${strikes(row, 'ce')}`);
    lines.push(`- **${row.thread} PE:** ${strikes(row, 'pe')}`);
  }
  if (!evaluation.dateConsistent) lines.push('', '> Base and confirmed threads do not describe the same session date.');
  if (evaluation.invalid.length) lines.push('', `> Incomplete data status: ${evaluation.invalid.map((row) => `${row.thread}=${row.status ?? 'UNKNOWN'}`).join(', ')}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const basePath = process.env.PAPER_STATUS_PATH || 'public/paper/session-status.json';
  const confirmedPath = process.env.V4_STATUS_PATH || 'public/paper/v4-session-status.json';
  const evaluation = evaluatePaperOutcomes(readJson(basePath), readJson(confirmedPath));
  const summary = markdownSummary(evaluation);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
  if (!evaluation.ok) {
    throw new Error('Paper workflow produced an incomplete or inconsistent session; diagnostics were persisted but this run is not healthy');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
