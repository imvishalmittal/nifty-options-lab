import fs from 'node:fs';
import {
  IRON_CONDOR_RULES,
  IRON_CONDOR_STRATEGY,
  attachIronCondorCosts,
  detectIronCondorRegime,
  evaluateIronCondorPosition,
  selectIronCondorContracts,
  summarizeIronCondorResults,
} from './iron-condor-engine.mjs';
import {
  classifyShortSession,
  expiryYearsForSessionDates,
  niftyLotSizeForExpiry,
} from './opportunity-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_REQUEST_SPACING_MS = 1600;
const MINIMUM_SESSION_CANDLES = 300;
let lastRequestAt = 0;
let requestCount = 0;
let retryCount = 0;
let requestSpacingMs = DEFAULT_REQUEST_SPACING_MS;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = Math.max(0, requestSpacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();
}

function normalizeTimestamp(value) {
  const text = String(value).replace(' ', 'T');
  return /([zZ]|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}+05:30`;
}

export function normalizeIronCondorCandles(raw = []) {
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
  return normalizeIronCondorCandles(payload.candles ?? []);
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
  return output.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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

function nearestNonExpiryDay(expiries, date) {
  return [...expiries].filter((expiry) => expiry > date).sort()[0] ?? null;
}

function attachCostScenarios(position, lotSize, tradeDate) {
  if (position.status !== 'TRADE') return position;
  return {
    ...position,
    lotSize,
    grossPnlRupees: position.pnlPerUnit * lotSize,
    rMultiple: position.pnlPerUnit / position.maximumLossPoints,
    costs: {
      normalized: attachIronCondorCosts(position, { lotSize, tradeDate }),
      stress0_5: attachIronCondorCosts(position, { lotSize, tradeDate, slippagePointsPerLeg: 0.5 }),
      stress1_0: attachIronCondorCosts(position, { lotSize, tradeDate, slippagePointsPerLeg: 1 }),
    },
  };
}

export async function backtestIronCondor({
  token,
  startDate,
  endDate,
  lotSize,
  spacing = DEFAULT_REQUEST_SPACING_MS,
  rules = IRON_CONDOR_RULES,
}) {
  requestSpacingMs = Math.max(250, Number(spacing) || DEFAULT_REQUEST_SPACING_MS);
  lastRequestAt = 0;
  requestCount = 0;
  retryCount = 0;
  const spotCandles = await fetchPeriod(token, { segment: 'CASH', symbol: 'NSE-NIFTY', startDate, endDate });
  const sessions = groupByDate(spotCandles);
  const expiries = [];
  for (const year of expiryYearsForSessionDates(sessions.keys())) expiries.push(...await fetchExpiries(token, year));
  const contractsByExpiry = new Map();
  const optionCache = new Map();
  const results = [];

  for (const [date, candles] of [...sessions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const shortSession = classifyShortSession(date, candles.length, MINIMUM_SESSION_CANDLES);
    if (shortSession) {
      results.push({ date, ...shortSession });
      continue;
    }
    const signal = detectIronCondorRegime(candles, rules);
    if (signal.status !== 'SIGNAL') {
      results.push({ date, ...signal });
      continue;
    }
    const expiry = nearestNonExpiryDay(expiries, date);
    if (!expiry) {
      results.push({ date, status: 'DATA_MISSING', reason: 'Non-expiry-day weekly contract unavailable', signal });
      continue;
    }
    if (!contractsByExpiry.has(expiry)) contractsByExpiry.set(expiry, await fetchContracts(token, expiry));
    const selection = selectIronCondorContracts(contractsByExpiry.get(expiry), {
      spot: signal.evidence.spot,
      range: signal.evidence.openingRange,
      rules,
    });
    if (!selection) {
      results.push({ date, status: 'DATA_MISSING', reason: 'Required equal-width four-leg structure unavailable', signal, expiry });
      continue;
    }
    const legCandles = {};
    for (const name of ['shortCall', 'longCall', 'shortPut', 'longPut']) {
      const symbol = selection[name].symbol;
      const cacheKey = `${date}:${symbol}`;
      if (!optionCache.has(cacheKey)) {
        optionCache.set(cacheKey, await fetchPeriod(token, { segment: 'FNO', symbol, startDate: date, endDate: date }));
      }
      legCandles[name] = optionCache.get(cacheKey);
    }
    const appliedLotSize = lotSize === 'auto' ? niftyLotSizeForExpiry(expiry) : lotSize;
    const entryTimestamp = `${date}T${rules.entryTime}:00+05:30`;
    const position = attachCostScenarios(evaluateIronCondorPosition({ legCandles, entryTimestamp, rules }), appliedLotSize, date);
    results.push({
      date,
      strategy: IRON_CONDOR_STRATEGY,
      signal,
      expiry,
      selection,
      ...position,
    });
  }

  return {
    schemaVersion: 1,
    strategy: IRON_CONDOR_STRATEGY,
    period: { startDate, endDate },
    rules,
    executionModel: {
      underlying: 'NSE-NIFTY cash 1-minute candles',
      option: 'nearest weekly NIFTY expiry strictly after the session; fixed-distance short strikes with exact equal-width wings',
      entry: `${rules.entryTime} open after the completed ${rules.entryTime} opening observation window`,
      exits: `${rules.profitCaptureRatio * 100}% credit capture, ${rules.stopDebitMultiple}x credit stop, or ${rules.forcedExit} time exit`,
      thresholdFill: 'threshold detected on synchronized four-leg minute closes; all legs filled at next synchronized minute open',
      missingQuotePolicy: 'session marked DATA_MISSING; no forward-filled or fabricated leg quotes',
      expiryDayPolicy: 'excluded by selecting expiry strictly after session date',
      maximumTradesPerSession: 1,
      lotSize: lotSize === 'auto' ? 'auto-by-expiry' : lotSize,
      costs: 'eight Groww option orders plus statutory charges; 0/0.5/1.0 adverse premium-point slippage on every leg entry and exit',
      warning: 'Historical normalized costs compare strategy variants; they do not reconstruct every historical fee revision.',
    },
    diagnostics: {
      apiRequests: requestCount,
      retries: retryCount,
      cachedOptionHistories: optionCache.size,
    },
    summary: summarizeIronCondorResults(results),
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
  const lotSize = args['lot-size'] === 'auto' ? 'auto' : Number(args['lot-size']);
  if (!(lotSize === 'auto' || lotSize > 0)) throw new Error('--lot-size must be auto or positive');
  const output = await backtestIronCondor({
    token,
    startDate: args.start,
    endDate: args.end,
    lotSize,
    spacing: Number(args['request-spacing-ms'] || process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_REQUEST_SPACING_MS),
  });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(output, null, 2));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('groww-iron-condor-backtest.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
