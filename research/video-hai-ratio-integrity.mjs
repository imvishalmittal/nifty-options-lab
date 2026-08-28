import fs from 'node:fs';
import { VIDEO_HAI_STRATEGY, fridayForMonday } from './video-hai-ratio-engine.mjs';

const STATUSES = new Set(['TRADE', 'NO_TRADE', 'EXCLUDED_SESSION', 'DATA_MISSING']);
const LEG_NAMES = ['lowerLong', 'middleShort', 'upperLong'];

export function validateVideoHaiResult(document) {
  const errors = [];
  const warnings = [];
  if (document?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (document?.strategy !== VIDEO_HAI_STRATEGY) errors.push(`strategy must be ${VIDEO_HAI_STRATEGY}`);
  if (!Array.isArray(document?.results) || document.results.length === 0) errors.push('results must contain observed Mondays');
  const dates = new Set();
  for (const row of document?.results ?? []) {
    if (dates.has(row.date)) errors.push(`duplicate week: ${row.date}`);
    dates.add(row.date);
    if (!STATUSES.has(row.status)) errors.push(`invalid status on ${row.date}: ${row.status}`);
    if (row.fridayDate !== fridayForMonday(row.date)) errors.push(`incorrect Friday boundary on ${row.date}`);
    if (row.expiry && row.expiry <= row.fridayDate) errors.push(`expiry is not after Friday on ${row.date}`);
    if (row.selection) {
      const { lowerLong, middleShort, upperLong } = row.selection;
      if (!LEG_NAMES.every((name) => row.selection[name]?.symbol)) errors.push(`incomplete structure on ${row.date}`);
      if (middleShort?.strike - lowerLong?.strike !== document.rules.strikeSpacingPoints) errors.push(`lower spacing mismatch on ${row.date}`);
      if (upperLong?.strike - middleShort?.strike !== document.rules.strikeSpacingPoints) errors.push(`upper spacing mismatch on ${row.date}`);
      if (lowerLong?.lots !== 1 || middleShort?.lots !== 3 || upperLong?.lots !== 2) errors.push(`1:3:2 ratio mismatch on ${row.date}`);
    }
    if (row.status === 'TRADE') {
      if (!row.entryTime.includes(`T${document.rules.entryTime}:`)) errors.push(`incorrect entry time on ${row.date}`);
      if (!(row.exitTime > row.entryTime) || row.exitTime.slice(0, 10) > row.fridayDate) errors.push(`non-causal or late exit on ${row.date}`);
      if (Math.abs(row.grossPnlRupees - row.pnlPoints * row.lotSize) > 1e-8) errors.push(`gross P&L mismatch on ${row.date}`);
      if (!(row.maximumExpiryLossPoints >= 0)) errors.push(`invalid defined-risk loss on ${row.date}`);
      for (const scenario of ['normalized', 'stress0_5', 'stress1_0']) {
        const cost = row.costs?.[scenario];
        if (!Number.isFinite(cost?.netPnl)) errors.push(`missing ${scenario} net P&L on ${row.date}`);
        if (!LEG_NAMES.every((name) => Number.isFinite(cost?.legs?.[name]?.netPnl))) errors.push(`incomplete ${scenario} leg costs on ${row.date}`);
      }
    }
  }
  if (document?.summary?.observedMondays !== document?.results?.length) errors.push('summary observedMondays does not match results');
  const missing = (document?.results ?? []).filter((row) => row.status === 'DATA_MISSING').length;
  if (missing) warnings.push(`${missing} week(s) have missing data`);
  return { valid: errors.length === 0, errors, warnings };
}

function args(argv) {
  return Object.fromEntries(argv.filter((x) => x.startsWith('--')).map((x) => { const [k, ...v] = x.slice(2).split('='); return [k, v.join('=')]; }));
}

if (process.argv[1]?.endsWith('video-hai-ratio-integrity.mjs')) {
  try {
    const options = args(process.argv.slice(2));
    if (!options.in) throw new Error('--in is required');
    const report = validateVideoHaiResult(JSON.parse(fs.readFileSync(options.in, 'utf8')));
    if (options.out) fs.writeFileSync(options.out, JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.valid) process.exitCode = 1;
  } catch (error) { console.error(error.stack || error.message); process.exit(1); }
}
