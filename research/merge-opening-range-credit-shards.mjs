import fs from 'node:fs';
import path from 'node:path';
import { summarizeScenario } from './remaining-option-selling-engine.mjs';

function summarize(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const scenario = (name) => summarizeScenario(trades.map((row) => row.costs[name].netPnl));
  return { sessions: results.length, trades: trades.length, dataMissing: results.filter((row) => row.status === 'DATA_MISSING').length, normalized: scenario('normalized'), stress0_5: scenario('stress0_5'), stress1_0: scenario('stress1_0') };
}

export function mergeShards(documents, startDate, endDate) {
  if (documents.length !== 60) throw new Error(`Expected 60 monthly shards, received ${documents.length}`);
  const months = new Set(documents.map((row) => row.period.startDate.slice(0, 7)));
  if (months.size !== 60) throw new Error(`Expected 60 unique months, received ${months.size}`);
  const results = documents.flatMap((row) => row.results).sort((a, b) => a.date.localeCompare(b.date));
  return { schemaVersion: 1, strategy: 'opening-range-atm-credit-spread', period: { startDate, endDate }, rules: documents[0].rules, shardCount: documents.length, results, summary: summarize(results) };
}

if (process.argv[1]?.endsWith('merge-opening-range-credit-shards.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const input = arg('in');
  const files = fs.readdirSync(input).filter((name) => name.endsWith('.json')).sort();
  const merged = mergeShards(files.map((name) => JSON.parse(fs.readFileSync(path.join(input, name), 'utf8'))), arg('start'), arg('end'));
  fs.writeFileSync(arg('out'), JSON.stringify(merged, null, 2));
}
