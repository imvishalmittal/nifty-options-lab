import fs from 'node:fs';
import { calculateLongOptionRoundTripCosts } from '../groww-option-costs.mjs';
import {
  chooseClosestPremium,
  itmContracts,
  nearestExpiry,
} from '../nifty-180-premium-strategy.mjs';
import {
  DEFAULT_RULES,
  classifyShortSession,
  expiryYearsForSessionDates,
  STRATEGIES,
  detectOpportunity,
  evaluateOptionPosition,
  niftyLotSizeForExpiry,
  summarizeOpportunityResults,
  timestampTime,
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

export function normalizeCandles(raw = []) {
  return raw.map((row) => ({
    timestamp: normalizeTimestamp(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5] ?? 0),
    openInterest: row[6] == null ? null : Number(row[6]),
  })).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function dateOf(timestamp) {
  return String(timestamp).slice(0, 10);
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

export function splitDateRange(startDate, endDate, days = 28) {
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
  return normalizeCandles(payload.candles ?? []);
}

async function fetchPeriod(token, { segment, symbol, startDate, endDate, startClock = '09:15', endClock = '15:21' }) {
  const output = [];
  for (const chunk of splitDateRange(startDate, endDate)) {
    output.push(...await fetchCandles(token, {
      segment,
      symbol,
      startTime: `${chunk.startDate} ${startClock}:00`,
      endTime: `${chunk.endDate} ${endClock}:00`,
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
    const date = dateOf(row.timestamp);
    if (!output.has(date)) output.set(date, []);
    output.get(date).push(row);
  }
  return output;
}

function candleAt(candles, timestamp) {
  return candles.find((row) => row.timestamp === timestamp) ?? null;
}

async function selectOption(token, {
  date,
  expiry,
  contracts,
  spot,
  optionType,
  signalTime,
  historyCache,
  rules,
}) {
  const candidates = itmContracts(contracts, spot, optionType).slice(0, rules.maxCandidates);
  if (!candidates.length) return { status: 'DATA_MISSING', reason: `No ITM ${optionType} candidates` };
  const inspected = [];
  let bracketed = false;
  for (const candidate of candidates) {
    const cacheKey = `${date}:${candidate.symbol}`;
    let candles = historyCache.get(cacheKey);
    if (!candles) {
      candles = await fetchPeriod(token, { segment: 'FNO', symbol: candidate.symbol, startDate: date, endDate: date });
      historyCache.set(cacheKey, candles);
    }
    const atSignal = candleAt(candles, signalTime);
    const premium = atSignal?.close;
    inspected.push({ candidate, candles, atSignal, premium });
    if (Number.isFinite(premium) && premium >= rules.referencePremium) {
      bracketed = true;
      break;
    }
  }
  const usable = inspected.filter((row) => Number.isFinite(row.premium));
  if (!usable.length) {
    return {
      status: 'NO_TRADE',
      reason: `No executable ${optionType} quote at signal time`,
      inspected: inspected.length,
    };
  }
  const bySymbol = Object.fromEntries(usable.map((row) => [row.candidate.symbol, row.premium]));
  const selected = chooseClosestPremium(usable.map((row) => row.candidate), bySymbol, rules.referencePremium);
  const selectedRow = usable.find((row) => row.candidate.symbol === selected?.symbol);
  if (!selected || !selectedRow) return { status: 'DATA_MISSING', reason: `${optionType} selection failed` };
  if (!bracketed && inspected.length === candidates.length && selectedRow.premium < rules.referencePremium) {
    return {
      status: 'CANDIDATE_BOUNDARY',
      reason: `${optionType} reference premium not bracketed at maximum ITM depth`,
      inspected: inspected.length,
      selected,
    };
  }
  return {
    status: 'SELECTED',
    expiry,
    inspected: inspected.length,
    contract: {
      ...selected,
      signalPremium: selectedRow.premium,
      signalVolume: selectedRow.atSignal?.volume ?? null,
      signalOpenInterest: selectedRow.atSignal?.openInterest ?? null,
      premiumDistanceFromReference: Math.abs(selectedRow.premium - rules.referencePremium),
    },
    candles: selectedRow.candles,
  };
}

function attachCosts(position, lotSize, tradeDate) {
  if (position.status !== 'TRADE' || !(lotSize > 0)) return position;
  const base = { entryPremium: position.entry, exitPremium: position.exit, lotSize, tradeDate };
  return {
    ...position,
    grossPnlRupees: position.pnlPerUnit * lotSize,
    rMultiple: position.pnlPerUnit / DEFAULT_RULES.stopPoints,
    costs: {
      normalized: calculateLongOptionRoundTripCosts(base),
      stress0_5: calculateLongOptionRoundTripCosts({ ...base, slippagePointsPerLeg: 0.5 }),
      stress1_0: calculateLongOptionRoundTripCosts({ ...base, slippagePointsPerLeg: 1.0 }),
    },
  };
}

export async function backtestOpportunity({
  token,
  strategy,
  startDate,
  endDate,
  lotSize,
  spacing = DEFAULT_REQUEST_SPACING_MS,
  rules = DEFAULT_RULES,
}) {
  if (!STRATEGIES.includes(strategy)) throw new Error(`Unknown strategy: ${strategy}`);
  requestSpacingMs = Math.max(250, Number(spacing) || DEFAULT_REQUEST_SPACING_MS);
  lastRequestAt = 0;
  requestCount = 0;
  retryCount = 0;
  const spotCandles = await fetchPeriod(token, {
    segment: 'CASH', symbol: 'NSE-NIFTY', startDate, endDate,
  });
  const sessions = groupByDate(spotCandles);
  const expiries = [];
  for (const year of expiryYearsForSessionDates(sessions.keys())) expiries.push(...await fetchExpiries(token, year));
  expiries.sort();
  const contractsByExpiry = new Map();
  const historyCache = new Map();
  const results = [];

  for (const [date, candles] of [...sessions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const shortSession = classifyShortSession(date, candles.length, MINIMUM_SESSION_CANDLES);
    if (shortSession) {
      results.push({ date, ...shortSession });
      continue;
    }
    const detected = detectOpportunity(candles, strategy, rules);
    if (detected.status !== 'SIGNAL') {
      results.push({ date, ...detected });
      continue;
    }
    const signal = detected;
    const signalSpotRow = candleAt(candles, signal.signalTime);
    const spot = signalSpotRow?.close;
    const expiry = nearestExpiry(expiries, date);
    if (!Number.isFinite(spot) || !expiry) {
      results.push({ date, status: 'DATA_MISSING', reason: 'Signal spot or nearest expiry unavailable', signal });
      continue;
    }
    if (!contractsByExpiry.has(expiry)) contractsByExpiry.set(expiry, await fetchContracts(token, expiry));
    const selected = await selectOption(token, {
      date,
      expiry,
      contracts: contractsByExpiry.get(expiry),
      spot,
      optionType: signal.optionType,
      signalTime: signal.signalTime,
      historyCache,
      rules,
    });
    if (selected.status !== 'SELECTED') {
      results.push({ date, status: selected.status, reason: selected.reason, signal, spot, expiry, selection: selected });
      continue;
    }
    const appliedLotSize = lotSize === 'auto' ? niftyLotSizeForExpiry(expiry) : lotSize;
    const position = attachCosts(evaluateOptionPosition(selected.candles, signal.signalTime, rules), appliedLotSize, date);
    results.push({
      date,
      strategy,
      spot,
      expiry,
      signal,
      selection: { inspected: selected.inspected, contract: selected.contract },
      lotSize: appliedLotSize,
      ...position,
    });
  }

  return {
    schemaVersion: 1,
    strategy,
    period: { startDate, endDate },
    rules,
    executionModel: {
      underlying: 'NSE-NIFTY cash 1-minute candles',
      option: 'nearest weekly NIFTY ITM option selected at signal-candle close nearest to reference premium',
      entry: 'next option one-minute bar open after completed underlying signal',
      sameBarPolicy: 'stop-first conservative ordering',
      maximumTradesPerSession: 1,
      lotSize: lotSize === 'auto' ? 'auto-by-expiry' : lotSize,
      costs: lotSize ? 'Groww cost helper normalized to current repository schedule; 0/0.5/1.0 premium-point slippage per leg' : 'per-unit gross only',
      warning: 'Historical normalized costs are a comparison model, not a reconstruction of every historical fee revision.',
    },
    diagnostics: {
      apiRequests: requestCount,
      retries: retryCount,
      cachedOptionHistories: historyCache.size,
      vwapFallbackSessions: results.filter((row) => row.signal?.evidence?.vwapMode === 'typical-price-fallback').length,
    },
    summary: summarizeOpportunityResults(results),
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
  const strategy = args.strategy;
  const startDate = args.start;
  const endDate = args.end;
  const lotSize = args['lot-size'] === 'auto'
    ? 'auto'
    : (args['lot-size'] ? Number(args['lot-size']) : null);
  if (!strategy || !startDate || !endDate) throw new Error('--strategy, --start and --end are required');
  const output = await backtestOpportunity({
    token,
    strategy,
    startDate,
    endDate,
    lotSize,
    spacing: Number(args['request-spacing-ms'] || process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_REQUEST_SPACING_MS),
  });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(output, null, 2));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('groww-opportunity-backtest.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

export { timestampTime };
