import fs from 'node:fs';
import path from 'node:path';
import { IRON_FLY_STRATEGY, summarizeIronFlyResults } from './iron-fly-engine.mjs';
import { validateIronFlyResult } from './iron-fly-integrity.mjs';

function jsonFiles(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...jsonFiles(target));
    else if (entry.name === 'result.json') output.push(target);
  }
  return output;
}

export function aggregateIronFlyDocuments(documents) {
  if (!documents.length) throw new Error('No partition result documents found');
  for (const document of documents) {
    const report = validateIronFlyResult(document);
    if (!report.valid) throw new Error(`Invalid ${document.period.startDate}..${document.period.endDate}: ${report.errors.join('; ')}`);
  }
  const ordered = [...documents].sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
  const results = ordered.flatMap((document) => document.results).sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set();
  for (const row of results) {
    if (seen.has(row.date)) throw new Error(`Overlapping partition session: ${row.date}`);
    seen.add(row.date);
  }
  return {
    schemaVersion: 1,
    consolidated: true,
    strategy: IRON_FLY_STRATEGY,
    period: { startDate: ordered[0].period.startDate, endDate: ordered.at(-1).period.endDate },
    partitions: ordered.map((document) => ({ period: document.period, summary: document.summary })),
    rules: ordered[0].rules,
    executionModel: ordered[0].executionModel,
    diagnostics: {
      apiRequests: ordered.reduce((sum, document) => sum + (document.diagnostics?.apiRequests ?? 0), 0),
      retries: ordered.reduce((sum, document) => sum + (document.diagnostics?.retries ?? 0), 0),
      cachedOptionHistories: ordered.reduce((sum, document) => sum + (document.diagnostics?.cachedOptionHistories ?? 0), 0),
    },
    summary: summarizeIronFlyResults(results),
    results,
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
  const files = jsonFiles(args.dir);
  if (args['expected-count'] && files.length !== Number(args['expected-count'])) {
    throw new Error(`Expected ${args['expected-count']} partition results, found ${files.length}`);
  }
  const consolidated = aggregateIronFlyDocuments(files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8'))));
  fs.writeFileSync(args.out, JSON.stringify(consolidated, null, 2));
  process.stdout.write(`${JSON.stringify(consolidated.summary, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('aggregate-iron-fly-results.mjs')) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

