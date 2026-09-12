import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DAY_MS = 86_400_000;

export function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...value] = arg.slice(2).split('='); return [key, value.join('=')];
  }));
}

export function bhavcopyUrl(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `https://nsearchives.nseindia.com/content/historical/DERIVATIVES/${year}/${month}/fo${day}${month}${year}bhav.csv.zip`;
}

function parseCsvLine(line) {
  const out = []; let current = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { out.push(current.trim()); current = ''; }
    else current += char;
  }
  out.push(current.trim()); return out;
}

function expiryIso(value) {
  const parsed = Date.parse(String(value).replace(/-/g, ' '));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

export function parseNiftyFuturesCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift()).map((value) => value.toUpperCase());
  const index = Object.fromEntries(headers.map((value, i) => [value, i]));
  return lines.flatMap((line) => {
    const row = parseCsvLine(line);
    if (row[index.INSTRUMENT] !== 'FUTIDX' || row[index.SYMBOL] !== 'NIFTY') return [];
    const expiry = expiryIso(row[index.EXPIRY_DT]);
    const open = Number(row[index.OPEN]);
    const settle = Number(row[index.SETTLE_PR] ?? row[index.CLOSE]);
    return expiry && Number.isFinite(open) && Number.isFinite(settle) ? [{ expiry, open, settle }] : [];
  });
}

export function parseNiftyOptionsCsv(csv, { date, spot, minimumDte = 7, maximumDte = 50 } = {}) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift()).map((value) => value.toUpperCase());
  const index = Object.fromEntries(headers.map((value, i) => [value, i]));
  return lines.flatMap((line) => {
    const row = parseCsvLine(line);
    if (row[index.INSTRUMENT] !== 'OPTIDX' || row[index.SYMBOL] !== 'NIFTY') return [];
    const expiry = expiryIso(row[index.EXPIRY_DT]); const strike = Number(row[index.STRIKE_PR]);
    const open = Number(row[index.OPEN]); const low = Number(row[index.LOW]); const settle = Number(row[index.SETTLE_PR] ?? row[index.CLOSE]);
    const optionType = row[index.OPTION_TYP];
    const dte = expiry && date ? (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS : null;
    if (!expiry || !['CE', 'PE'].includes(optionType) || ![strike, open, low, settle, dte].every(Number.isFinite)) return [];
    if (dte < minimumDte || dte > maximumDte || (Number.isFinite(spot) && Math.abs(strike / spot - 1) > 0.10)) return [];
    return [{ expiry, strike, optionType, open, low, settle }];
  });
}

export function normalizeYahooChart(payload) {
  const result = payload?.chart?.result?.[0]; const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) throw new Error('Yahoo returned no NIFTY daily data');
  return result.timestamp.flatMap((timestamp, i) => {
    const raw = [quote.open[i], quote.high[i], quote.low[i], quote.close[i]];
    if (raw.some((value) => value == null || !Number.isFinite(Number(value)))) return [];
    const row = { date: new Date(timestamp * 1000).toISOString().slice(0, 10), open: Number(raw[0]), high: Number(raw[1]), low: Number(raw[2]), close: Number(raw[3]) };
    return [row];
  });
}

async function fetchIndex(start, end) {
  const url = new URL('https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI');
  url.searchParams.set('period1', String(Math.floor(Date.parse(`${start}T00:00:00Z`) / 1000)));
  url.searchParams.set('period2', String(Math.floor((Date.parse(`${end}T00:00:00Z`) + DAY_MS) / 1000)));
  url.searchParams.set('interval', '1d');
  const response = await fetch(url, { headers: { 'user-agent': 'nifty-options-lab/1.0' } });
  if (!response.ok) throw new Error(`Yahoo request failed: HTTP ${response.status}`);
  return normalizeYahooChart(await response.json());
}

async function fetchContracts(date, directory, { includeOptions = false, spot = null } = {}) {
  const response = await fetch(bhavcopyUrl(date), { headers: { 'user-agent': 'nifty-options-lab/1.0' } });
  if (!response.ok) throw new Error(`NSE bhavcopy ${date} failed: HTTP ${response.status}`);
  const file = join(directory, `${date}.zip`); await writeFile(file, Buffer.from(await response.arrayBuffer()));
  const csv = execFileSync('unzip', ['-p', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { futures: parseNiftyFuturesCsv(csv), options: includeOptions ? parseNiftyOptionsCsv(csv, { date, spot }) : undefined };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.start || !args.end || !args.out) throw new Error('--start, --end and --out are required');
  const index = await fetchIndex(args.start, args.end); const directory = await mkdtemp(join(tmpdir(), 'nifty-futures-'));
  const includeOptions = args['include-options'] === 'true';
  const rows = [];
  try {
    for (const [i, day] of index.entries()) {
      let snapshot = null; let error = null;
      for (let attempt = 0; attempt < 3 && !snapshot; attempt += 1) {
        try { snapshot = await fetchContracts(day.date, directory, { includeOptions, spot: day.close }); }
        catch (caught) { error = caught; if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1))); }
      }
      rows.push({ date: day.date, index: day, contracts: snapshot?.futures ?? [], ...(includeOptions ? { options: snapshot?.options ?? [] } : {}), ...(snapshot ? {} : { error: String(error?.message ?? error) }) });
      if ((i + 1) % 25 === 0) console.error(`Downloaded ${i + 1}/${index.length} sessions`);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
  await writeFile(args.out, `${JSON.stringify({ schemaVersion: 1, source: { index: 'Yahoo Finance ^NSEI', futures: 'Official NSE derivatives bhavcopy' }, period: { start: args.start, end: args.end }, rows }, null, 2)}\n`);
  console.log(JSON.stringify({ out: args.out, sessions: rows.length, complete: rows.filter((row) => row.contracts.length).length }, null, 2));
}

if (process.argv[1]?.endsWith('download-nse-futures-history.mjs')) main().catch((error) => { console.error(error.stack ?? error); process.exit(1); });
