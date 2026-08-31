import fs from 'node:fs';
import { calculateLongOptionRoundTripCosts } from '../groww-option-costs.mjs';
import { MORNING_TEA_RULES, MORNING_TEA_UNIVERSE, evaluateLongOption, qualifiesOpeningMover, rankOpeningMovers, summarizeMorningTea } from './engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const INSTRUMENTS_URL = 'https://growwapi-assets.groww.in/instruments/instrument.csv';
let lastRequestAt = 0;
let requestCount = 0;
let retryCount = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const addDays = (text, days) => { const date = new Date(`${text}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const dateOf = (timestamp) => String(timestamp).slice(0, 10);

async function get(token, endpoint, params) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const wait = Math.max(0, 1700 - (Date.now() - lastRequestAt));
    if (wait) await sleep(wait);
    lastRequestAt = Date.now(); requestCount += 1;
    const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < 7) {
      retryCount += 1; await sleep(Math.min(5000 * (2 ** attempt), 60000)); continue;
    }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
}

function normalize(raw = []) {
  return raw.map((row) => ({ timestamp: `${String(row[0]).replace(' ', 'T').replace(/\+05:30$/, '')}+05:30`, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5] ?? 0), openInterest: Number(row[6] ?? 0) }))
    .filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
    .toSorted((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function candles(token, segment, symbol, start, end) {
  const rows = [];
  for (let chunkStart = start; chunkStart <= end;) {
    const chunkEnd = addDays(chunkStart, 29) < end ? addDays(chunkStart, 29) : end;
    const payload = await get(token, '/historical/candles', { exchange: 'NSE', segment, groww_symbol: symbol, start_time: `${chunkStart} 09:15:00`, end_time: `${chunkEnd} 15:30:00`, candle_interval: '1minute' });
    rows.push(...(payload.candles ?? []));
    chunkStart = addDays(chunkEnd, 1);
  }
  const normalized = normalize(rows);
  return [...new Map(normalized.map((row) => [row.timestamp, row])).values()];
}

export function parseInstrumentCsv(text) {
  const lines = String(text).trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const parseLine = (line) => {
    const fields = []; let value = ''; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { fields.push(value); value = ''; }
      else value += char;
    }
    fields.push(value); return fields;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseLine(line)[index] ?? ''])));
}

export function resolveInstrumentLotSize(rows, contract) {
  const exact = rows.find((row) => row.groww_symbol === contract.symbol);
  const exactLot = Number(exact?.lot_size);
  if (exactLot > 0) return { lotSize: exactLot, source: 'instrument-exact-contract' };
  const compatible = rows.filter((row) => row.exchange === 'NSE' && row.segment === 'FNO'
      && row.underlying_symbol === contract.underlying && row.instrument_type === contract.optionType
      && Number(row.lot_size) > 0)
    .toSorted((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
  const sameOrNext = compatible.find((row) => String(row.expiry_date) >= contract.expiry) ?? compatible.at(-1);
  return sameOrNext ? { lotSize: Number(sameOrNext.lot_size), source: 'instrument-underlying-expiry' } : null;
}

async function instrumentRows(cache) {
  if (cache.instrumentRows) return cache.instrumentRows;
  const response = await fetch(INSTRUMENTS_URL, { headers: { Accept: 'text/csv' } });
  if (!response.ok) throw new Error(`Groww instrument CSV failed (${response.status})`);
  cache.instrumentRows = parseInstrumentCsv(await response.text());
  return cache.instrumentRows;
}

function groupByDate(rows) {
  const map = new Map();
  for (const row of rows) { const date = dateOf(row.timestamp); if (!map.has(date)) map.set(date, []); map.get(date).push(row); }
  return map;
}

function parseContract(value, underlying) {
  const symbol = typeof value === 'string' ? value : value?.symbol || value?.groww_symbol;
  const match = String(symbol).match(new RegExp(`^NSE-${underlying}-(\\d{2}[A-Za-z]{3}\\d{2})-(\\d+(?:\\.\\d+)?)-(CE|PE)$`));
  if (!match) return null;
  return { symbol, strike: Number(match[2]), optionType: match[3], lotSize: Number(value?.lot_size ?? value?.lotSize ?? value?.contract_lot_size) || null };
}

async function optionSelection(token, { symbol, date, spot, optionType, cache }) {
  const year = Number(date.slice(0, 4));
  const expiryKey = `${symbol}:${year}`;
  if (!cache.expiries.has(expiryKey)) {
    const payload = await get(token, '/historical/expiries', { exchange: 'NSE', underlying_symbol: symbol, year });
    cache.expiries.set(expiryKey, payload.expiries ?? []);
  }
  const expiry = cache.expiries.get(expiryKey).filter((item) => item >= date).toSorted()[0];
  if (!expiry) return { status: 'DATA_MISSING', reason: 'No non-expired stock-option expiry' };
  const contractsKey = `${symbol}:${expiry}`;
  if (!cache.contracts.has(contractsKey)) {
    const payload = await get(token, '/historical/contracts', { exchange: 'NSE', underlying_symbol: symbol, expiry_date: expiry });
    cache.contracts.set(contractsKey, payload.contracts ?? []);
  }
  const candidates = cache.contracts.get(contractsKey).map((value) => parseContract(value, symbol)).filter((row) => row?.optionType === optionType)
    .toSorted((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot) || a.strike - b.strike);
  if (!candidates.length) return { status: 'DATA_MISSING', reason: `No ${optionType} stock-option contract` };
  const contract = { ...candidates[0], underlying: symbol, expiry };
  if (!(contract.lotSize > 0)) {
    const resolved = resolveInstrumentLotSize(await instrumentRows(cache), contract);
    if (resolved) { contract.lotSize = resolved.lotSize; contract.lotSizeSource = resolved.source; }
  }
  return { status: 'SELECTED', expiry, contract };
}

function previousClose(days, date) {
  const dates = [...days.keys()].filter((item) => item < date).toSorted();
  return days.get(dates.at(-1))?.at(-1)?.close ?? null;
}

function costScenarios(trade, lotSize, date) {
  return Object.fromEntries([['normalized', 0], ['stress0_5', 0.5], ['stress1_0', 1]].map(([key, slip]) => [key, calculateLongOptionRoundTripCosts({ entryPremium: trade.entry, exitPremium: trade.exit, lotSize, tradeDate: date, slippagePointsPerLeg: slip })]));
}

export async function runMorningTea({ token, startDate, endDate }) {
  const fetchStart = addDays(startDate, -7);
  const stockDays = new Map();
  for (const symbol of MORNING_TEA_UNIVERSE) stockDays.set(symbol, groupByDate(await candles(token, 'CASH', `NSE-${symbol}`, fetchStart, endDate)));
  const dates = [...new Set([...stockDays.values()].flatMap((days) => [...days.keys()].filter((date) => date >= startDate && date <= endDate)))].toSorted();
  const results = [];
  const cache = { expiries: new Map(), contracts: new Map() };
  for (const date of dates) {
    const ranked = rankOpeningMovers(MORNING_TEA_UNIVERSE.map((symbol) => ({ symbol, previousClose: previousClose(stockDays.get(symbol), date), candle: stockDays.get(symbol).get(date)?.find((row) => row.timestamp.includes('T09:15:')) })));
    for (const [side, mover] of [['CE', ranked.gainer], ['PE', ranked.loser]]) {
      if (!mover || !qualifiesOpeningMover(mover, side)) { results.push({ date, side, status: 'NO_SIGNAL' }); continue; }
      const signal = { symbol: mover.symbol, side, rankChangePct: mover.changePct, signalTime: mover.candle.timestamp };
      const selection = await optionSelection(token, { symbol: mover.symbol, date, spot: mover.candle.close, optionType: side, cache });
      if (selection.status !== 'SELECTED') { results.push({ date, side, status: selection.status, signal, reason: selection.reason }); continue; }
      const optionRows = await candles(token, 'FNO', selection.contract.symbol, date, date);
      const trade = evaluateLongOption(optionRows);
      if (trade.status !== 'TRADE') { results.push({ date, side, ...trade, signal, selection }); continue; }
      if (!(selection.contract.lotSize > 0)) { results.push({ date, side, status: 'DATA_MISSING', signal, selection, reason: 'Provider contract lacks historical lot size' }); continue; }
      results.push({ date, side, ...trade, signal, selection, costs: costScenarios(trade, selection.contract.lotSize, date) });
    }
  }
  return { schemaVersion: 1, strategy: 'morning-tea-one-minute-proxy', rules: MORNING_TEA_RULES, universe: MORNING_TEA_UNIVERSE, period: { startDate, endDate }, results, summary: summarizeMorningTea(results), diagnostics: { requestCount, retryCount } };
}

function args(argv) { return Object.fromEntries(argv.filter((x) => x.startsWith('--')).map((x) => { const [k, ...v] = x.slice(2).split('='); return [k, v.join('=')]; })); }
if (process.argv[1]?.endsWith('groww-backtest.mjs')) {
  const input = args(process.argv.slice(2));
  runMorningTea({ token: process.env.GROWW_ACCESS_TOKEN, startDate: input.start, endDate: input.end }).then((document) => { fs.writeFileSync(input.out || 'result.json', JSON.stringify(document, null, 2)); process.stdout.write(`${JSON.stringify(document.summary)}\n`); }).catch((error) => { console.error(error.stack || error.message); process.exit(1); });
}
