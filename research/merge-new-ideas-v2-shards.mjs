import fs from 'node:fs';
import path from 'node:path';

function monthKey(period) {
  if (!period?.startDate || !period?.endDate) throw new Error('Every V2 shard needs a period');
  const start = period.startDate.slice(0, 7);
  const end = period.endDate.slice(0, 7);
  if (start !== end) throw new Error(`V2 shard crosses months: ${period.startDate}..${period.endDate}`);
  return start;
}

function expectedMonths(startDate, endDate) {
  const months = [];
  const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const last = endDate.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= last) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function mergeV2Shards(documents, { startDate, endDate, expected = 60 } = {}) {
  if (documents.length !== expected) throw new Error(`Expected ${expected} V2 shards, received ${documents.length}`);
  const months = documents.map((document) => monthKey(document.period));
  if (new Set(months).size !== expected) throw new Error('V2 shards contain duplicate months');
  const requiredMonths = expectedMonths(startDate, endDate);
  if (requiredMonths.length !== expected || requiredMonths.some((month) => !months.includes(month))) {
    throw new Error('V2 shards do not exactly cover the requested period');
  }
  for (const document of documents) {
    const baseline = document?.baselineDiagnostics?.scoredTrades;
    const variant = document?.variants?.['20']?.trades?.length;
    if (!Number.isInteger(baseline) || variant !== baseline) {
      throw new Error(`V2 20-point trail lost a baseline trade in ${document.period.startDate}`);
    }
  }
  const trades = documents.flatMap((document) => document?.variants?.['20']?.trades ?? [])
    .sort((a, b) => a.date.localeCompare(b.date) || a.entryTime.localeCompare(b.entryTime));
  return {
    schemaVersion: 1,
    study: 'NIFTY ₹180 Momentum V2 20-point trail discovery host',
    period: { startDate, endDate },
    integrity: { shardCount: documents.length, uniqueMonths: new Set(months).size },
    diagnostics: documents.reduce((total, document) => {
      for (const [key, value] of Object.entries(document.baselineDiagnostics ?? {})) {
        if (Number.isFinite(value)) total[key] = (total[key] ?? 0) + value;
      }
      total.momentumRequestRetries = (total.momentumRequestRetries ?? 0)
        + (document?.momentumDiagnostics?.requestRetries ?? 0);
      return total;
    }, {}),
    trades,
  };
}

if (process.argv[1]?.endsWith('merge-new-ideas-v2-shards.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const input = arg('in');
  const documents = fs.readdirSync(input).filter((name) => name.endsWith('.json')).sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(input, name), 'utf8')));
  const result = mergeV2Shards(documents, {
    startDate: arg('start'), endDate: arg('end'), expected: Number(arg('expected') ?? 60),
  });
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result.integrity, null, 2)}\n`);
}
