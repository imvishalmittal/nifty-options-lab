import fs from 'node:fs';
import path from 'node:path';
import { ENTRY_RELATIVE_VARIANTS } from './nifty-180-entry-relative.mjs';
import { summarizeEntryRelativeTrades } from './groww-backtest-nifty-180-entry-relative.mjs';
import { validateEntryRelativeResult } from './nifty-180-entry-relative-integrity.mjs';

function resultFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...resultFiles(target));
    else if (entry.name === 'result.json') files.push(target);
  }
  return files;
}

export function aggregateEntryRelative(documents) {
  if (!documents.length) throw new Error('No entry-relative result documents found');
  const ordered = [...documents].sort((left, right) => left.period.startDate.localeCompare(right.period.startDate));
  for (const document of ordered) {
    const integrity = validateEntryRelativeResult(document);
    if (!integrity.valid) throw new Error(`${document.period.startDate}: ${integrity.errors.join('; ')}`);
  }
  const variants = {};
  for (const variant of ENTRY_RELATIVE_VARIANTS) {
    const trades = ordered.flatMap((document) => document.variants[variant.id].trades)
      .sort((left, right) => left.date.localeCompare(right.date));
    const seen = new Set();
    for (const trade of trades) {
      if (seen.has(trade.date)) throw new Error(`${variant.id}: overlapping session ${trade.date}`);
      seen.add(trade.date);
    }
    variants[variant.id] = {
      label: variant.label,
      summary: summarizeEntryRelativeTrades(trades),
      trades,
    };
  }
  return {
    schemaVersion: 1,
    consolidated: true,
    strategy: 'nifty-180-entry-relative-risk',
    phase: 'discovery-2020-2024',
    period: { startDate: ordered[0].period.startDate, endDate: ordered.at(-1).period.endDate },
    rules: ordered[0].rules,
    methodology: ordered[0].methodology,
    diagnostics: {
      partitions: ordered.length,
      baselineTrades: ordered.reduce((sum, document) => sum + (document.diagnostics?.baseline?.scoredTrades ?? 0), 0),
      fullSessionFetches: ordered.reduce((sum, document) => sum + (document.diagnostics?.fullSessionFetches ?? 0), 0),
      apiRequestsBeyondBaseline: ordered.reduce((sum, document) => sum + (document.diagnostics?.apiRequestsBeyondBaseline ?? 0), 0),
      retriesBeyondBaseline: ordered.reduce((sum, document) => sum + (document.diagnostics?.retriesBeyondBaseline ?? 0), 0),
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
  if (!args.dir || !args.out) throw new Error('--dir and --out are required');
  const files = resultFiles(args.dir);
  if (args['expected-count'] && files.length !== Number(args['expected-count'])) {
    throw new Error(`Expected ${args['expected-count']} partitions, found ${files.length}`);
  }
  const output = aggregateEntryRelative(files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8'))));
  fs.writeFileSync(args.out, JSON.stringify(output, null, 2));
  process.stdout.write(`${JSON.stringify(Object.fromEntries(Object.entries(output.variants).map(([id, row]) => [id, row.summary])), null, 2)}\n`);
}

if (process.argv[1]?.endsWith('nifty-180-entry-relative-aggregate.mjs')) main();
