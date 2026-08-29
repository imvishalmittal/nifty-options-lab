import fs from 'node:fs';
import { BATMAN_LEGS, BATMAN_STRATEGY } from './engine.mjs';

export function validateBatman(document) {
  const errors = []; const warnings = [];
  if (document?.strategy !== BATMAN_STRATEGY) errors.push('incorrect strategy');
  if (document?.source?.videoId !== 'SjesP4clpHM') errors.push('incorrect source video');
  if (document?.period?.startDate !== '2025-01-01' || document?.period?.endDate !== '2025-12-31') errors.push('discovery period changed');
  if (!Array.isArray(document?.results)) errors.push('results missing');
  for (const row of document?.results ?? []) if (row.status === 'TRADE') {
    if (!(row.exitTimestamp > row.entryTimestamp)) errors.push(`${row.date}: non-causal exit`);
    if (!(row.lotSize > 0)) errors.push(`${row.date}: lot size missing`);
    for (const [name] of BATMAN_LEGS) if (!row.selection?.[name]) errors.push(`${row.date}: ${name} missing`);
    for (const scenario of ['normalized', 'stress0_5', 'stress1_0']) if (!Number.isFinite(row.costs?.[scenario]?.netPnlRupees)) errors.push(`${row.date}: ${scenario} invalid`);
  }
  const missing = (document?.results ?? []).filter((row) => row.status === 'DATA_MISSING').length; if (missing) warnings.push(`${missing} sessions missing data`);
  if (document?.summary?.trades < 20) warnings.push('Fewer than 20 trades; evidence is weak');
  return { valid: errors.length === 0, errors, warnings };
}

if (process.argv[1]?.endsWith('integrity.mjs')) { const input = process.argv.find((arg) => arg.startsWith('--in='))?.slice(5); const output = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6); const report = validateBatman(JSON.parse(fs.readFileSync(input, 'utf8'))); if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (!report.valid) process.exitCode = 1; }
