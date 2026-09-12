import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { annualPerformance, backtestPositionalFutures } from './positional-futures-engine.mjs';

function args(argv) {
  return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => {
    const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')];
  }));
}

async function main() {
  const options = args(process.argv.slice(2));
  if (!options.in || !options.out) throw new Error('--in and --out are required');
  const files = (await readdir(options.in)).filter((file) => file.endsWith('.json')).sort();
  const payloads = await Promise.all(files.map(async (file) => JSON.parse(await readFile(resolve(options.in, file), 'utf8'))));
  const rows = payloads.flatMap((payload) => payload.rows ?? []);
  const result = backtestPositionalFutures(rows, { startDate: options.start ?? '2016-01-01', endDate: options.end ?? '2022-12-31' });
  result.sources = payloads.map((payload) => payload.period);
  result.annual = annualPerformance(result.trades);
  await writeFile(options.out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ out: options.out, coverage: result.coverage, summary: result.summary, annual: result.annual }, null, 2));
}

main().catch((error) => { console.error(error.stack ?? error); process.exit(1); });
