import fs from 'node:fs';
import { ENTRY_RELATIVE_VARIANTS } from './nifty-180-entry-relative.mjs';

const close = (left, right, tolerance = 1e-6) => Math.abs(Number(left) - Number(right)) <= tolerance;

export function validateEntryRelativeResult(document) {
  const errors = [];
  if (document?.strategy !== 'nifty-180-entry-relative-risk') errors.push('unexpected strategy');
  for (const variant of ENTRY_RELATIVE_VARIANTS) {
    const rows = document?.variants?.[variant.id]?.trades;
    if (!Array.isArray(rows)) {
      errors.push(`${variant.id}: missing trades array`);
      continue;
    }
    const dates = new Set();
    for (const row of rows) {
      if (dates.has(row.date)) errors.push(`${variant.id} ${row.date}: duplicate session`);
      dates.add(row.date);
      if (!(row.entryTime > row.signalTime)) errors.push(`${variant.id} ${row.date}: entry is not after signal`);
      if (!(row.exitTime >= row.entryTime)) errors.push(`${variant.id} ${row.date}: exit precedes entry`);
      if (!close(row.initialStop, row.entry - 20)) errors.push(`${variant.id} ${row.date}: initial stop is not entry - 20`);
      if (!close(row.target, row.entry + 40)) errors.push(`${variant.id} ${row.date}: target is not entry + 40`);
      if (!close(row.stopHistory?.[0]?.stop, row.initialStop)) errors.push(`${variant.id} ${row.date}: initial stop history mismatch`);
      if (!Number.isFinite(row.costs?.normalized?.netPnl)
          || !Number.isFinite(row.costs?.stress0_5?.netPnl)
          || !Number.isFinite(row.costs?.stress1_0?.netPnl)) {
        errors.push(`${variant.id} ${row.date}: missing cost stress results`);
      }
      for (const stop of row.stopHistory?.slice(1) ?? []) {
        if (stop.sourceBar && !(stop.effectiveFrom > stop.sourceBar)) {
          errors.push(`${variant.id} ${row.date}: trailing stop is not effective after its source bar`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
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
  const report = validateEntryRelativeResult(JSON.parse(fs.readFileSync(args.in, 'utf8')));
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('nifty-180-entry-relative-integrity.mjs')) main();
