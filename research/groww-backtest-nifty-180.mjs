import fs from 'node:fs';
import {
  PREMIUM_RULES,
  nearestExpiry,
  itmContracts,
  chooseClosestPremium,
  evaluatePremiumDay,
} from './nifty-180-premium-strategy.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_REQUEST_SPACING_MS = 1500;
const SAFE_ONE_MINUTE_CHUNK_DAYS = 28;
let requestSpacingMs = DEFAULT_REQUEST_SPACING_MS;
let lastRequestAt = 0;
let apiRequestCount = 0;
let rateLimitRetries = 0;
let contractHistoryFetches = 0;
let contractHistoryCacheHits = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleRequest() {
  const wait = Math.max(0, requestSpacingMs - (Date.now() - lastRequestAt));
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

function normalizeTimestamp(value) {
  const text = String(value).replace(' ', 'T');
  if (/([zZ]|[+-]\d\d:\d\d)$/.test(text)) return text;
  return `${text}+05:30`;
}

function dateOf(timestamp) {
  return String(timestamp).slice(0, 10);
}

function timeOf(timestamp) {
  const m = String(timestamp).match(/T(\d{2}:\d{2})/);
  return m?.[1] ?? null;
}

function parseDateUtc(date) {
  return new Date(`${date}T00:00:00Z`);
}

function formatDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function plusDays(date, days) {
  const value = parseDateUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return formatDateUtc(value);
}

export function splitDateRange(startDate, endDate, maxCalendarDays = SAFE_ONE_MINUTE_CHUNK_DAYS) {
  if (!(maxCalendarDays > 0)) throw new Error('maxCalendarDays must be positive');
  if (startDate > endDate) return [];
  const chunks = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const proposedEnd = plusDays(cursor, maxCalendarDays - 1);
    const chunkEnd = proposedEnd < endDate ? proposedEnd : endDate;
    chunks.push({ startDate: cursor, endDate: chunkEnd });
    cursor = plusDays(chunkEnd, 1);
  }
  return chunks;
}

export function normalizeCandles(raw = []) {
  const normalized = raw.map((c) => ({
    timestamp: normalizeTimestamp(c[0]),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[5] ?? 0),
    openInterest: c[6] == null ? null : Number(c[6]),
  })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Groww occasionally returns multiple fragments for the same one-minute
  // timestamp. Treat them as one completed candle before any signal or
  // next-bar lookup, using the same canonical merge as opportunity research.
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

export function candlesForDate(candles, date, startTime = null, endTime = null) {
  return candles.filter((c) => {
    if (dateOf(c.timestamp) !== date) return false;
    const t = timeOf(c.timestamp);
    if (startTime && t < startTime) return false;
    if (endTime && t > endTime) return false;
    return true;
  });
}

function candleAt925(candles) {
  return candles.find((c) => timeOf(c.timestamp) === '09:25') ?? null;
}

export function spotAt925(candles) {
  return candleAt925(candles)?.open ?? null;
}

export function premiumAt925(candles) {
  return candleAt925(candles)?.open ?? null;
}

export function tradingDates(candles) {
  return [...new Set(candles.map((c) => dateOf(c.timestamp)))].sort();
}

export function nearestItmCandidates(contracts, spot, optionType, maxCandidates = 8) {
  return itmContracts(contracts, spot, optionType).slice(0, maxCandidates);
}

async function apiGet(token, endpoint, params, { maxRetries = 8 } = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await throttleRequest();
    apiRequestCount += 1;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-API-VERSION': '1.0',
      },
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < maxRetries) {
      if (response.status === 429) rateLimitRetries += 1;
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

async function fetchCandles(token, { segment, growwSymbol, startTime, endTime, interval = '1minute' }) {
  const payload = await apiGet(token, '/historical/candles', {
    exchange: 'NSE',
    segment,
    groww_symbol: growwSymbol,
    start_time: startTime,
    end_time: endTime,
    candle_interval: interval,
  });
  return normalizeCandles(payload.candles ?? []);
}

async function fetchOneMinutePeriod(token, {
  segment,
  growwSymbol,
  startDate,
  endDate,
  startClock,
  endClock,
}) {
  const rows = [];
  for (const chunk of splitDateRange(startDate, endDate)) {
    const chunkRows = await fetchCandles(token, {
      segment,
      growwSymbol,
      startTime: `${chunk.startDate} ${startClock}:00`,
      endTime: `${chunk.endDate} ${endClock}:00`,
      interval: '1minute',
    });
    rows.push(...chunkRows);
  }
  return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchExpiries(token, year) {
  const payload = await apiGet(token, '/historical/expiries', {
    exchange: 'NSE',
    underlying_symbol: 'NIFTY',
    year,
  });
  return payload.expiries ?? [];
}

async function fetchContracts(token, expiryDate) {
  const payload = await apiGet(token, '/historical/contracts', {
    exchange: 'NSE',
    underlying_symbol: 'NIFTY',
    expiry_date: expiryDate,
  });
  return payload.contracts ?? [];
}

function enrichSelection(row) {
  const selected = row.selected;
  return {
    ...row,
    selected: {
      ...selected,
      premiumDistanceFrom180: Math.abs(selected.premium - PREMIUM_RULES.referencePremium),
      volume925: row.at925?.volume ?? null,
      openInterest925: row.at925?.openInterest ?? null,
    },
  };
}

async function loadContractHistory(token, candidate, {
  startDate,
  endDate,
  historyCache,
}) {
  const key = candidate.symbol;
  if (historyCache.has(key)) {
    contractHistoryCacheHits += 1;
    return historyCache.get(key);
  }
  contractHistoryFetches += 1;
  const rows = await fetchOneMinutePeriod(token, {
    segment: 'FNO',
    growwSymbol: candidate.symbol,
    startDate,
    endDate,
    startClock: '09:25',
    endClock: '09:45',
  });
  historyCache.set(key, rows);
  return rows;
}

async function selectProgressively(token, date, candidates, context) {
  const rows = [];
  let bracketed = false;

  // Candidate histories are loaded once for the whole test period and cached.
  // Selection still sees only the current date's 09:25 candle. Batching future
  // raw rows in one HTTP request is a transport optimization, not look-ahead.
  for (const candidate of candidates) {
    const history = await loadContractHistory(token, candidate, context);
    const dayRows = candlesForDate(history, date, '09:25', '09:45');
    const at925 = candleAt925(dayRows);
    const premium = at925?.open ?? null;
    rows.push({ candidate, premium, at925, dayRows });
    if (Number.isFinite(premium) && premium >= PREMIUM_RULES.referencePremium) {
      bracketed = true;
      break;
    }
  }

  const usable = rows.filter((r) => Number.isFinite(r.premium));
  if (!usable.length) return { pick: null, boundary: false, fetchedCandidates: rows.length };
  const premiumBySymbol = Object.fromEntries(usable.map((r) => [r.candidate.symbol, r.premium]));
  const selected = chooseClosestPremium(usable.map((r) => r.candidate), premiumBySymbol, PREMIUM_RULES.referencePremium);
  const row = usable.find((r) => r.candidate.symbol === selected?.symbol);
  if (!row || !selected) return { pick: null, boundary: false, fetchedCandidates: rows.length };

  const exhausted = rows.length === candidates.length;
  const boundary = exhausted && !bracketed && usable.at(-1).premium < PREMIUM_RULES.referencePremium;
  return {
    pick: enrichSelection({ ...row, selected }),
    boundary,
    fetchedCandidates: rows.length,
  };
}

function addCount(map, key) {
  const label = key || 'UNSPECIFIED';
  map[label] = (map[label] ?? 0) + 1;
}

function average(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : null;
}

export function attachCostScenarios(evaluated, lotSize, tradeDate = null) {
  if (evaluated.status !== 'TRADE' || !(lotSize > 0)) return evaluated;
  const inputs = {
    entryPremium: evaluated.entry,
    exitPremium: evaluated.exit,
    lotSize,
    tradeDate,
  };
  return {
    ...evaluated,
    grossPnlRupees: evaluated.pnlPerUnit * lotSize,
    costs: {
      currentGroww2026: calculateLongOptionRoundTripCosts(inputs),
      slippageStress0_5: calculateLongOptionRoundTripCosts({ ...inputs, slippagePointsPerLeg: 0.5 }),
      slippageStress1_0: calculateLongOptionRoundTripCosts({ ...inputs, slippagePointsPerLeg: 1.0 }),
    },
  };
}

export async function backtestNifty180({
  token,
  startDate,
  endDate,
  maxCandidatesPerSide = 8,
  lotSize = null,
  requestSpacingMsOverride = DEFAULT_REQUEST_SPACING_MS,
}) {
  requestSpacingMs = Math.max(0, Number(requestSpacingMsOverride) || DEFAULT_REQUEST_SPACING_MS);
  lastRequestAt = 0;
  apiRequestCount = 0;
  rateLimitRetries = 0;
  contractHistoryFetches = 0;
  contractHistoryCacheHits = 0;

  const spotCandles = await fetchOneMinutePeriod(token, {
    segment: 'CASH',
    growwSymbol: 'NSE-NIFTY',
    startDate,
    endDate,
    startClock: '09:15',
    endClock: '09:45',
  });
  const dates = tradingDates(spotCandles).filter((d) => d >= startDate && d <= endDate);
  const years = [...new Set(dates.map((d) => Number(d.slice(0, 4))))];
  const expiries = [];
  for (const year of years) expiries.push(...await fetchExpiries(token, year));
  expiries.sort();

  const contractsByExpiry = new Map();
  const historyCache = new Map();
  const context = { startDate, endDate, historyCache };
  const results = [];

  for (const date of dates) {
    const dateSpot = candlesForDate(spotCandles, date, '09:15', '09:45');
    const spot = spotAt925(dateSpot);
    if (!Number.isFinite(spot)) {
      results.push({ date, status: 'DATA_MISSING', reason: 'No 09:25 NIFTY spot open' });
      continue;
    }

    const expiry = nearestExpiry(expiries, date);
    if (!expiry) {
      results.push({ date, status: 'DATA_MISSING', reason: 'No contemporaneous NIFTY expiry' });
      continue;
    }
    if (!contractsByExpiry.has(expiry)) contractsByExpiry.set(expiry, await fetchContracts(token, expiry));
    const contracts = contractsByExpiry.get(expiry);

    const ceCandidates = nearestItmCandidates(contracts, spot, 'CE', maxCandidatesPerSide);
    const peCandidates = nearestItmCandidates(contracts, spot, 'PE', maxCandidatesPerSide);
    if (!ceCandidates.length || !peCandidates.length) {
      results.push({ date, status: 'DATA_MISSING', reason: 'ITM CE/PE candidate set unavailable', spot925: spot, expiry });
      continue;
    }

    console.error(`${date}: spot ${spot.toFixed(2)}, expiry ${expiry}; cached progressive ₹180 selection`);
    const ceSelection = await selectProgressively(token, date, ceCandidates, context);
    const peSelection = await selectProgressively(token, date, peCandidates, context);
    const callPick = ceSelection.pick;
    const putPick = peSelection.pick;

    if (!callPick || !putPick) {
      results.push({ date, status: 'DATA_MISSING', reason: 'No 09:25 premium for one or both sides', spot925: spot, expiry });
      continue;
    }

    if (ceSelection.boundary || peSelection.boundary) {
      results.push({
        date,
        status: 'CANDIDATE_BOUNDARY',
        reason: '₹180 was not bracketed before the maximum ITM search depth',
        spot925: spot,
        expiry,
        callSelection: callPick.selected,
        putSelection: putPick.selected,
        candidateFetches: { ce: ceSelection.fetchedCandidates, pe: peSelection.fetchedCandidates },
      });
      continue;
    }

    const evaluated = attachCostScenarios(evaluatePremiumDay({
      call: callPick.selected,
      put: putPick.selected,
      callCandles: callPick.dayRows,
      putCandles: putPick.dayRows,
    }), lotSize, date);

    results.push({
      date,
      spot925: spot,
      expiry,
      callSelection: callPick.selected,
      putSelection: putPick.selected,
      candidateFetches: { ce: ceSelection.fetchedCandidates, pe: peSelection.fetchedCandidates },
      ...evaluated,
    });
  }

  const trades = results.filter((r) => r.status === 'TRADE');
  const targets = trades.filter((r) => r.result === 'TARGET').length;
  const stops = trades.filter((r) => r.result === 'STOP').length;
  const timeExits = trades.filter((r) => r.result === 'TIME').length;
  const pnlPerUnit = trades.reduce((sum, r) => sum + r.pnlPerUnit, 0);
  const noTradeReasons = {};
  for (const r of results.filter((r) => r.status === 'NO_TRADE')) addCount(noTradeReasons, r.reason);

  const netCurrent = trades.map((r) => r.costs?.currentGroww2026?.netPnl).filter(Number.isFinite);
  const netStress05 = trades.map((r) => r.costs?.slippageStress0_5?.netPnl).filter(Number.isFinite);
  const netStress10 = trades.map((r) => r.costs?.slippageStress1_0?.netPnl).filter(Number.isFinite);

  return {
    rules: PREMIUM_RULES,
    period: { startDate, endDate },
    executionModel: {
      lotSize,
      requestSpacingMs,
      oneMinuteChunkDays: SAFE_ONE_MINUTE_CHUNK_DAYS,
      selector: 'cached whole-period contract histories; current-date 09:25 ITM search until ₹180 is bracketed',
      costSchedule: lotSize ? 'Groww NSE equity-option charges with date-sensitive STT: 0.10% through 2026-03-31 and 0.15% from 2026-04-01' : null,
      slippageStressPointsPerLeg: lotSize ? [0, 0.5, 1.0] : [],
    },
    diagnostics: {
      tradingDates: dates.length,
      scoredTrades: trades.length,
      targets,
      stops,
      timeExits,
      ambiguousDays: results.filter((r) => r.status === 'AMBIGUOUS').length,
      noTradeDays: results.filter((r) => r.status === 'NO_TRADE').length,
      noTradeReasons,
      missingDays: results.filter((r) => r.status === 'DATA_MISSING').length,
      boundaryDays: results.filter((r) => r.status === 'CANDIDATE_BOUNDARY').length,
      apiRequestCount,
      rateLimitRetries,
      contractHistoryFetches,
      contractHistoryCacheHits,
      uniqueContractHistories: historyCache.size,
      averageCandidateFetchesCE: average(results.map((r) => r.candidateFetches?.ce)),
      averageCandidateFetchesPE: average(results.map((r) => r.candidateFetches?.pe)),
      totalPnlPerUnitBeforeCosts: pnlPerUnit,
      averagePnlPerUnitBeforeCosts: trades.length ? pnlPerUnit / trades.length : null,
      averageEntryPremium: average(trades.map((r) => r.entry)),
      averageEntryMinusReference: average(trades.map((r) => r.entry - PREMIUM_RULES.referencePremium)),
      averageSelectedPremiumDistanceCE: average(results.map((r) => r.callSelection?.premiumDistanceFrom180)),
      averageSelectedPremiumDistancePE: average(results.map((r) => r.putSelection?.premiumDistanceFrom180)),
      totalNetPnlRupeesCurrentCosts: netCurrent.length === trades.length ? netCurrent.reduce((a, b) => a + b, 0) : null,
      totalNetPnlRupeesStress0_5: netStress05.length === trades.length ? netStress05.reduce((a, b) => a + b, 0) : null,
      totalNetPnlRupeesStress1_0: netStress10.length === trades.length ? netStress10.reduce((a, b) => a + b, 0) : null,
    },
    results,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((v) => v.startsWith('--')).map((v) => {
    const [key, ...rest] = v.slice(2).split('=');
    return [key, rest.join('=')];
  }));
}

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const args = parseArgs(process.argv.slice(2));
  const startDate = args.start || '2026-08-10';
  const endDate = args.end || '2026-08-14';
  const maxCandidatesPerSide = Number(args.candidates || 8);
  const lotSize = args['lot-size'] ? Number(args['lot-size']) : null;
  const spacing = args['request-spacing-ms'] ? Number(args['request-spacing-ms']) : Number(process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_REQUEST_SPACING_MS);
  const result = await backtestNifty180({ token, startDate, endDate, maxCandidatesPerSide, lotSize, requestSpacingMsOverride: spacing });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith('groww-backtest-nifty-180.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
