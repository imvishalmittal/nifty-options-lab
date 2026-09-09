import fs from 'node:fs';
import path from 'node:path';
import { summarizePairedTrades, summarizeProfitOnly } from './groww-profit-only-directional-backtest.mjs';

export function mergeProfitOnlyShards(documents, startDate, endDate, expected = 60) {
  if (documents.length !== expected) throw new Error(`Expected ${expected} shards, received ${documents.length}`);
  const months = new Set(documents.map((document) => document.period?.startDate?.slice(0, 7)));
  if (months.size !== expected) throw new Error(`Expected ${expected} unique months, received ${months.size}`);
  const keys = Object.keys(documents[0]?.variants ?? {}).sort();
  if (![2, 4, 8, 15, 25].includes(keys.length)) throw new Error(`Expected 2, 4, 8, 15, or 25 configurations, received ${keys.length}`);
  for (const document of documents) {
    if (JSON.stringify(Object.keys(document.variants ?? {}).sort()) !== JSON.stringify(keys)) {
      throw new Error(`Variant mismatch ${document.period?.startDate}`);
    }
  }
  const paired = documents[0].methodology?.tradeBothSides === true;
  return {
    schemaVersion: 1,
    study: documents[0].study,
    period: { startDate, endDate },
    methodology: documents[0].methodology,
    shardCount: documents.length,
    sessions: documents.flatMap((document) => document.sessions ?? []).sort((a, b) => a.date.localeCompare(b.date)),
    variants: Object.fromEntries(keys.map((key) => {
      const trades = documents.flatMap((document) => document.variants[key].trades ?? [])
        .sort((a, b) => a.date.localeCompare(b.date) || a.signalTime.localeCompare(b.signalTime) || a.side.localeCompare(b.side));
      return [key, {
        summary: summarizeProfitOnly(trades),
        ...(paired ? { paired: summarizePairedTrades(trades) } : {}),
        directionalLossTrades: trades.filter((trade) => trade.pnlPerUnit < 0).length,
        trades,
      }];
    })),
  };
}

if (process.argv[1]?.endsWith('merge-profit-only-directional-shards.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const documents = fs.readdirSync(arg('in')).filter((name) => name.endsWith('.json')).sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(arg('in'), name), 'utf8')));
  fs.writeFileSync(arg('out'), `${JSON.stringify(mergeProfitOnlyShards(documents, arg('start'), arg('end'), Number(arg('expected') || 60)), null, 2)}\n`);
}
