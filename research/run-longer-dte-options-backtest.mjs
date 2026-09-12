import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { backtestLongerDteOptions } from './longer-dte-options-engine.mjs';
import { backtestPositionalFutures } from './positional-futures-engine.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => { const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')]; }));
if (!args.in || !args.out) throw new Error('--in and --out are required');
const files = (await readdir(args.in)).filter((file) => file.endsWith('.json')).sort();
const payloads = await Promise.all(files.map(async (file) => JSON.parse(await readFile(resolve(args.in, file), 'utf8'))));
const rows = payloads.flatMap((payload) => payload.rows ?? []);
const options = { startDate: args.start ?? '2016-01-01', endDate: args.end ?? '2022-12-31' };
const p2 = backtestLongerDteOptions(rows, options);
const p6 = backtestLongerDteOptions(rows, { ...options, premiumStop: true });
const p1 = backtestPositionalFutures(rows, options);
const result = { schemaVersion: 1, period: options, p2, p6, p4: { study: 'P4 same-signal futures-versus-options expression comparison', signalIdentity: 'Both engines import the same addIndicators and desiredDirection implementation', futures: p1.summary, longerDteOptions: p2.summary } };
await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ out: args.out, p2: p2.summary, p6: p6.summary, p4: result.p4 }, null, 2));
