import fs from 'node:fs';
import { BATMAN_LEGS, BATMAN_RULES, BATMAN_STRATEGY, evaluateBatmanPosition, selectBatmanContracts, summarizeBatmanResults } from './engine.mjs';
import { niftyLotSizeForExpiry } from '../opportunity/opportunity-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
let lastRequestAt = 0; let requests = 0; let retries = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(token, endpoint, params, spacingMs) {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt)); if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`); Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  for (let attempt = 0; attempt <= 8; attempt += 1) {
    lastRequestAt = Date.now(); requests += 1;
    const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < 8) { retries += 1; await sleep(Math.min(5000 * (2 ** attempt), 60000)); continue; }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
}

function normalize(raw = []) { return raw.map((row) => ({ timestamp: `${String(row[0]).replace(' ', 'T')}+05:30`, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) })).filter((row) => Number.isFinite(row.close)).sort((a, b) => a.timestamp.localeCompare(b.timestamp)); }
const formatDate = (value) => value.toISOString().slice(0, 10);
function plusDays(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return formatDate(value); }
function splitRange(startDate, endDate) { const output = []; for (let cursor = startDate; cursor <= endDate;) { const proposed = plusDays(cursor, 27); const end = proposed < endDate ? proposed : endDate; output.push([cursor, end]); cursor = plusDays(end, 1); } return output; }
async function candles(token, segment, symbol, startDate, endDate, spacingMs) {
  const rows = [];
  for (const [start, end] of splitRange(startDate, endDate)) {
    const payload = await apiGet(token, '/historical/candles', { exchange: 'NSE', segment, groww_symbol: symbol, start_time: `${start} 09:15:00`, end_time: `${end} 15:16:00`, candle_interval: '1minute' }, spacingMs);
    rows.push(...normalize(payload.candles ?? []));
  }
  return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
async function expiries(token, year, spacingMs) { const payload = await apiGet(token, '/historical/expiries', { exchange: 'NSE', underlying_symbol: 'NIFTY', year }, spacingMs); return payload.expiries ?? []; }
async function contracts(token, expiry, spacingMs) { const payload = await apiGet(token, '/historical/contracts', { exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry }, spacingMs); return payload.contracts ?? []; }
const dayDifference = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const quoteAt = (rows, timestamp, field) => rows.find((row) => row.timestamp === timestamp)?.[field] ?? null;
const commonLast = (legRows, cutoff) => {
  const names = BATMAN_LEGS.map(([name]) => name); const sets = names.map((name) => new Set(legRows[name].filter((row) => row.timestamp <= cutoff).map((row) => row.timestamp)));
  return [...sets[0]].filter((timestamp) => sets.every((set) => set.has(timestamp))).sort().at(-1) ?? null;
};

export async function backtestBatman({ token, startDate = '2025-01-01', endDate = '2025-12-31', spacingMs = 1600, rules = BATMAN_RULES }) {
  lastRequestAt = 0; requests = 0; retries = 0;
  const spot = await candles(token, 'CASH', 'NSE-NIFTY', startDate, endDate, spacingMs);
  const dates = [...new Set(spot.map((row) => row.timestamp.slice(0, 10)))];
  const expiryList = [];
  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)) + 1; year += 1) expiryList.push(...await expiries(token, year, spacingMs));
  const results = [];
  for (const date of dates) {
    const expiry = [...expiryList].filter((item) => { const dte = dayDifference(date, item); return dte >= rules.minimumDte && dte <= rules.maximumDte; }).sort()[0];
    if (!expiry) continue;
    const entryTimestamp = `${date}T${rules.entryTime}:00+05:30`; const entrySpot = quoteAt(spot, entryTimestamp, 'close');
    if (!(entrySpot > 0)) { results.push({ date, expiry, status: 'DATA_MISSING', reason: '15:15 NIFTY entry quote unavailable' }); continue; }
    const selection = selectBatmanContracts(await contracts(token, expiry, spacingMs), entrySpot, rules);
    if (!selection) { results.push({ date, expiry, status: 'DATA_MISSING', reason: 'Exact ordered six-leg structure unavailable' }); continue; }
    const legRows = {};
    for (const [name] of BATMAN_LEGS) legRows[name] = await candles(token, 'FNO', selection[name].symbol, date, expiry, spacingMs);
    const exitTimestamp = commonLast(legRows, `${expiry}T${rules.exitTime}:00+05:30`);
    const entryQuotes = {}; const exitQuotes = {};
    for (const [name] of BATMAN_LEGS) { entryQuotes[name] = quoteAt(legRows[name], entryTimestamp, 'close'); exitQuotes[name] = exitTimestamp ? quoteAt(legRows[name], exitTimestamp, 'close') : null; }
    const lotSize = niftyLotSizeForExpiry(expiry);
    const costs = Object.fromEntries([['normalized', 0], ['stress0_5', 0.5], ['stress1_0', 1]].map(([name, slippagePointsPerLeg]) => [name, evaluateBatmanPosition({ selection, entryQuotes, exitQuotes, lotSize, tradeDate: date, slippagePointsPerLeg })]));
    if (costs.normalized.status !== 'TRADE') { results.push({ date, expiry, status: 'DATA_MISSING', reason: costs.normalized.reason, selection }); continue; }
    results.push({ date, expiry, status: 'TRADE', entryTimestamp, exitTimestamp, entrySpot, lotSize, selection, entryQuotes, exitQuotes, costs });
  }
  return { schemaVersion: 1, strategy: BATMAN_STRATEGY, source: { videoId: 'SjesP4clpHM' }, period: { startDate, endDate }, rules, assumptions: { structure: 'Symmetric defined-risk +1/-2/+1 call and put butterflies', strikeSelection: 'Nearest listed strikes at 1%, 2%, and 3% OTM from the 15:15 NIFTY close', entryCalendar: 'Trading session 5-7 calendar days before expiry: Friday under Thursday expiry and Wednesday under Tuesday expiry', expiry: 'Nearest listed NIFTY expiry with 5-7 calendar DTE', exit: 'Last synchronized quote at or before expiry 15:15; no adjustments', costs: 'Twelve option-side executions with 0/0.5/1 point adverse slippage per leg' }, diagnostics: { requests, retries }, results, summary: summarizeBatmanResults(results) };
}

if (process.argv[1]?.endsWith('groww-backtest.mjs')) {
  const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => { const [key, ...value] = arg.slice(2).split('='); return [key, value.join('=')]; }));
  if (!process.env.GROWW_ACCESS_TOKEN) throw new Error('GROWW_ACCESS_TOKEN is required');
  const result = await backtestBatman({ token: process.env.GROWW_ACCESS_TOKEN, startDate: args.start, endDate: args.end, spacingMs: Number(args.spacing ?? 1600) });
  fs.writeFileSync(args.out ?? 'batman-result.json', JSON.stringify(result, null, 2)); process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
}
