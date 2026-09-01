import fs from 'node:fs';

import { PAPER_RULES, PAPER_VARIANTS } from './paper-engine.mjs';

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

export function verifyReplay(result) {
  const checks = [];
  const check = (name, passed, detail = null) => checks.push({ name, passed: Boolean(passed), ...(detail ? { detail } : {}) });
  check('schema-version', result?.schemaVersion === 1);
  check('date-format', /^\d{4}-\d{2}-\d{2}$/.test(result?.date ?? ''));
  check('replay-complete', result?.complete === true);
  check('ce-bracketed', result?.selectionAudit?.ce?.bracketed && result.selectionAudit.ce.selected);
  check('pe-bracketed', result?.selectionAudit?.pe?.bracketed && result.selectionAudit.pe.selected);
  check('threads-terminal', ['CLOSED', 'NO_TRADE'].includes(result?.base?.status) && ['CLOSED', 'NO_TRADE'].includes(result?.confirmed?.status));
  const ineligible = new Set(result?.base?.ineligibleStrategies ?? []);
  const expectedBase = result?.base?.status === 'CLOSED' ? PAPER_VARIANTS.filter((variant) => !ineligible.has(variant.id)).length : 0;
  const expectedConfirmed = result?.confirmed?.status === 'CLOSED' ? 2 : 0;
  check('base-trade-count', result?.base?.trades?.length === expectedBase, `expected=${expectedBase}`);
  check('confirmed-trade-count', result?.confirmed?.trades?.length === expectedConfirmed, `expected=${expectedConfirmed}`);
  const trades = [...(result?.base?.trades ?? []), ...(result?.confirmed?.trades ?? [])];
  check('trade-source', trades.every((row) => row.source === 'PAPER_REPLAY' && row.reconstructed === true));
  check('trade-dates', trades.every((row) => row.date === result.date));
  check('causal-times', trades.every((row) => row.entryTime > (row.niftySignalTime ?? result.base.signalTime ?? '00:00') && row.exitTime >= row.entryTime));
  check('finite-accounting', trades.every((row) => [row.entryPremium, row.exitPremium, row.grossPnl, row.charges, row.totalPnl].every(Number.isFinite)));
  check('entry-band', trades.every((row) => row.entryPremium > PAPER_RULES.initialStop && row.entryPremium < PAPER_RULES.trailActivation));
  const v8 = trades.find((row) => row.strategyVersion === 'V8');
  check('v8-relative-stop', !v8 || v8.startStopLoss === Number(Math.max(PAPER_RULES.initialStop, v8.entryPremium - 20).toFixed(2)));
  const narrow = trades.filter((row) => ['V9', 'V10', 'V11'].includes(row.strategyVersion));
  check('170-210-cohort', narrow.every((row) => row.entryPremium > 170 && row.entryPremium < 210 && row.startStopLoss === 170));
  const keys = trades.map((row) => `${row.date}|${row.strategy}|${row.trailStepPoints ?? ''}`);
  check('unique-trades', new Set(keys).size === keys.length);
  return { passed: checks.every((row) => row.passed), checks, tradeCount: trades.length };
}

function main() {
  const input = arg('in', 'paper-replay.json'); const out = arg('out', 'paper-replay-integrity.json');
  const result = JSON.parse(fs.readFileSync(input, 'utf8')); const integrity = verifyReplay(result);
  fs.writeFileSync(out, `${JSON.stringify(integrity, null, 2)}\n`);
  console.log(JSON.stringify(integrity));
  if (!integrity.passed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}
