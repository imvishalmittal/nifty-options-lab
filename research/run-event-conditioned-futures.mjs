import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { alignUsContext, backtestEventConditionedFutures } from './event-conditioned-futures-engine.mjs';
import { fetchYahooDaily } from './us-close-india-study.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith('--')).map((value) => { const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')]; }));
if (!args.in || !args.out) throw new Error('--in and --out are required');
const payloads = await Promise.all((await readdir(args.in)).filter((file) => file.endsWith('.json')).sort().map(async (file) => JSON.parse(await readFile(resolve(args.in, file), 'utf8'))));
const rows = payloads.flatMap((payload) => payload.rows ?? []); const start = args.start ?? '2016-01-01'; const end = args.end ?? '2022-12-31';
const [sp500, nasdaq] = await Promise.all([fetchYahooDaily('^GSPC', '2015-12-01', end), fetchYahooDaily('^IXIC', '2015-12-01', end)]);
const contexts = alignUsContext(sp500, nasdaq, rows.map((row) => row.date));
const result = backtestEventConditionedFutures(rows, contexts, { startDate: start, endDate: end });
await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify({ out: args.out, coverage: result.coverage, summary: result.summary }, null, 2));
