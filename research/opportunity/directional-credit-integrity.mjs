import fs from 'node:fs';
import { DIRECTIONAL_CREDIT_STRATEGY } from './directional-credit-engine.mjs';
import { timestampTime } from './opportunity-engine.mjs';

const VALID_STATUSES = new Set(['TRADE', 'NO_SIGNAL', 'NO_TRADE', 'EXCLUDED_SESSION', 'DATA_MISSING']);

export function validateDirectionalCreditResult(document) {
  const errors = [];
  const warnings = [];
  if (document?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (document?.strategy !== DIRECTIONAL_CREDIT_STRATEGY) errors.push(`strategy must be ${DIRECTIONAL_CREDIT_STRATEGY}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document?.period?.startDate ?? '')) errors.push('invalid period.startDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document?.period?.endDate ?? '')) errors.push('invalid period.endDate');
  if (!Array.isArray(document?.results) || document.results.length === 0) errors.push('results must contain at least one observed session');
  const dates = new Set();
  for (const row of document?.results ?? []) {
    if (dates.has(row.date)) errors.push(`duplicate session: ${row.date}`);
    dates.add(row.date);
    if (row.date < document.period.startDate || row.date > document.period.endDate) errors.push(`session outside period: ${row.date}`);
    if (!VALID_STATUSES.has(row.status)) errors.push(`invalid status on ${row.date}: ${row.status}`);
    if (row.expiry && row.expiry <= row.date) errors.push(`expiry-day or expired structure on ${row.date}`);
    if (row.selection) {
      const { shortCall, longCall, shortPut, longPut } = row.selection;
      if (![shortCall, longCall, shortPut, longPut].every((leg) => leg?.symbol)) errors.push(`incomplete four-leg selection on ${row.date}`);
      if (longCall?.strike - shortCall?.strike !== document.rules.wingWidthPoints) errors.push(`call wing width mismatch on ${row.date}`);
      if (shortPut?.strike - longPut?.strike !== document.rules.wingWidthPoints) errors.push(`put wing width mismatch on ${row.date}`);
    }
    if (row.status === 'TRADE') {
      if (timestampTime(row.entryTime) !== document.rules.entryTime) errors.push(`incorrect entry time on ${row.date}`);
      if (!(row.exitTime > row.entryTime)) errors.push(`non-causal exit on ${row.date}`);
      if (!Number.isFinite(row.entryCredit) || !Number.isFinite(row.exitDebit) || !Number.isFinite(row.pnlPerUnit)) errors.push(`invalid spread prices on ${row.date}`);
      if (Math.abs((row.entryCredit - row.exitDebit) - row.pnlPerUnit) > 1e-8) errors.push(`PnL mismatch on ${row.date}`);
      if (!(row.maximumLossPoints > 0)) errors.push(`invalid maximum loss on ${row.date}`);
      for (const name of ['shortCall', 'longCall', 'shortPut', 'longPut']) {
        if (!Number.isFinite(row.entryQuotes?.[name]) || !Number.isFinite(row.exitQuotes?.[name])) errors.push(`missing ${name} execution on ${row.date}`);
      }
      for (const scenario of ['normalized', 'stress0_5', 'stress1_0']) {
        const cost = row.costs?.[scenario];
        if (!Number.isFinite(cost?.netPnl)) errors.push(`missing ${scenario} cost result on ${row.date}`);
        if (Object.keys(cost?.legs ?? {}).length !== 4) errors.push(`incomplete ${scenario} leg costs on ${row.date}`);
      }
    }
  }
  const missing = (document?.results ?? []).filter((row) => row.status === 'DATA_MISSING');
  if (missing.length) warnings.push(`${missing.length} session(s) have missing data; evaluate the consolidated missing-data rate before acceptance`);
  if (document?.summary?.observedSessions !== document?.results?.length) errors.push('summary observedSessions does not match results');
  if (document?.summary?.trades === 0) warnings.push('partition contains no executed trades');
  const excluded = (document?.results ?? []).filter((row) => row.status === 'EXCLUDED_SESSION');
  if (excluded.length) warnings.push(`${excluded.length} documented irregular session(s) excluded`);
  return { valid: errors.length === 0, errors, warnings };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...value] = arg.slice(2).split('=');
    return [key, value.join('=')];
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in) throw new Error('--in is required');
  const document = JSON.parse(fs.readFileSync(args.in, 'utf8'));
  const report = validateDirectionalCreditResult(document);
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('directional-credit-integrity.mjs')) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}


