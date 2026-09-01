import fs from 'node:fs';
import { calculateOptionRoundTripCosts } from './groww-option-costs.mjs';
import { parseNiftyOptionContract } from './nifty-180-premium-strategy.mjs';
import { niftyLotSizeForExpiry } from './opportunity/opportunity-engine.mjs';
import {
  REMAINING_OPTION_SELLING_RULES,
  evaluateCreditLifecycle,
  findOpeningRangeBreak,
  selectAtmCreditSpread,
  summarizeScenario,
} from './remaining-option-selling-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const SPACING_MS = 1600;
let lastRequestAt = 0;
let requests = 0;
let retries = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(token, endpoint, params) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  for (let attempt = 0; attempt <= 8; attempt += 1) {
    const wait = Math.max(0, SPACING_MS - (Date.now() - lastRequestAt));
    if (wait) await sleep(wait);
    lastRequestAt = Date.now();
    requests += 1;
    const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < 8) {
      retries += 1;
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(5000 * 2 ** attempt, 60000));
      continue;
    }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
  throw new Error(`Groww ${endpoint} exhausted retries`);
}

function normalizeTimestamp(value) {
  const text = String(value).replace(' ', 'T');
  return /([zZ]|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}+05:30`;
}

export function normalizeCandles(raw = []) {
  return raw.map((row) => ({
    timestamp: normalizeTimestamp(row[0]), open: Number(row[1]), high: Number(row[2]),
    low: Number(row[3]), close: Number(row[4]), volume: Number(row[5] ?? 0),
  })).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchCandles(token, segment, symbol, startDate, endDate) {
  const payload = await apiGet(token, '/historical/candles', {
    exchange: 'NSE', segment, groww_symbol: symbol,
    start_time: `${startDate} 09:15:00`, end_time: `${endDate} 15:29:00`, candle_interval: '1minute',
  });
  return normalizeCandles(payload.candles ?? []);
}

async function fetchExpiries(token, year) {
  const payload = await apiGet(token, '/historical/expiries', { exchange: 'NSE', underlying_symbol: 'NIFTY', year });
  return payload.expiries ?? [];
}

async function fetchContracts(token, expiry) {
  const payload = await apiGet(token, '/historical/contracts', { exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry });
  return payload.contracts ?? [];
}

function byDate(rows) {
  const output = new Map();
  for (const row of rows) {
    const date = row.timestamp.slice(0, 10);
    if (!output.has(date)) output.set(date, []);
    output.get(date).push(row);
  }
  return output;
}

export function aggregateFiveMinute(rows) {
  const output = [];
  for (let index = 30; index + 4 < rows.length; index += 5) {
    const group = rows.slice(index, index + 5);
    const firstMinute = group[0].timestamp.slice(14, 16);
    if (Number(firstMinute) % 5 !== 0 || new Set(group.map((row) => row.timestamp.slice(0, 10))).size !== 1) continue;
    output.push({
      timestamp: group.at(-1).timestamp,
      open: group[0].open,
      high: Math.max(...group.map((row) => row.high)),
      low: Math.min(...group.map((row) => row.low)),
      close: group.at(-1).close,
    });
  }
  return output;
}

function dateDiff(left, right) { return Math.round((new Date(`${right}T00:00:00Z`) - new Date(`${left}T00:00:00Z`)) / 86400000); }
function nearestExpiry(expiries, date) { return expiries.filter((expiry) => dateDiff(date, expiry) >= 1).sort()[0] ?? null; }

function synchronizedRows(shortRows, longRows, afterTimestamp) {
  const longMap = new Map(longRows.map((row) => [row.timestamp, row]));
  return shortRows.filter((row) => row.timestamp > afterTimestamp && longMap.has(row.timestamp)).map((short) => {
    const long = longMap.get(short.timestamp);
    return {
      timestamp: short.timestamp,
      openDebit: short.open - long.open,
      highDebit: Math.max(0, short.high - long.low),
      lowDebit: Math.max(0, short.low - long.high),
      isFinal: short.timestamp.slice(11, 16) === REMAINING_OPTION_SELLING_RULES.breakout.exit,
    };
  }).filter((row) => [row.openDebit, row.highDebit, row.lowDebit].every(Number.isFinite));
}

function attachCosts({ selection, entryPrices, exitPrices, lotSize, tradeDate, slippagePointsPerLeg }) {
  const short = calculateOptionRoundTripCosts({ entryPremium: entryPrices.short, exitPremium: exitPrices.short, lotSize, tradeDate, slippagePointsPerLeg, side: 'SHORT' });
  const long = calculateOptionRoundTripCosts({ entryPremium: entryPrices.long, exitPremium: exitPrices.long, lotSize, tradeDate, slippagePointsPerLeg, side: 'LONG' });
  return { netPnl: short.netPnl + long.netPnl, charges: short.charges.total + long.charges.total, legs: { short, long }, width: Math.abs(selection.short.strike - selection.long.strike) };
}

function summarize(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const scenario = (name) => summarizeScenario(trades.map((row) => row.costs[name].netPnl));
  return {
    sessions: results.length,
    signals: results.filter((row) => row.signal?.status === 'SIGNAL').length,
    trades: trades.length,
    dataMissing: results.filter((row) => row.status === 'DATA_MISSING').length,
    noTrade: results.filter((row) => row.status === 'NO_TRADE').length,
    targets: trades.filter((row) => row.exitReason === 'TARGET').length,
    stops: trades.filter((row) => row.exitReason === 'STOP').length,
    timeExits: trades.filter((row) => row.exitReason === 'TIME').length,
    normalized: scenario('normalized'), stress0_5: scenario('stress0_5'), stress1_0: scenario('stress1_0'),
  };
}

export async function backtestOpeningRangeCredit({ token, startDate, endDate }) {
  requests = 0; retries = 0; lastRequestAt = 0;
  const spot = await fetchCandles(token, 'CASH', 'NSE-NIFTY', startDate, endDate);
  const sessions = byDate(spot);
  const years = [...new Set([Number(startDate.slice(0, 4)), Number(endDate.slice(0, 4)), Number(endDate.slice(0, 4)) + 1])];
  const expiries = [];
  for (const year of years) expiries.push(...await fetchExpiries(token, year));
  const contractCache = new Map();
  const results = [];
  for (const [date, rows] of sessions) {
    const signal = findOpeningRangeBreak(rows, aggregateFiveMinute(rows));
    if (signal.status !== 'SIGNAL') { results.push({ date, status: signal.status, signal, reason: signal.reason }); continue; }
    const entryRow = rows.find((row) => row.timestamp > signal.confirmationTimestamp);
    if (!entryRow) { results.push({ date, status: 'DATA_MISSING', signal, reason: 'Causal underlying entry bar unavailable' }); continue; }
    const expiry = nearestExpiry([...new Set(expiries)], date);
    if (!expiry) { results.push({ date, status: 'DATA_MISSING', signal, reason: 'Eligible expiry unavailable' }); continue; }
    if (!contractCache.has(expiry)) contractCache.set(expiry, (await fetchContracts(token, expiry)).map(parseNiftyOptionContract).filter(Boolean));
    const selection = selectAtmCreditSpread(contractCache.get(expiry), entryRow.open, signal.direction);
    if (!selection) { results.push({ date, status: 'DATA_MISSING', signal, expiry, reason: 'Exact ATM and 300-point hedge unavailable' }); continue; }
    const [shortRows, longRows] = await Promise.all([
      fetchCandles(token, 'FNO', selection.short.symbol, date, date),
      fetchCandles(token, 'FNO', selection.long.symbol, date, date),
    ]);
    const shortMap = new Map(shortRows.map((row) => [row.timestamp, row]));
    const longMap = new Map(longRows.map((row) => [row.timestamp, row]));
    const entryTimestamp = [...shortMap.keys()].filter((timestamp) => timestamp > signal.confirmationTimestamp && longMap.has(timestamp)).sort()[0];
    if (!entryTimestamp) { results.push({ date, status: 'DATA_MISSING', signal, expiry, selection, reason: 'Synchronized next-minute entry unavailable' }); continue; }
    const entryPrices = { short: shortMap.get(entryTimestamp).open, long: longMap.get(entryTimestamp).open };
    const entryCredit = entryPrices.short - entryPrices.long;
    const observations = synchronizedRows(shortRows, longRows, entryTimestamp);
    const exit = evaluateCreditLifecycle({ entryCredit, observations });
    if (exit.status !== 'EXIT') { results.push({ date, status: exit.status, signal, expiry, selection, entryTimestamp, entryPrices, entryCredit, reason: exit.reason }); continue; }
    const exitPrices = { short: shortMap.get(exit.timestamp)?.open, long: longMap.get(exit.timestamp)?.open };
    if (![exitPrices.short, exitPrices.long].every(Number.isFinite)) { results.push({ date, status: 'DATA_MISSING', signal, expiry, selection, reason: 'Exit prices unavailable' }); continue; }
    const lotSize = niftyLotSizeForExpiry(expiry);
    const costs = Object.fromEntries([['normalized', 0], ['stress0_5', 0.5], ['stress1_0', 1]].map(([name, slippagePointsPerLeg]) => [name, attachCosts({ selection, entryPrices, exitPrices, lotSize, tradeDate: date, slippagePointsPerLeg })]));
    results.push({ date, status: 'TRADE', signal, expiry, selection, entryTimestamp, entryPrices, entryCredit, exitTimestamp: exit.timestamp, thresholdTimestamp: exit.thresholdTimestamp ?? null, exitReason: exit.reason, ambiguous: Boolean(exit.ambiguous), exitPrices, lotSize, costs });
  }
  return { schemaVersion: 1, strategy: 'opening-range-atm-credit-spread', period: { startDate, endDate }, rules: REMAINING_OPTION_SELLING_RULES.breakout, diagnostics: { requests, retries }, results, summary: summarize(results) };
}

function args(argv) { return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => { const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')]; })); }
if (process.argv[1]?.endsWith('groww-opening-range-credit-backtest.mjs')) {
  const options = args(process.argv.slice(2));
  if (!process.env.GROWW_ACCESS_TOKEN || !options.start || !options.end) throw new Error('GROWW_ACCESS_TOKEN, --start and --end are required');
  const result = await backtestOpeningRangeCredit({ token: process.env.GROWW_ACCESS_TOKEN, startDate: options.start, endDate: options.end });
  fs.writeFileSync(options.out ?? 'opening-range-credit.json', JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
}
