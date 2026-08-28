import fs from 'node:fs';
import {
  VIDEO_HAI_RULES,
  VIDEO_HAI_STRATEGY,
  attachVideoHaiCosts,
  buildVideoHaiCandidates,
  capitalForLotSize,
  entryCreditPoints,
  evaluateVideoHaiPosition,
  fridayForMonday,
  summarizeVideoHaiResults,
  summarizeVideoHaiEras,
  weekday,
} from './video-hai-ratio-engine.mjs';
import { expiryYearsForSessionDates, niftyLotSizeForExpiry } from './opportunity/opportunity-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_REQUEST_SPACING_MS = 1600;
let requestSpacingMs = DEFAULT_REQUEST_SPACING_MS;
let lastRequestAt = 0;
let requestCount = 0;
let retryCount = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle() {
  const wait = Math.max(0, requestSpacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();
}

function normalizeTimestamp(value) {
  const text = String(value).replace(' ', 'T');
  return /([zZ]|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}+05:30`;
}

export function normalizeVideoHaiCandles(raw = []) {
  const normalized = raw.map((row) => ({
    timestamp: normalizeTimestamp(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5] ?? 0),
    openInterest: row[6] == null ? null : Number(row[6]),
  })).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const merged = [];
  for (const candle of normalized) {
    const previous = merged.at(-1);
    if (!previous || previous.timestamp !== candle.timestamp) {
      merged.push({ ...candle });
      continue;
    }
    previous.high = Math.max(previous.high, candle.high);
    previous.low = Math.min(previous.low, candle.low);
    previous.close = candle.close;
    previous.volume = Math.max(previous.volume, candle.volume);
    if (candle.openInterest != null) previous.openInterest = candle.openInterest;
  }
  return merged;
}

function parseDate(date) {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function plusDays(date, days) {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return formatDate(value);
}

function splitDateRange(startDate, endDate, days = 28) {
  const output = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const proposed = plusDays(cursor, days - 1);
    const end = proposed < endDate ? proposed : endDate;
    output.push({ startDate: cursor, endDate: end });
    cursor = plusDays(end, 1);
  }
  return output;
}

async function apiGet(token, endpoint, params, maxRetries = 8) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await throttle();
    requestCount += 1;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' },
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < maxRetries) {
      retryCount += 1;
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(5000 * (2 ** attempt), 60000);
      console.error(`Groww ${endpoint} returned ${response.status}; retrying in ${delay}ms`);
      await sleep(delay);
      continue;
    }
    const detail = body?.error?.message || body?.message || JSON.stringify(body);
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${detail}`);
  }
  throw new Error(`Groww ${endpoint} exhausted retries`);
}

async function fetchCandles(token, { segment, symbol, startTime, endTime }) {
  const payload = await apiGet(token, '/historical/candles', {
    exchange: 'NSE',
    segment,
    groww_symbol: symbol,
    start_time: startTime,
    end_time: endTime,
    candle_interval: '1minute',
  });
  return normalizeVideoHaiCandles(payload.candles ?? []);
}

async function fetchPeriod(token, { segment, symbol, startDate, endDate }) {
  const output = [];
  for (const chunk of splitDateRange(startDate, endDate)) {
    output.push(...await fetchCandles(token, {
      segment,
      symbol,
      startTime: `${chunk.startDate} 09:15:00`,
      endTime: `${chunk.endDate} 15:21:00`,
    }));
  }
  return normalizeVideoHaiCandles(output.map((row) => [
    row.timestamp, row.open, row.high, row.low, row.close, row.volume, row.openInterest,
  ]));
}

async function fetchExpiries(token, year) {
  const payload = await apiGet(token, '/historical/expiries', {
    exchange: 'NSE', underlying_symbol: 'NIFTY', year,
  });
  return payload.expiries ?? [];
}

async function fetchContracts(token, expiry) {
  const payload = await apiGet(token, '/historical/contracts', {
    exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry,
  });
  return payload.contracts ?? [];
}

function groupByDate(candles) {
  const output = new Map();
  for (const row of candles) {
    const date = row.timestamp.slice(0, 10);
    if (!output.has(date)) output.set(date, []);
    output.get(date).push(row);
  }
  return output;
}

function allMondays(startDate, endDate) {
  const output = [];
  let cursor = startDate;
  while (weekday(cursor) !== 1) cursor = plusDays(cursor, 1);
  while (cursor <= endDate) {
    if (fridayForMonday(cursor) <= endDate) output.push(cursor);
    cursor = plusDays(cursor, 7);
  }
  return output;
}

function expiryAfterFriday(expiries, fridayDate) {
  return [...new Set(expiries)].filter((expiry) => expiry > fridayDate).sort()[0] ?? null;
}

function priceAt(rows, timestamp, field = 'open') {
  const value = rows.find((row) => row.timestamp === timestamp)?.[field];
  return Number.isFinite(value) ? value : null;
}

function candidateEntryPrices(selection, legCandles, entryTimestamp) {
  const output = {};
  for (const name of ['lowerLong', 'middleShort', 'upperLong']) {
    const price = priceAt(legCandles[name], entryTimestamp);
    if (price == null) return null;
    output[name] = price;
  }
  return output;
}

async function fetchCandidateLegs(token, selection, date, fridayDate, cache) {
  const output = {};
  for (const name of ['lowerLong', 'middleShort', 'upperLong']) {
    const symbol = selection[name].symbol;
    const key = `${date}:${symbol}`;
    if (!cache.has(key)) {
      cache.set(key, await fetchPeriod(token, { segment: 'FNO', symbol, startDate: date, endDate: fridayDate }));
    }
    output[name] = cache.get(key);
  }
  return output;
}

export async function backtestVideoHaiRatio({
  token,
  startDate,
  endDate,
  lotSize = 'auto',
  spacing = DEFAULT_REQUEST_SPACING_MS,
  rules = VIDEO_HAI_RULES,
}) {
  if (startDate < '2025-09-01') throw new Error('Exact video strategy cannot start before Tuesday-expiry contracts began in September 2025');
  requestSpacingMs = Math.max(250, Number(spacing) || DEFAULT_REQUEST_SPACING_MS);
  lastRequestAt = 0;
  requestCount = 0;
  retryCount = 0;

  const spotCandles = await fetchPeriod(token, { segment: 'CASH', symbol: 'NSE-NIFTY', startDate, endDate });
  const spotByDate = groupByDate(spotCandles);
  const mondays = allMondays(startDate, endDate);
  const expiryYears = expiryYearsForSessionDates([startDate, endDate, plusDays(endDate, 14)]);
  const expiries = [];
  for (const year of expiryYears) expiries.push(...await fetchExpiries(token, year));
  const contractsByExpiry = new Map();
  const optionCache = new Map();
  const results = [];

  for (const date of mondays) {
    const fridayDate = fridayForMonday(date);
    const session = spotByDate.get(date) ?? [];
    if (!session.length) {
      results.push({ date, status: 'EXCLUDED_SESSION', reason: 'Monday was not an NSE trading session', fridayDate });
      continue;
    }
    const decision = session.find((row) => row.timestamp.slice(11, 16) === rules.decisionTime);
    if (!decision) {
      results.push({ date, status: 'DATA_MISSING', reason: 'Completed 09:44 NIFTY decision candle unavailable', fridayDate });
      continue;
    }
    const expiry = expiryAfterFriday(expiries, fridayDate);
    if (!expiry) {
      results.push({ date, status: 'DATA_MISSING', reason: 'Following-week Tuesday expiry unavailable', fridayDate });
      continue;
    }
    if (!contractsByExpiry.has(expiry)) contractsByExpiry.set(expiry, await fetchContracts(token, expiry));
    const candidates = buildVideoHaiCandidates(contractsByExpiry.get(expiry), decision.close, rules);
    if (!candidates.length) {
      results.push({ date, status: 'DATA_MISSING', reason: 'Required 1:3:2 call strikes unavailable', fridayDate, expiry, decisionSpot: decision.close });
      continue;
    }
    const appliedLotSize = lotSize === 'auto' ? niftyLotSizeForExpiry(expiry) : lotSize;
    const entryTimestamp = `${date}T${rules.entryTime}:00+05:30`;
    let selected = null;
    let sawEntryQuotes = false;
    for (const selection of candidates) {
      const legCandles = await fetchCandidateLegs(token, selection, date, fridayDate, optionCache);
      const entryPrices = candidateEntryPrices(selection, legCandles, entryTimestamp);
      if (!entryPrices) continue;
      sawEntryQuotes = true;
      const capital = capitalForLotSize(appliedLotSize, rules);
      const entryCreditCapitalRatio = entryCreditPoints(entryPrices) * appliedLotSize / capital;
      if (entryCreditCapitalRatio > rules.maximumEntryCreditCapitalRatio) continue;
      selected = { selection, legCandles, entryPrices, entryCreditCapitalRatio };
      break;
    }
    if (!selected) {
      results.push({
        date,
        status: sawEntryQuotes ? 'NO_TRADE' : 'DATA_MISSING',
        reason: sawEntryQuotes
          ? 'Entry credit exceeded 0.6% capital through maximum permitted outward shift'
          : 'Synchronized 09:45 entry quotes unavailable for all valid structures',
        fridayDate,
        expiry,
        decisionSpot: decision.close,
      });
      continue;
    }
    const position = evaluateVideoHaiPosition({
      selection: selected.selection,
      legCandles: selected.legCandles,
      entryTimestamp,
      fridayDate,
      lotSize: appliedLotSize,
      rules,
    });
    const withCosts = position.status === 'TRADE' ? {
      ...position,
      costs: {
        normalized: attachVideoHaiCosts(position, { slippagePointsPerLeg: 0 }),
        stress0_5: attachVideoHaiCosts(position, { slippagePointsPerLeg: 0.5 }),
        stress1_0: attachVideoHaiCosts(position, { slippagePointsPerLeg: 1 }),
      },
    } : position;
    results.push({
      date,
      strategy: VIDEO_HAI_STRATEGY,
      fridayDate,
      expiry,
      decisionTime: decision.timestamp,
      decisionSpot: decision.close,
      entryCreditCapitalRatio: selected.entryCreditCapitalRatio,
      ...withCosts,
    });
  }

  return {
    schemaVersion: 1,
    strategy: VIDEO_HAI_STRATEGY,
    period: { startDate, endDate },
    rules,
    executionModel: {
      source: 'Dhan Hedge Like a Pro video, HAI strategy at approximately 40:48–56:38',
      decision: 'completed Monday 09:44 NIFTY candle; no same-minute look-ahead',
      entry: 'Monday 09:45 synchronized option opens',
      expiry: 'first listed NIFTY expiry after Friday, corresponding to the following Tuesday weekly contract',
      structure: 'buy 1 CE at rounded-up-100 anchor + distance; sell 3 CE +200; buy 2 CE +400',
      shifting: 'start +200 and shift all strikes outward by 100 until entry credit is <=0.6% of scaled capital',
      thresholds: '1% capital target and 1% capital stop detected on synchronized closes; next synchronized open fill',
      gaps: 'new-session opening quote is checked and filled immediately when beyond target/stop; nominal 1% stop is not guaranteed',
      timeExit: 'Friday 15:15 synchronized open, or the latest prior trading day at 15:15 when Friday is closed',
      reentry: 'none during the week after any exit',
      missingQuotePolicy: 'no forward fill; required entry/exit quotes missing marks the week DATA_MISSING',
      capital: '₹140,000 at lot size 65, scaled linearly for historical lot-size comparability',
      costs: 'three entry and three exit orders with historical STT date selection; 0/0.5/1.0-point adverse slippage per unique leg',
    },
    diagnostics: { apiRequests: requestCount, retries: retryCount, cachedOptionHistories: optionCache.size },
    summary: summarizeVideoHaiResults(results),
    publicationEraSummary: summarizeVideoHaiEras(results),
    results,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...value] = arg.slice(2).split('=');
    return [key, value.join('=')];
  }));
}

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const args = parseArgs(process.argv.slice(2));
  if (!args.start || !args.end) throw new Error('--start and --end are required');
  const lotSize = !args['lot-size'] || args['lot-size'] === 'auto' ? 'auto' : Number(args['lot-size']);
  if (!(lotSize === 'auto' || lotSize > 0)) throw new Error('--lot-size must be auto or positive');
  const output = await backtestVideoHaiRatio({
    token,
    startDate: args.start,
    endDate: args.end,
    lotSize,
    spacing: Number(args['request-spacing-ms'] || process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_REQUEST_SPACING_MS),
  });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(output, null, 2));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('groww-video-hai-ratio-backtest.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
