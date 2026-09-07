import fs from 'node:fs';
import path from 'node:path';
import { summarizeScenario } from './remaining-option-selling-engine.mjs';

function summarize(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const scenario = (name) => summarizeScenario(trades.map((row) => row.costs[name].netPnl));
  return {
    sessions: results.length,
    signals: results.filter((row) => row.signal?.status === 'SIGNAL').length,
    trades: trades.length,
    dataMissing: results.filter((row) => row.status === 'DATA_MISSING').length,
    noTrade: results.filter((row) => row.status === 'NO_TRADE').length,
    vixFiltered: results.filter((row) => row.status === 'VIX_FILTERED').length,
    targets: trades.filter((row) => row.exitReason === 'TARGET').length,
    stops: trades.filter((row) => row.exitReason === 'STOP').length,
    timeExits: trades.filter((row) => row.exitReason === 'TIME').length,
    normalized: scenario('normalized'),
    stress0_5: scenario('stress0_5'),
    stress1_0: scenario('stress1_0'),
  };
}

export function mergeVixHighShards(documents, startDate, endDate, expectedCount = 60) {
  if (documents.length !== expectedCount) throw new Error(`Expected ${expectedCount} monthly shards, received ${documents.length}`);
  const months = new Set(documents.map((row) => row.period?.startDate?.slice(0, 7)));
  if (months.size !== expectedCount) throw new Error(`Expected ${expectedCount} unique months, received ${months.size}`);
  const results = documents.flatMap((row) => row.results).sort((a, b) => a.date.localeCompare(b.date));
  const vixRegimeCounts = {};
  for (const document of documents) {
    for (const [key, count] of Object.entries(document.vixRegimeCounts ?? {})) vixRegimeCounts[key] = (vixRegimeCounts[key] ?? 0) + count;
  }
  return {
    schemaVersion: 1,
    strategy: documents[0].strategy,
    period: { startDate, endDate },
    rules: documents[0].rules,
    vixInstrument: documents[0].vixInstrument,
    shardCount: documents.length,
    vixRegimeCounts,
    results,
    summary: summarize(results),
  };
}

if (process.argv[1]?.endsWith('merge-vix-high-opening-range-credit-shards.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const files = fs.readdirSync(arg('in')).filter((name) => name.endsWith('.json')).sort();
  const documents = files.map((name) => JSON.parse(fs.readFileSync(path.join(arg('in'), name), 'utf8')));
  const merged = mergeVixHighShards(documents, arg('start'), arg('end'), Number(arg('expected') ?? 60));
  fs.writeFileSync(arg('out'), `${JSON.stringify(merged, null, 2)}\n`);
}
