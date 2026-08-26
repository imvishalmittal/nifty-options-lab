import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function tradeKey(row) { return `${row.date}|${row.strategy}|${row.trailStepPoints ?? ''}`; }

function appendRows(file, rows, strategies) {
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  payload.trades = Array.isArray(payload.trades) ? payload.trades : [];
  const keys = new Set(payload.trades.map(tradeKey));
  for (const row of rows) if (!keys.has(tradeKey(row))) { payload.trades.push(row); keys.add(tradeKey(row)); }
  payload.meta = { ...payload.meta, paperMode: true, paperStrategies: strategies, lastPaperSession: rows[0]?.date ?? payload.meta.lastPaperSession };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function statusFor(result, thread) {
  const outcome = thread === 'BASE' ? result.base : result.confirmed;
  const value = {
    updatedAt: new Date().toISOString(), date: result.date, status: outcome.status,
    reason: outcome.reason ?? null, reconstructed: true, source: 'PAPER_REPLAY',
    selectionAudit: result.selectionAudit,
  };
  if (outcome.status === 'CLOSED') value.trades = outcome.trades;
  return value;
}

export function applyReplay({ result, integrity, root = '.' }) {
  if (!integrity?.passed || !result?.complete) throw new Error('Refusing to apply an incomplete or unverified replay');
  const baseStatusPath = path.join(root, 'public/paper/session-status.json');
  const confirmedStatusPath = path.join(root, 'public/paper/v4-session-status.json');
  const currentBase = JSON.parse(fs.readFileSync(baseStatusPath, 'utf8'));
  const currentConfirmed = JSON.parse(fs.readFileSync(confirmedStatusPath, 'utf8'));
  const allowed = new Set(['DATA_BOUNDARY', 'DATA_MISSING', 'NO_SESSION', 'FAILED', 'STARTING', 'INCOMPLETE_REPLAY']);
  const alreadyApplied = currentBase.date === result.date && currentConfirmed.date === result.date
    && currentBase.reconstructed === true && currentConfirmed.reconstructed === true;
  if (alreadyApplied) return { applied: false, reason: 'replay already applied' };
  if (currentBase.date !== result.date || currentConfirmed.date !== result.date) throw new Error('Replay date does not match current paper status files');
  if (!allowed.has(currentBase.status) || !allowed.has(currentConfirmed.status)) throw new Error('Refusing to replace a terminal live paper outcome');
  appendRows(path.join(root, 'public/paper/trades.json'), result.base.trades, ['V2', 'V3-5', 'V3-10', 'V6', 'V7', 'V8']);
  appendRows(path.join(root, 'public/paper/v4-trades.json'), result.confirmed.trades, ['V4', 'V5']);
  fs.writeFileSync(baseStatusPath, `${JSON.stringify(statusFor(result, 'BASE'), null, 2)}\n`);
  fs.writeFileSync(confirmedStatusPath, `${JSON.stringify(statusFor(result, 'CONFIRMED'), null, 2)}\n`);
  const replayDir = path.join(root, 'public/paper/replays'); fs.mkdirSync(replayDir, { recursive: true });
  fs.writeFileSync(path.join(replayDir, `${result.date}.json`), `${JSON.stringify({ ...result, integrity }, null, 2)}\n`);
  return { applied: true, date: result.date, base: result.base.status, confirmed: result.confirmed.status };
}

function main() {
  const replayPath = arg('in', 'paper-replay.json'); const integrityPath = arg('integrity', 'paper-replay-integrity.json');
  const result = JSON.parse(fs.readFileSync(replayPath, 'utf8')); const integrity = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
  console.log(JSON.stringify(applyReplay({ result, integrity })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}
