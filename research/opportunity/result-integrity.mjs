import fs from 'node:fs';
import { BACKTEST_STRATEGIES, timestampTime } from './opportunity-engine.mjs';

const VALID_STATUSES = new Set(['TRADE', 'NO_SIGNAL', 'NO_TRADE', 'EXCLUDED_SESSION', 'DATA_MISSING', 'CANDIDATE_BOUNDARY']);

export function validateOpportunityResult(document) {
  const errors = [];
  const warnings = [];
  if (document?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!BACKTEST_STRATEGIES.includes(document?.strategy)) errors.push(`unknown strategy: ${document?.strategy}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document?.period?.startDate ?? '')) errors.push('invalid period.startDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document?.period?.endDate ?? '')) errors.push('invalid period.endDate');
  if (!Array.isArray(document?.results) || document.results.length === 0) errors.push('results must contain at least one observed session');
  const dates = new Set();
  for (const row of document?.results ?? []) {
    if (dates.has(row.date)) errors.push(`duplicate session: ${row.date}`);
    dates.add(row.date);
    if (row.date < document.period.startDate || row.date > document.period.endDate) errors.push(`session outside period: ${row.date}`);
    if (!VALID_STATUSES.has(row.status)) errors.push(`invalid status on ${row.date}: ${row.status}`);
    if (row.signal && row.signal.strategy !== document.strategy) errors.push(`strategy mismatch on ${row.date}`);
    if (row.signal && !['CE', 'PE'].includes(row.signal.optionType)) errors.push(`invalid signal option side on ${row.date}`);
    if (row.selection?.contract && row.signal?.optionType !== row.selection.contract.optionType) errors.push(`selected option side mismatch on ${row.date}`);
    if (row.selection?.contract && !Number.isFinite(row.selection.contract.signalPremium)) errors.push(`missing selection premium on ${row.date}`);
    if (row.status === 'TRADE') {
      if (!row.signal?.signalTime || !row.entryTime) errors.push(`trade lacks signal or entry time on ${row.date}`);
      else if (row.entryTime <= row.signal.signalTime) errors.push(`non-causal entry on ${row.date}`);
      if (!Number.isFinite(row.entry) || !Number.isFinite(row.exit) || !Number.isFinite(row.pnlPerUnit)) errors.push(`invalid trade prices on ${row.date}`);
      if (Number.isFinite(row.entry) && Number.isFinite(row.exit) && Math.abs((row.exit - row.entry) - row.pnlPerUnit) > 1e-8) errors.push(`PnL mismatch on ${row.date}`);
      if (timestampTime(row.entryTime) >= document.rules.forcedExit) errors.push(`entry at/after forced exit on ${row.date}`);
      if (document.executionModel?.lotSize > 0 || document.executionModel?.lotSize === 'auto-by-expiry') {
        for (const scenario of ['normalized', 'stress0_5', 'stress1_0']) {
          if (!Number.isFinite(row.costs?.[scenario]?.netPnl)) errors.push(`missing ${scenario} cost result on ${row.date}`);
        }
      }
    }
  }
  const missing = (document?.results ?? []).filter((row) => row.status === 'DATA_MISSING');
  const boundaries = (document?.results ?? []).filter((row) => row.status === 'CANDIDATE_BOUNDARY');
  if (missing.length) errors.push(`${missing.length} session(s) have missing data`);
  if (boundaries.length) errors.push(`${boundaries.length} session(s) hit the option-candidate boundary`);
  if (document?.summary?.observedSessions !== document?.results?.length) errors.push('summary observedSessions does not match results');
  if (document?.summary?.trades === 0) warnings.push('partition contains no executed trades');
  if ((document?.diagnostics?.vwapFallbackSessions ?? 0) > 0) warnings.push('index volume unavailable for at least one signal; causal typical-price fallback used');
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
  const report = validateOpportunityResult(document);
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('result-integrity.mjs')) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}
