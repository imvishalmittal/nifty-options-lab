import fs from 'node:fs';
import path from 'node:path';
import { summarizeCloseEntryTrades } from './groww-backtest-nifty-180-close-entry-stops.mjs';

export function mergeCloseEntryStopShards(documents, startDate, endDate, expectedCount = 60) {
  if (documents.length !== expectedCount) throw new Error(`Expected ${expectedCount} shards, received ${documents.length}`);
  const months = new Set(documents.map((document) => document.period?.startDate?.slice(0, 7)));
  if (months.size !== expectedCount) throw new Error(`Expected ${expectedCount} unique months, received ${months.size}`);
  const keys = Object.keys(documents[0]?.variants ?? {}).sort();
  if (keys.length !== 10) throw new Error(`Expected 10 variants, received ${keys.length}`);
  for (const document of documents) {
    const actual = Object.keys(document.variants ?? {}).sort();
    if (JSON.stringify(actual) !== JSON.stringify(keys)) throw new Error(`Variant mismatch in ${document.period?.startDate}`);
  }
  const sessionLedger = documents.flatMap((document) => document.sessionLedger ?? []).sort((a, b) => a.date.localeCompare(b.date));
  return {
    schemaVersion: 1, study: documents[0].study, period: { startDate, endDate },
    methodology: documents[0].methodology, shardCount: documents.length, sessionLedger,
    variants: Object.fromEntries(keys.map((key) => {
      const trades = documents.flatMap((document) => document.variants[key].trades ?? []).sort((a, b) => a.date.localeCompare(b.date));
      return [key, { summary: summarizeCloseEntryTrades(trades), trades }];
    })),
  };
}

if (process.argv[1]?.endsWith('merge-nifty-180-close-entry-stop-shards.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const files = fs.readdirSync(arg('in')).filter((name) => name.endsWith('.json')).sort();
  const documents = files.map((name) => JSON.parse(fs.readFileSync(path.join(arg('in'), name), 'utf8')));
  fs.writeFileSync(arg('out'), `${JSON.stringify(mergeCloseEntryStopShards(documents, arg('start'), arg('end'), Number(arg('expected') ?? 60)), null, 2)}\n`);
}
