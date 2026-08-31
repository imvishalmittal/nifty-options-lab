import fs from 'node:fs';
import path from 'node:path';
import { summarizeEntryRelativeTrades } from './groww-backtest-nifty-180-entry-relative.mjs';
import { ENTRY_RELATIVE_VARIANTS } from './nifty-180-entry-relative.mjs';

function monthKeys(startDate, endDate) {
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);
  const keys = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

const stable = (value) => JSON.stringify(value);

export function mergeEntryRelativeShards(documents, { startDate, endDate }) {
  if (!documents.length) throw new Error('No shard documents supplied');
  const expectedMonths = monthKeys(startDate, endDate);
  const byMonth = new Map();
  for (const document of documents) {
    if (document?.strategy !== 'nifty-180-entry-relative-risk') throw new Error('Unexpected shard strategy');
    const month = document?.period?.startDate?.slice(0, 7);
    if (!month || document?.period?.endDate?.slice(0, 7) !== month) throw new Error('Shard must cover exactly one calendar month');
    if (byMonth.has(month)) throw new Error(`Duplicate shard month: ${month}`);
    byMonth.set(month, document);
  }
  const actualMonths = [...byMonth.keys()].sort();
  if (stable(actualMonths) !== stable(expectedMonths)) {
    throw new Error(`Shard coverage mismatch: expected ${expectedMonths.join(',')}; received ${actualMonths.join(',')}`);
  }

  const ordered = expectedMonths.map((month) => byMonth.get(month));
  const first = ordered[0];
  for (const document of ordered.slice(1)) {
    if (stable(document.rules) !== stable(first.rules)) throw new Error('Frozen rules differ across shards');
    if (stable(document.methodology) !== stable(first.methodology)) throw new Error('Methodology differs across shards');
  }

  const variants = Object.fromEntries(ENTRY_RELATIVE_VARIANTS.map((variant) => {
    const trades = ordered.flatMap((document) => document?.variants?.[variant.id]?.trades ?? [])
      .sort((left, right) => left.date.localeCompare(right.date));
    const uniqueDates = new Set(trades.map((trade) => trade.date));
    if (uniqueDates.size !== trades.length) throw new Error(`${variant.id}: duplicate session across shards`);
    return [variant.id, {
      label: first.variants[variant.id].label,
      summary: summarizeEntryRelativeTrades(trades),
      trades,
    }];
  }));

  return {
    schemaVersion: first.schemaVersion,
    strategy: first.strategy,
    phase: 'discovery-2020-2024',
    period: { startDate, endDate },
    rules: first.rules,
    methodology: first.methodology,
    diagnostics: {
      shardCount: ordered.length,
      shards: ordered.map((document) => ({ period: document.period, diagnostics: document.diagnostics })),
      fullSessionFetches: ordered.reduce((sum, document) => sum + Number(document.diagnostics?.fullSessionFetches ?? 0), 0),
      apiRequestsBeyondBaseline: ordered.reduce((sum, document) => sum + Number(document.diagnostics?.apiRequestsBeyondBaseline ?? 0), 0),
      retriesBeyondBaseline: ordered.reduce((sum, document) => sum + Number(document.diagnostics?.retriesBeyondBaseline ?? 0), 0),
    },
    variants,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...value] = arg.slice(2).split('=');
    return [key, value.join('=')];
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out || !args.start || !args.end) throw new Error('--in, --out, --start and --end are required');
  const files = fs.readdirSync(args.in).filter((name) => name.endsWith('.json')).sort();
  const documents = files.map((name) => JSON.parse(fs.readFileSync(path.join(args.in, name), 'utf8')));
  const merged = mergeEntryRelativeShards(documents, { startDate: args.start, endDate: args.end });
  fs.writeFileSync(args.out, JSON.stringify(merged, null, 2));
  process.stdout.write(`${JSON.stringify({ shardCount: documents.length, period: merged.period })}\n`);
}

if (process.argv[1]?.endsWith('merge-nifty-180-entry-relative-shards.mjs')) main();
