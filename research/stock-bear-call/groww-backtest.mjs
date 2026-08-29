import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  BEAR_CALL_RULES,
  BEAR_CALL_STRATEGY,
  VIDEO_STOCK_UNIVERSE,
  detectBearCallSignals,
  evaluateBearCallPosition,
  firstBearCallExitSignal,
  parseStockOptionContract,
  reconstructCallDelta,
  selectDeltaBearCall,
  summarizeBearCallResults,
} from './engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_SPACING_MS = 1600;
let lastRequestAt = 0;
let requests = 0;
let retries = 0;

const SYMBOLS = Object.freeze({
  SBIN: 'NSE-SBIN', RELIANCE: 'NSE-RELIANCE', TCS: 'NSE-TCS', INFY: 'NSE-INFY',
  WIPRO: 'NSE-WIPRO', CIPLA: 'NSE-CIPLA', DRREDDY: 'NSE-DRREDDY',
  SUNPHARMA: 'NSE-SUNPHARMA', 'BAJAJ-AUTO': 'NSE-BAJAJ-AUTO', ASIANPAINT: 'NSE-ASIANPAINT',
});

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function apiGet(token, endpoint, params, spacingMs) {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  for (let attempt = 0; attempt <= 8; attempt += 1) {
    lastRequestAt = Date.now();
    requests += 1;
    const response = await fetch(url, { headers: {
      Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0',
    } });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < 8) {
      retries += 1;
      await sleep(Math.min(5000 * (2 ** attempt), 60000));
      continue;
    }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
  throw new Error(`Groww ${endpoint} exhausted retries`);
}

function dateValue(text) { return new Date(`${text}T00:00:00Z`); }
function formatDate(value) { return value.toISOString().slice(0, 10); }
function plusDays(text, days) { const value = dateValue(text); value.setUTCDate(value.getUTCDate() + days); return formatDate(value); }
function dayDifference(a, b) { return Math.round((dateValue(b) - dateValue(a)) / 86400000); }

function splitRange(startDate, endDate, days = 28) {
  const chunks = [];
  for (let cursor = startDate; cursor <= endDate;) {
    const proposed = plusDays(cursor, days - 1);
    const end = proposed < endDate ? proposed : endDate;
    chunks.push({ startDate: cursor, endDate: end });
    cursor = plusDays(end, 1);
  }
  return chunks;
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

async function fetchPeriod(token, { segment, symbol, startDate, endDate }, spacingMs) {
  const rows = [];
  for (const chunk of splitRange(startDate, endDate)) {
    const payload = await apiGet(token, '/historical/candles', {
      exchange: 'NSE', segment, groww_symbol: symbol,
      start_time: `${chunk.startDate} 09:15:00`, end_time: `${chunk.endDate} 15:29:00`, candle_interval: '1minute',
    }, spacingMs);
    rows.push(...normalizeCandles(payload.candles ?? []));
  }
  return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchExpiries(token, underlying, year, spacingMs) {
  const payload = await apiGet(token, '/historical/expiries', {
    exchange: 'NSE', underlying_symbol: underlying, year,
  }, spacingMs);
  return payload.expiries ?? [];
}

async function fetchContracts(token, underlying, expiry, spacingMs) {
  const payload = await apiGet(token, '/historical/contracts', {
    exchange: 'NSE', underlying_symbol: underlying, expiry_date: expiry,
  }, spacingMs);
  return payload.contracts ?? [];
}

function quoteAt(candles, timestamp, field = 'open') {
  const row = candles.find((candidate) => candidate.timestamp === timestamp);
  return row && Number.isFinite(row[field]) ? row[field] : null;
}

function firstTimestampAfter(candles, timestamp) {
  return candles.find((row) => row.timestamp > timestamp)?.timestamp ?? null;
}

function latestQuoteAtOrBefore(candles, timestamp) {
  return [...candles].reverse().find((row) => row.timestamp <= timestamp)?.close ?? null;
}

function nearestExpiry(expiries, date, minimumDte) {
  return [...expiries].filter((expiry) => dayDifference(date, expiry) >= minimumDte).sort()[0] ?? null;
}

function commonExitTimestamp(shortRows, longRows, desiredTimestamp) {
  const longTimes = new Set(longRows.filter((row) => row.timestamp >= desiredTimestamp).map((row) => row.timestamp));
  return shortRows.find((row) => row.timestamp >= desiredTimestamp && longTimes.has(row.timestamp))?.timestamp ?? null;
}

function lotSizeFrom(selection) {
  return selection.shortCall.lotSize ?? selection.longCall.lotSize ?? null;
}

const nseLotCache = new Map();

async function fetchNseLotSize(underlying, tradeDate) {
  const key = `${tradeDate}:${underlying}`;
  if (nseLotCache.has(key)) return nseLotCache.get(key);
  const [year, month, day] = tradeDate.split('-');
  const url = `https://nsearchives.nseindia.com/content/fo/NSE_FO_contract_${day}${month}${year}.csv.gz`;
  const response = await fetch(url, { headers: { Accept: 'application/gzip', 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) {
    nseLotCache.set(key, null);
    return null;
  }
  const csv = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
  const row = csv.split(/\r?\n/).find((line) => {
    const fields = line.split(',');
    return fields[3] === underlying && Number(fields[8]) > 0;
  });
  const lotSize = row ? Number(row.split(',')[8]) : null;
  nseLotCache.set(key, lotSize);
  return lotSize;
}

function resultBase({ underlying, signal, expiry, entryTimestamp }) {
  return { underlying, date: entryTimestamp.slice(0, 10), signal, expiry, entryTimestamp };
}

export async function backtestStockBearCall({
  token,
  startDate = '2026-06-04',
  endDate = '2026-08-28',
  warmupStart = '2026-01-01',
  universe = VIDEO_STOCK_UNIVERSE,
  spacingMs = DEFAULT_SPACING_MS,
  rules = BEAR_CALL_RULES,
}) {
  requests = 0; retries = 0; lastRequestAt = 0;
  const vix = await fetchPeriod(token, { segment: 'CASH', symbol: 'NSE-INDIAVIX', startDate, endDate }, spacingMs);
  const results = [];
  const optionCache = new Map();

  for (const underlying of universe) {
    const spot = await fetchPeriod(token, { segment: 'CASH', symbol: SYMBOLS[underlying], startDate: warmupStart, endDate }, spacingMs);
    const detected = detectBearCallSignals(spot, rules);
    const signals = detected.signals.filter((row) => row.signalTimestamp.slice(0, 10) >= startDate
      && row.signalTimestamp.slice(0, 10) <= endDate);
    const expiries = await fetchExpiries(token, underlying, 2026, spacingMs);
    let occupiedUntil = '';

    for (const signal of signals) {
      const entryTimestamp = firstTimestampAfter(spot, signal.signalTimestamp);
      if (!entryTimestamp || entryTimestamp <= occupiedUntil) continue;
      const base = resultBase({ underlying, signal, expiry: null, entryTimestamp });
      const indiaVix = latestQuoteAtOrBefore(vix, entryTimestamp);
      if (!Number.isFinite(indiaVix)) {
        results.push({ ...base, status: 'DATA_MISSING', reason: 'India VIX quote unavailable' });
        continue;
      }
      if (indiaVix >= rules.maximumEntryVix) {
        results.push({ ...base, status: 'NO_TRADE', reason: 'India VIX entry gate', indiaVix });
        continue;
      }
      const expiry = nearestExpiry(expiries, entryTimestamp.slice(0, 10), rules.minimumEntryDte);
      if (!expiry) {
        results.push({ ...base, status: 'DATA_MISSING', reason: 'Monthly stock-option expiry unavailable', indiaVix });
        continue;
      }
      base.expiry = expiry;
      const entrySpot = quoteAt(spot, entryTimestamp);
      if (!(entrySpot > 0)) {
        results.push({ ...base, status: 'DATA_MISSING', reason: 'Underlying entry quote unavailable', indiaVix });
        continue;
      }
      const contracts = (await fetchContracts(token, underlying, expiry, spacingMs))
        .map(parseStockOptionContract).filter((row) => row?.optionType === 'CE' && row.strike > entrySpot)
        .sort((a, b) => a.strike - b.strike).slice(0, 16);
      const entryDate = entryTimestamp.slice(0, 10);
      const daysToExpiry = Math.max(1 / 365, dayDifference(entryDate, expiry));
      const candidates = [];
      for (const contract of contracts) {
        const cacheKey = `${entryDate}:${contract.symbol}`;
        if (!optionCache.has(cacheKey)) optionCache.set(cacheKey, await fetchPeriod(token, {
          segment: 'FNO', symbol: contract.symbol, startDate: entryDate, endDate: entryDate,
        }, spacingMs));
        const entryPremium = quoteAt(optionCache.get(cacheKey), entryTimestamp);
        if (!(entryPremium > 0)) continue;
        const reconstructed = reconstructCallDelta({
          premium: entryPremium, spot: entrySpot, strike: contract.strike, daysToExpiry,
        });
        if (!reconstructed) continue;
        candidates.push({ ...contract, entryPremium, ...reconstructed });
      }
      const selection = selectDeltaBearCall(candidates, rules);
      if (!selection) {
        results.push({ ...base, status: 'DATA_MISSING', reason: '0.20-0.25 delta call with two-step hedge unavailable', indiaVix });
        continue;
      }
      const lotSize = lotSizeFrom(selection) ?? await fetchNseLotSize(underlying, entryDate);
      if (!(lotSize > 0)) {
        results.push({ ...base, status: 'DATA_MISSING', reason: 'Historical contract lot size unavailable', indiaVix, selection });
        continue;
      }
      const exitSignal = firstBearCallExitSignal(detected.bars, entryTimestamp);
      const requestedExit = exitSignal && exitSignal.completedAt.slice(0, 10) <= expiry
        ? firstTimestampAfter(spot, exitSignal.completedAt)
        : `${expiry}T15:15:00+05:30`;
      const legRows = {};
      for (const name of ['shortCall', 'longCall']) {
        legRows[name] = await fetchPeriod(token, {
          segment: 'FNO', symbol: selection[name].symbol, startDate: entryDate, endDate: expiry,
        }, spacingMs);
      }
      const exitTimestamp = commonExitTimestamp(legRows.shortCall, legRows.longCall, requestedExit);
      if (!exitTimestamp) {
        results.push({ ...base, status: 'DATA_MISSING', reason: 'Synchronized spread exit quotes unavailable', indiaVix, selection });
        continue;
      }
      const exitQuotes = {
        shortCall: quoteAt(legRows.shortCall, exitTimestamp),
        longCall: quoteAt(legRows.longCall, exitTimestamp),
      };
      const costs = Object.fromEntries([
        ['normalized', 0], ['stress0_5', 0.5], ['stress1_0', 1],
      ].map(([name, slippagePointsPerLeg]) => [name, evaluateBearCallPosition({
        selection, exitQuotes, lotSize, tradeDate: entryDate, slippagePointsPerLeg,
      })]));
      if (costs.normalized.status !== 'TRADE') {
        results.push({ ...base, ...costs.normalized, indiaVix, selection });
        continue;
      }
      occupiedUntil = exitTimestamp;
      results.push({
        ...base,
        status: 'TRADE',
        indiaVix,
        selection,
        lotSize,
        exitTimestamp,
        exitReason: exitSignal && exitSignal.completedAt.slice(0, 10) <= expiry ? 'EMA5_ABOVE_EMA50' : 'EXPIRY',
        exitQuotes,
        costs,
      });
    }
  }
  return {
    schemaVersion: 1,
    strategy: BEAR_CALL_STRATEGY,
    source: { videoId: 'd3X5TNpZ0NM', published: '2026-06-03' },
    period: { startDate, endDate, warmupStart },
    universe,
    rules,
    assumptions: {
      signalBar: 'Three complete exchange-anchored 120-minute bars per full session; incomplete closing fragment excluded',
      entry: 'Next available underlying minute after the completed signal bar',
      expiry: 'Nearest available monthly stock-option expiry with at least one calendar DTE',
      delta: 'Black-Scholes delta reconstructed from historical option premium with 6% risk-free rate and zero dividend yield',
      hedge: 'Second listed call strike above the short call',
      vix: 'No new entry when India VIX is at or above 20',
      exit: 'Next available synchronized option minute after EMA5 exceeds EMA50; otherwise expiry at/after 15:15',
      overlap: 'Maximum one open spread per underlying',
      missingQuotes: 'No forward-fill or fabricated option prices',
    },
    dataProvider: { name: 'Groww historical API', requests, retries },
    results,
    summary: summarizeBearCallResults(results),
  };
}

function args(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...value] = arg.slice(2).split('='); return [key, value.join('=')];
  }));
}

if (process.argv[1]?.endsWith('groww-backtest.mjs')) {
  const options = args(process.argv.slice(2));
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const result = await backtestStockBearCall({
    token,
    startDate: options.start ?? '2026-06-04',
    endDate: options.end ?? '2026-08-28',
    warmupStart: options.warmup ?? '2026-01-01',
    spacingMs: Number(options.spacing ?? DEFAULT_SPACING_MS),
  });
  fs.writeFileSync(options.out ?? 'stock-bear-call-result.json', JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
}
