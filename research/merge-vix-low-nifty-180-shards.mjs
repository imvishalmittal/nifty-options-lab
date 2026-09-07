import fs from 'node:fs';
import path from 'node:path';
import { summarizeTrades } from './backtest-vix-low-nifty-180.mjs';

export function mergeVixLowShards(documents, startDate, endDate, expectedCount = 60) {
  if (documents.length !== expectedCount) throw new Error(`Expected ${expectedCount} monthly shards, received ${documents.length}`);
  const months = new Set(documents.map((row) => row.period?.startDate?.slice(0, 7)));
  if (months.size !== expectedCount) throw new Error(`Expected ${expectedCount} unique months, received ${months.size}`);
  const filteredSessions = documents.flatMap((row) => row.filteredSessions).sort((a, b) => a.date.localeCompare(b.date));
  const variants = {};
  for (const key of ['V2', 'V3_10']) {
    const trades = documents.flatMap((row) => row.variants?.[key]?.trades ?? []).sort((a, b) => a.date.localeCompare(b.date));
    variants[key] = { summary: summarizeTrades(trades), trades };
  }
  const regimes = {};
  for (const document of documents) {
    for (const [key, count] of Object.entries(document.sessionCounts?.regimes ?? {})) regimes[key] = (regimes[key] ?? 0) + count;
  }
  return {
    schemaVersion: 1,
    study: documents[0].study,
    rules: documents[0].rules,
    baseMethodology: documents[0].baseMethodology,
    period: { startDate, endDate },
    vixInstrument: documents[0].vixInstrument,
    shardCount: documents.length,
    sessionCounts: {
      source: documents.reduce((sum, row) => sum + row.sessionCounts.source, 0),
      retained: documents.reduce((sum, row) => sum + row.sessionCounts.retained, 0),
      regimes,
    },
    filteredSessions,
    variants,
  };
}

if (process.argv[1]?.endsWith('merge-vix-low-nifty-180-shards.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const files = fs.readdirSync(arg('in')).filter((name) => name.endsWith('.json')).sort();
  const documents = files.map((name) => JSON.parse(fs.readFileSync(path.join(arg('in'), name), 'utf8')));
  const merged = mergeVixLowShards(documents, arg('start'), arg('end'), Number(arg('expected') ?? 60));
  fs.writeFileSync(arg('out'), `${JSON.stringify(merged, null, 2)}\n`);
}
