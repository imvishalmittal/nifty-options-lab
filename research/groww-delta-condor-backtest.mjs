import fs from 'node:fs';
import { calculateOptionRoundTripCosts } from './groww-option-costs.mjs';
import { parseNiftyOptionContract } from './nifty-180-premium-strategy.mjs';
import { niftyLotSizeForExpiry } from './opportunity/opportunity-engine.mjs';
import {
  REMAINING_OPTION_SELLING_RULES,
  completedDailyClosesBefore,
  completedWeeklyClosesBefore,
  evaluateCreditLifecycle,
  firstSessionsAfterExpiries,
  reconstructOptionDelta,
  selectIronCondorByDelta,
  summarizeScenario,
  wilderRsi,
} from './remaining-option-selling-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const SPACING_MS = 1600;
const STOCKS = Object.freeze({
  SBIN: 'NSE-SBIN', RELIANCE: 'NSE-RELIANCE', TCS: 'NSE-TCS', INFY: 'NSE-INFY', WIPRO: 'NSE-WIPRO',
  CIPLA: 'NSE-CIPLA', DRREDDY: 'NSE-DRREDDY', SUNPHARMA: 'NSE-SUNPHARMA',
  'BAJAJ-AUTO': 'NSE-BAJAJ-AUTO', ASIANPAINT: 'NSE-ASIANPAINT',
});
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

function dateValue(date) { return new Date(`${date}T00:00:00Z`); }
function formatDate(value) { return value.toISOString().slice(0, 10); }
function plusDays(date, days) { const value = dateValue(date); value.setUTCDate(value.getUTCDate() + days); return formatDate(value); }
function dayDifference(left, right) { return Math.round((dateValue(right) - dateValue(left)) / 86400000); }

function splitRange(startDate, endDate, days = 28) {
  const output = [];
  for (let cursor = startDate; cursor <= endDate;) {
    const proposed = plusDays(cursor, days - 1);
    const end = proposed < endDate ? proposed : endDate;
    output.push({ startDate: cursor, endDate: end });
    cursor = plusDays(end, 1);
  }
  return output;
}

function normalizeTimestamp(value) {
  const text = String(value).replace(' ', 'T');
  return /([zZ]|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}+05:30`;
}

export function normalizeDeltaCondorCandles(raw = []) {
  return raw.map((row) => ({ timestamp: normalizeTimestamp(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5] ?? 0) }))
    .filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchPeriod(token, { segment, symbol, startDate, endDate }) {
  const rows = [];
  for (const chunk of splitRange(startDate, endDate)) {
    const payload = await apiGet(token, '/historical/candles', {
      exchange: 'NSE', segment, groww_symbol: symbol,
      start_time: `${chunk.startDate} 09:15:00`, end_time: `${chunk.endDate} 15:29:00`, candle_interval: '1minute',
    });
    rows.push(...normalizeDeltaCondorCandles(payload.candles ?? []));
  }
  return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchExpiries(token, underlying, year) {
  const payload = await apiGet(token, '/historical/expiries', { exchange: 'NSE', underlying_symbol: underlying, year });
  return payload.expiries ?? [];
}

async function fetchContracts(token, underlying, expiry) {
  const payload = await apiGet(token, '/historical/contracts', { exchange: 'NSE', underlying_symbol: underlying, expiry_date: expiry });
  return payload.contracts ?? [];
}

export function parseDeltaCondorContract(input) {
  const nifty = parseNiftyOptionContract(input);
  if (nifty) return { ...nifty, lotSize: Number(input?.lot_size ?? input?.lotSize ?? input?.contract_lot_size ?? 0) || null };
  const symbol = String(input?.symbol ?? input?.groww_symbol ?? input);
  const match = symbol.match(/^NSE-(.+)-(\d{2}[A-Za-z]{3}\d{2})-(\d+(?:\.\d+)?)-(CE|PE)$/);
  return match ? { symbol, underlying: match[1], expiryCode: match[2], strike: Number(match[3]), optionType: match[4], lotSize: Number(input?.lot_size ?? input?.lotSize ?? input?.contract_lot_size ?? 0) || null } : null;
}

function sessionsFrom(rows) { return [...new Set(rows.map((row) => row.timestamp.slice(0, 10)))].sort(); }
function quoteAt(rows, timestamp, field = 'open') { const row = rows.find((value) => value.timestamp === timestamp); return Number.isFinite(row?.[field]) ? row[field] : null; }

export function monthlyExpiries(expiries) {
  const byMonth = new Map();
  for (const expiry of [...new Set(expiries)].sort()) byMonth.set(expiry.slice(0, 7), expiry);
  return [...byMonth.values()].sort();
}

function candidateContracts(contracts, spot, perSide = 30) {
  const calls = contracts.filter((row) => row.optionType === 'CE' && row.strike > spot).sort((a, b) => a.strike - b.strike).slice(0, perSide);
  const puts = contracts.filter((row) => row.optionType === 'PE' && row.strike < spot).sort((a, b) => b.strike - a.strike).slice(0, perSide);
  return [...calls, ...puts];
}

async function reconstructCandidates({ token, contracts, spot, entryDate, entryTimestamp, expiry, optionCache }) {
  const output = [];
  for (const contract of candidateContracts(contracts, spot)) {
    const key = `${entryDate}:${contract.symbol}`;
    if (!optionCache.has(key)) optionCache.set(key, await fetchPeriod(token, { segment: 'FNO', symbol: contract.symbol, startDate: entryDate, endDate: entryDate }));
    const entryPremium = quoteAt(optionCache.get(key), entryTimestamp);
    if (!(entryPremium > 0)) continue;
    const reconstructed = reconstructOptionDelta({ optionType: contract.optionType, premium: entryPremium, spot, strike: contract.strike, daysToExpiry: Math.max(1 / 1440, dayDifference(entryDate, expiry)) });
    if (reconstructed) output.push({ ...contract, entryPremium, ...reconstructed });
  }
  return output;
}

function lastSessionBefore(sessionDates, expiry) { return [...sessionDates].filter((date) => date < expiry).sort().at(-1) ?? null; }

function synchronizedObservations(legRows, entryTimestamp, finalDate) {
  const maps = Object.fromEntries(Object.entries(legRows).map(([name, rows]) => [name, new Map(rows.map((row) => [row.timestamp, row]))]));
  const timestamps = [...maps.shortCall.keys()].filter((timestamp) => timestamp > entryTimestamp && Object.values(maps).every((map) => map.has(timestamp))).sort();
  return timestamps.map((timestamp) => {
    const rows = Object.fromEntries(Object.entries(maps).map(([name, map]) => [name, map.get(timestamp)]));
    return {
      timestamp,
      openDebit: rows.shortCall.open + rows.shortPut.open - rows.longCall.open - rows.longPut.open,
      highDebit: Math.max(0, rows.shortCall.high + rows.shortPut.high - rows.longCall.low - rows.longPut.low),
      lowDebit: Math.max(0, rows.shortCall.low + rows.shortPut.low - rows.longCall.high - rows.longPut.high),
      isSessionOpen: timestamp.slice(11, 16) === '09:15',
      isFinal: timestamp.startsWith(finalDate) && timestamp.slice(11, 16) === '15:15',
    };
  });
}

function attachFourLegCosts({ entryPrices, exitPrices, lotSize, entryDate, slippagePointsPerLeg }) {
  const legs = {};
  for (const name of ['shortCall', 'shortPut', 'longCall', 'longPut']) {
    const side = name.startsWith('short') ? 'SHORT' : 'LONG';
    legs[name] = calculateOptionRoundTripCosts({ entryPremium: entryPrices[name], exitPremium: exitPrices[name], lotSize, tradeDate: entryDate, slippagePointsPerLeg, side });
  }
  return { netPnl: Object.values(legs).reduce((sum, row) => sum + row.netPnl, 0), charges: Object.values(legs).reduce((sum, row) => sum + row.charges.total, 0), legs };
}

function summarize(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const scenario = (name) => summarizeScenario(trades.map((row) => row.costs[name].netPnl));
  return { observations: results.length, trades: trades.length, dataMissing: results.filter((row) => row.status === 'DATA_MISSING').length, noTrade: results.filter((row) => row.status === 'NO_TRADE').length, targets: trades.filter((row) => row.exitReason === 'TARGET').length, stops: trades.filter((row) => row.exitReason === 'STOP').length, timeExits: trades.filter((row) => row.exitReason === 'TIME').length, normalized: scenario('normalized'), stress0_5: scenario('stress0_5'), stress1_0: scenario('stress1_0') };
}

async function expiriesForPeriod(token, underlying, startDate, endDate) {
  const output = [];
  for (let year = Number(startDate.slice(0, 4)) - 1; year <= Number(endDate.slice(0, 4)) + 1; year += 1) output.push(...await fetchExpiries(token, underlying, year));
  return [...new Set(output)].sort();
}

async function evaluateScheduledEntry({ token, mode, underlying, cashSymbol, cashRows, schedule, targets, optionCache }) {
  const { previousExpiry, entryDate, expiry } = schedule;
  const base = { underlying, previousExpiry, date: entryDate, expiry };
  const entryTimestamp = `${entryDate}T09:45:00+05:30`;
  const entrySpot = quoteAt(cashRows, entryTimestamp);
  if (!(entrySpot > 0)) return { ...base, status: 'DATA_MISSING', reason: 'Underlying 09:45 entry open unavailable' };
  let filters = null;
  if (mode === 'monthly-rsi') {
    const priorClose = completedDailyClosesBefore(cashRows, entryTimestamp).at(-1);
    const gap = Number.isFinite(priorClose) ? Math.abs(entrySpot / priorClose - 1) : null;
    if (gap == null) return { ...base, status: 'DATA_MISSING', reason: 'Prior close unavailable for discontinuity check' };
    if (gap > REMAINING_OPTION_SELLING_RULES.monthly.gapLimit) return { ...base, status: 'NO_TRADE', reason: '12% discontinuity proxy', filters: { gap, priorClose } };
    const dailyRsi = wilderRsi(completedDailyClosesBefore(cashRows, entryTimestamp));
    const weeklyRsi = wilderRsi(completedWeeklyClosesBefore(cashRows, entryTimestamp));
    filters = { gap, priorClose, dailyRsi, weeklyRsi };
    if (![dailyRsi, weeklyRsi].every(Number.isFinite)) return { ...base, status: 'DATA_MISSING', reason: 'RSI warmup incomplete', filters };
    if (dailyRsi >= 50 || weeklyRsi >= 50) return { ...base, status: 'NO_TRADE', reason: 'Daily and weekly RSI weakness not aligned', filters };
  }
  const rawContracts = await fetchContracts(token, underlying, expiry);
  const contracts = rawContracts.map(parseDeltaCondorContract).filter(Boolean);
  const candidates = await reconstructCandidates({ token, contracts, spot: entrySpot, entryDate, entryTimestamp, expiry, optionCache });
  const selection = selectIronCondorByDelta(candidates, targets);
  if (!selection) return { ...base, status: 'DATA_MISSING', reason: 'Frozen four-leg delta structure unavailable', filters };
  const sessionDates = sessionsFrom(cashRows);
  const finalDate = lastSessionBefore(sessionDates, expiry);
  if (!finalDate || finalDate < entryDate) return { ...base, status: 'DATA_MISSING', reason: 'Pre-expiry exit session unavailable', filters, selection };
  const legRows = {};
  for (const name of ['shortCall', 'shortPut', 'longCall', 'longPut']) {
    const key = `${entryDate}:${finalDate}:${selection[name].symbol}`;
    if (!optionCache.has(key)) optionCache.set(key, await fetchPeriod(token, { segment: 'FNO', symbol: selection[name].symbol, startDate: entryDate, endDate: finalDate }));
    legRows[name] = optionCache.get(key);
  }
  const entryPrices = Object.fromEntries(Object.entries(legRows).map(([name, rows]) => [name, quoteAt(rows, entryTimestamp)]));
  if (!Object.values(entryPrices).every((value) => value > 0)) return { ...base, status: 'DATA_MISSING', reason: 'Synchronized four-leg entry unavailable', filters, selection };
  const entryCredit = entryPrices.shortCall + entryPrices.shortPut - entryPrices.longCall - entryPrices.longPut;
  const observations = synchronizedObservations(legRows, entryTimestamp, finalDate);
  const exit = evaluateCreditLifecycle({ entryCredit, observations });
  if (exit.status !== 'EXIT') return { ...base, status: exit.status, reason: exit.reason, filters, selection, entryTimestamp, entryPrices, entryCredit };
  const exitPrices = Object.fromEntries(Object.entries(legRows).map(([name, rows]) => [name, quoteAt(rows, exit.timestamp)]));
  if (!Object.values(exitPrices).every(Number.isFinite)) return { ...base, status: 'DATA_MISSING', reason: 'Synchronized four-leg exit unavailable', filters, selection };
  const lotSize = mode === 'weekly-smart' ? niftyLotSizeForExpiry(expiry) : (selection.shortCall.lotSize ?? selection.shortPut.lotSize ?? selection.longCall.lotSize ?? selection.longPut.lotSize);
  if (!(lotSize > 0)) return { ...base, status: 'DATA_MISSING', reason: 'Historical lot size unavailable', filters, selection };
  const costs = Object.fromEntries([['normalized', 0], ['stress0_5', 0.5], ['stress1_0', 1]].map(([name, slippagePointsPerLeg]) => [name, attachFourLegCosts({ entryPrices, exitPrices, lotSize, entryDate, slippagePointsPerLeg })]));
  return { ...base, status: 'TRADE', filters, selection, entryTimestamp, entrySpot, entryPrices, entryCredit, exitTimestamp: exit.timestamp, thresholdTimestamp: exit.thresholdTimestamp ?? null, exitReason: exit.reason, ambiguous: Boolean(exit.ambiguous), exitPrices, lotSize, costs };
}

export async function backtestDeltaCondor({ token, mode, startDate, endDate }) {
  if (!['weekly-smart', 'monthly-rsi'].includes(mode)) throw new Error('mode must be weekly-smart or monthly-rsi');
  requests = 0; retries = 0; lastRequestAt = 0;
  const definitions = mode === 'weekly-smart' ? [['NIFTY', 'NSE-NIFTY']] : Object.entries(STOCKS);
  const targets = mode === 'weekly-smart' ? REMAINING_OPTION_SELLING_RULES.smart : REMAINING_OPTION_SELLING_RULES.monthly;
  const results = [];
  const optionCache = new Map();
  for (const [underlying, cashSymbol] of definitions) {
    const warmupStart = plusDays(startDate, -180);
    const coverageEnd = plusDays(endDate, 40);
    const cashRows = await fetchPeriod(token, { segment: 'CASH', symbol: cashSymbol, startDate: warmupStart, endDate: coverageEnd });
    const expiries = await expiriesForPeriod(token, underlying, startDate, coverageEnd);
    const scheduleExpiries = mode === 'weekly-smart' ? expiries : monthlyExpiries(expiries);
    const schedules = firstSessionsAfterExpiries(sessionsFrom(cashRows), scheduleExpiries).filter((row) => row.entryDate >= startDate && row.entryDate <= endDate);
    for (const schedule of schedules) results.push(await evaluateScheduledEntry({ token, mode, underlying, cashSymbol, cashRows, schedule, targets, optionCache }));
  }
  return { schemaVersion: 1, strategy: mode === 'weekly-smart' ? 'weekly-nifty-008-delta-condor' : 'monthly-large-cap-rsi-condor', mode, period: { startDate, endDate }, rules: { targets, lifecycle: REMAINING_OPTION_SELLING_RULES.lifecycle }, diagnostics: { requests, retries, cachedOptionHistories: optionCache.size }, results, summary: summarize(results) };
}

function args(argv) { return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => { const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')]; })); }
if (process.argv[1]?.endsWith('groww-delta-condor-backtest.mjs')) {
  const options = args(process.argv.slice(2));
  if (!process.env.GROWW_ACCESS_TOKEN || !options.mode || !options.start || !options.end) throw new Error('GROWW_ACCESS_TOKEN, --mode, --start and --end are required');
  const result = await backtestDeltaCondor({ token: process.env.GROWW_ACCESS_TOKEN, mode: options.mode, startDate: options.start, endDate: options.end });
  fs.writeFileSync(options.out ?? `${options.mode}.json`, JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
}
