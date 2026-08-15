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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export function normalizeCandles(raw = []) {
  return raw.map((c) => ({
    timestamp: normalizeTimestamp(c[0]),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[5] ?? 0),
    openInterest: c[6] == null ? null : Number(c[6]),
  })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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

async function apiGet(token, endpoint, params, { maxRetries = 5 } = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(1000 * (2 ** attempt), 15000);
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

async function loadCandidateSet(token, date, candidates, pauseMs = 175) {
  const rows = [];
  for (const candidate of candidates) {
    const candles = await fetchCandles(token, {
      segment: 'FNO',
      growwSymbol: candidate.symbol,
      startTime: `${date} 09:25:00`,
      endTime: `${date} 09:45:00`,
      interval: '1minute',
    });
    const at925 = candleAt925(candles);
    const premium = at925?.open ?? null;
    rows.push({ candidate, premium, at925, candles });
    if (pauseMs) await sleep(pauseMs);
  }
  return rows;
}

function selectCandidate(rows) {
  const candidates = rows.map((r) => r.candidate);
  const premiumBySymbol = Object.fromEntries(rows.map((r) => [r.candidate.symbol, r.premium]));
  const selected = chooseClosestPremium(candidates, premiumBySymbol, PREMIUM_RULES.referencePremium);
  if (!selected) return null;
  const row = rows.find((r) => r.candidate.symbol === selected.symbol);
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

function addCount(map, key) {
  const label = key || 'UNSPECIFIED';
  map[label] = (map[label] ?? 0) + 1;
}

function average(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : null;
}

function attachCostScenarios(evaluated, lotSize) {
  if (evaluated.status !== 'TRADE' || !(lotSize > 0)) return evaluated;
  const inputs = {
    entryPremium: evaluated.entry,
    exitPremium: evaluated.exit,
    lotSize,
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
  pauseMs = 175,
  lotSize = null,
}) {
  const spotCandles = await fetchCandles(token, {
    segment: 'CASH',
    growwSymbol: 'NSE-NIFTY',
    startTime: `${startDate} 09:15:00`,
    endTime: `${endDate} 09:45:00`,
    interval: '1minute',
  });
  const dates = tradingDates(spotCandles).filter((d) => d >= startDate && d <= endDate);
  const years = [...new Set(dates.map((d) => Number(d.slice(0, 4))))];
  const expiries = (await Promise.all(years.map((year) => fetchExpiries(token, year)))).flat().sort();
  const contractCache = new Map();
  const results = [];

  for (const date of dates) {
    const dateSpot = spotCandles.filter((c) => dateOf(c.timestamp) === date);
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
    if (!contractCache.has(expiry)) contractCache.set(expiry, await fetchContracts(token, expiry));
    const contracts = contractCache.get(expiry);

    const ceCandidates = nearestItmCandidates(contracts, spot, 'CE', maxCandidatesPerSide);
    const peCandidates = nearestItmCandidates(contracts, spot, 'PE', maxCandidatesPerSide);
    if (!ceCandidates.length || !peCandidates.length) {
      results.push({ date, status: 'DATA_MISSING', reason: 'ITM CE/PE candidate set unavailable', spot, expiry });
      continue;
    }

    console.error(`${date}: spot ${spot.toFixed(2)}, expiry ${expiry}; fetching ${ceCandidates.length} CE + ${peCandidates.length} PE candidates`);
    const ceRows = await loadCandidateSet(token, date, ceCandidates, pauseMs);
    const peRows = await loadCandidateSet(token, date, peCandidates, pauseMs);
    const callPick = selectCandidate(ceRows);
    const putPick = selectCandidate(peRows);

    if (!callPick || !putPick) {
      results.push({ date, status: 'DATA_MISSING', reason: 'No 09:25 premium for one or both sides', spot, expiry });
      continue;
    }

    const callBoundary = callPick.candidate.symbol === ceCandidates.at(-1)?.symbol;
    const putBoundary = putPick.candidate.symbol === peCandidates.at(-1)?.symbol;
    if (callBoundary || putBoundary) {
      results.push({
        date,
        status: 'CANDIDATE_BOUNDARY',
        reason: 'Closest premium landed on deepest fetched ITM candidate; enlarge search before scoring',
        spot925: spot,
        expiry,
        callSelection: callPick.selected,
        putSelection: putPick.selected,
      });
      continue;
    }

    const evaluated = attachCostScenarios(evaluatePremiumDay({
      call: callPick.selected,
      put: putPick.selected,
      callCandles: callPick.candles,
      putCandles: putPick.candles,
    }), lotSize);

    results.push({
      date,
      spot925: spot,
      expiry,
      callSelection: callPick.selected,
      putSelection: putPick.selected,
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
      costSchedule: lotSize ? 'Groww NSE equity-option charges current in 2026; used as current-economics stress, not claimed as historical fee schedule' : null,
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
  const result = await backtestNifty180({ token, startDate, endDate, maxCandidatesPerSide, lotSize });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith('groww-backtest-nifty-180.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
