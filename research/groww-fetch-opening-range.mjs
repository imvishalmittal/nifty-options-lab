import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://api.groww.in/v1';
export const DEFAULT_SYMBOLS = ['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'INFY'];

function addDays(dateText, days) {
  const d = new Date(`${dateText}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function chunkDateRange(startDate, endDate, chunkDays = 29) {
  if (startDate > endDate) throw new Error('startDate must be <= endDate');
  const chunks = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const candidateEnd = addDays(cursor, chunkDays);
    const chunkEnd = candidateEnd < endDate ? candidateEnd : endDate;
    chunks.push({ startDate: cursor, endDate: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

export function normalizeTimestamp(value) {
  const text = String(value).replace(' ', 'T');
  if (/([zZ]|[+-]\d\d:\d\d)$/.test(text)) return text;
  return `${text}+05:30`;
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function candlesToCsv(symbol, candles) {
  const header = 'timestamp,symbol,open,high,low,close,volume';
  const rows = candles.map((c) => [
    normalizeTimestamp(c[0]),
    symbol,
    c[1], c[2], c[3], c[4], c[5] ?? 0,
  ].map(csvCell).join(','));
  return [header, ...rows].join('\n') + '\n';
}

async function growwGet(token, endpoint, params) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-API-VERSION': '1.0',
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status === 'FAILURE') {
    const detail = body?.error?.message || JSON.stringify(body);
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${detail}`);
  }
  return body.payload ?? body;
}

export async function fetchCash5m({ token, symbol, startDate, endDate, pauseMs = 250 }) {
  const all = [];
  for (const chunk of chunkDateRange(startDate, endDate)) {
    const payload = await growwGet(token, '/historical/candles', {
      exchange: 'NSE',
      segment: 'CASH',
      groww_symbol: `NSE-${symbol}`,
      start_time: `${chunk.startDate} 09:15:00`,
      end_time: `${chunk.endDate} 15:30:00`,
      candle_interval: '5minute',
    });
    all.push(...(payload.candles ?? []));
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }

  const byTimestamp = new Map();
  for (const candle of all) byTimestamp.set(normalizeTimestamp(candle[0]), candle);
  return [...byTimestamp.values()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, ...rest] = item.slice(2).split('=');
    args[key] = rest.join('=');
  }
  return args;
}

function yesterdayIndia() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return addDays(`${lookup.year}-${lookup.month}-${lookup.day}`, -1);
}

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');

  const args = parseArgs(process.argv.slice(2));
  const symbols = (args.symbols || DEFAULT_SYMBOLS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const startDate = args.start || '2020-01-01';
  const endDate = args.end || yesterdayIndia();
  const outDir = args.out || 'work/groww/cash-5m';
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = { source: 'Groww', interval: '5minute', startDate, endDate, symbols: [], generatedAt: new Date().toISOString() };
  for (const symbol of symbols) {
    console.error(`Fetching ${symbol} ${startDate}..${endDate}`);
    const candles = await fetchCash5m({ token, symbol, startDate, endDate });
    const file = path.join(outDir, `${symbol}.csv`);
    fs.writeFileSync(file, candlesToCsv(symbol, candles));
    manifest.symbols.push({ symbol, candles: candles.length, file });
    console.error(`Saved ${candles.length} candles -> ${file}`);
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  process.stdout.write(JSON.stringify(manifest, null, 2));
}

if (process.argv[1]?.endsWith('groww-fetch-opening-range.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
