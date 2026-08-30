import fs from 'node:fs';

export function validateMorningTea(document) {
  const errors = [];
  if (document?.strategy !== 'morning-tea-one-minute-proxy') errors.push('wrong strategy identifier');
  if (!Array.isArray(document?.results) || !document.results.length) errors.push('no observed results');
  for (const row of document?.results ?? []) {
    if (row.status === 'TRADE') {
      if (!(row.entryTime > row.signal?.signalTime)) errors.push(`non-causal entry on ${row.date} ${row.side}`);
      for (const key of ['normalized', 'stress0_5', 'stress1_0']) if (!Number.isFinite(row.costs?.[key]?.netPnl)) errors.push(`missing ${key} costs on ${row.date} ${row.side}`);
    }
  }
  const sessions = new Set((document?.results ?? []).map((row) => row.date)).size;
  const missing = new Set((document?.results ?? []).filter((row) => row.status === 'DATA_MISSING').map((row) => row.date)).size;
  const missingRate = sessions ? missing / sessions : 1;
  if (missingRate > 0.02) errors.push(`missing-data rate ${(missingRate * 100).toFixed(2)}% exceeds 2%`);
  return { valid: errors.length === 0, errors, missingRate };
}

if (process.argv[1]?.endsWith('integrity.mjs')) {
  const input = process.argv.find((x) => x.startsWith('--in='))?.slice(5) || 'result.json';
  const output = process.argv.find((x) => x.startsWith('--out='))?.slice(6) || 'integrity.json';
  const report = validateMorningTea(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, JSON.stringify(report, null, 2)); process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}
