import fs from 'node:fs';
import { backtestNifty180, normalizeCandles } from './groww-backtest-nifty-180.mjs';
import { evaluateMomentumPosition } from './nifty-180-momentum-trail.mjs';
import { evaluateSteppedMomentumPosition } from './nifty-180-stepped-trail.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import {
  chooseSingleClosest,
  classifySingleClosestSignal,
} from './nifty-180-single-closest.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_SPACING_MS = 1500;
const CAPITAL = 60000;
const TRAIL_GAP = 20;
const VARIANTS = Object.freeze([
  { key: 'V2', kind: 'continuous', trailStepPoints: null },
  { key: 'V3_5', kind: 'stepped', trailStepPoints: 5 },
  { key: 'V3_10', kind: 'stepped', trailStepPoints: 10 },
]);
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(token, endpoint, params, spacingMs) {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt <= 8; attempt++) {
    lastRequestAt = Date.now();
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-API-VERSION': '1.0',
      },
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < 8) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(5000 * (2 ** attempt), 60000));
      continue;
    }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
  throw new Error(`Groww ${endpoint} exhausted retries`);
}

async function fetchFullSession(token, symbol, date, spacingMs) {
  const payload = await apiGet(token, '/historical/candles', {
    exchange: 'NSE',
    segment: 'FNO',
    groww_symbol: symbol,
    start_time: `${date} 09:25:00`,
    end_time: `${date} 15:29:00`,
    candle_interval: '1minute',
  }, spacingMs);
  return normalizeCandles(payload.candles ?? []);
}

function lotsAffordable(entryPremium, historicalLotSize) {
  if (!(entryPremium > 0) || !(historicalLotSize > 0)) return 0;
  return Math.floor(CAPITAL / (entryPremium * historicalLotSize));
}

function money(position, tradeDate, historicalLotSize) {
  const lots = lotsAffordable(position.entry, historicalLotSize);
  const units = lots * historicalLotSize;
  if (lots < 1) return { affordable: false, lots: 0, units: 0 };
  const base = {
    entryPremium: position.entry,
    exitPremium: position.exit,
    lotSize: units,
    tradeDate,
  };
  return {
    affordable: true,
    capital: CAPITAL,
    lots,
    units,
    premiumCapitalUsed: position.entry * units,
    current: calculateLongOptionRoundTripCosts(base),
    stress0_5: calculateLongOptionRoundTripCosts({ ...base, slippagePointsPerLeg: 0.5 }),
    stress1_0: calculateLongOptionRoundTripCosts({ ...base, slippagePointsPerLeg: 1.0 }),
  };
}

function maxDrawdown(values) {
  let equity = 0;
  let peak = 0;
  let result = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    result = Math.max(result, peak - equity);
  }
  return result;
}

function longestLosingStreak(values) {
  let current = 0;
  let result = 0;
  for (const value of values) {
    if (value < 0) {
      current += 1;
      result = Math.max(result, current);
    } else {
      current = 0;
    }
  }
  return result;
}

function summarize(rows) {
  const scored = rows.filter((row) => row.money.affordable);
  const net = scored.map((row) => row.money.current.netPnl);
  const stress05 = scored.map((row) => row.money.stress0_5.netPnl);
  const stress10 = scored.map((row) => row.money.stress1_0.netPnl);
  const resultCounts = {};
  for (const row of scored) resultCounts[row.result] = (resultCounts[row.result] ?? 0) + 1;
  return {
    trades: scored.length,
    winners: net.filter((value) => value > 0).length,
    losers: net.filter((value) => value < 0).length,
    winRate: scored.length ? net.filter((value) => value > 0).length / scored.length : null,
    totalNetPnl: net.reduce((a, b) => a + b, 0),
    averageNetPnl: scored.length ? net.reduce((a, b) => a + b, 0) / scored.length : null,
    totalNetPnlStress0_5: stress05.reduce((a, b) => a + b, 0),
    totalNetPnlStress1_0: stress10.reduce((a, b) => a + b, 0),
    maxDrawdownRupees: maxDrawdown(net),
    longestLosingStreak: longestLosingStreak(net),
    resultCounts,
  };
}

function evaluateVariant(candles, signal, variant) {
  if (variant.kind === 'continuous') {
    return evaluateMomentumPosition(candles, signal, { trailGapPoints: TRAIL_GAP });
  }
  return evaluateSteppedMomentumPosition(candles, signal, {
    trailStepPoints: variant.trailStepPoints,
    trailGapPoints: TRAIL_GAP,
  });
}

function baseSession(row) {
  return {
    date: row.date,
    oldBaselineStatus: row.status,
    oldBaselineReason: row.reason ?? null,
    spot925: row.spot925 ?? null,
    expiry: row.expiry ?? null,
    callSelection: row.callSelection ?? null,
    putSelection: row.putSelection ?? null,
    candidateFetches: row.candidateFetches ?? null,
  };
}

export async function backtestSingleClosestFirstClose({
  token,
  startDate,
  endDate,
  historicalLotSize,
  spacingMs = DEFAULT_SPACING_MS,
}) {
  if (!(historicalLotSize > 0)) throw new Error('historicalLotSize is required');

  // Use the prior historical pipeline only to reproduce each day's 09:25
  // actual-contract CE/PE selections. Its old signal outcome is ignored below.
  const selectionSource = await backtestNifty180({
    token,
    startDate,
    endDate,
    maxCandidatesPerSide: 8,
    lotSize: null,
    requestSpacingMsOverride: spacingMs,
  });

  const sessions = [];
  const variants = Object.fromEntries(VARIANTS.map((variant) => [variant.key, []]));

  for (const row of selectionSource.results) {
    const base = baseSession(row);
    if (row.status === 'DATA_MISSING' || row.status === 'CANDIDATE_BOUNDARY') {
      sessions.push({ ...base, status: row.status, reason: row.reason });
      continue;
    }

    const selected = chooseSingleClosest(row.callSelection, row.putSelection);
    if (!selected?.symbol) {
      sessions.push({ ...base, status: 'DATA_MISSING', reason: 'No single closest 09:25 contract could be selected' });
      continue;
    }

    const candles = await fetchFullSession(token, selected.symbol, row.date, spacingMs);
    const classified = classifySingleClosestSignal(candles);
    if (classified.status !== 'SIGNAL') {
      sessions.push({
        ...base,
        status: classified.status,
        reason: classified.reason,
        selectedContract: selected,
        selectedDistanceFrom180: Math.abs(selected.premium - 180),
        signalTime: classified.signalTime ?? null,
        signalClose: classified.signalClose ?? null,
        entryTime: classified.entryTime ?? null,
        entry: classified.entry ?? null,
      });
      continue;
    }

    const variantPositions = {};
    let invalid = null;
    for (const variant of VARIANTS) {
      const position = evaluateVariant(candles, classified.signal, variant);
      if (!position || position.rejected) {
        invalid = position ?? { reason: 'No executable holding interval' };
        break;
      }
      variantPositions[variant.key] = position;
    }
    if (invalid) {
      sessions.push({
        ...base,
        status: 'NO_TRADE',
        reason: invalid.reason ?? 'No executable holding interval',
        selectedContract: selected,
        selectedDistanceFrom180: Math.abs(selected.premium - 180),
        signalTime: classified.signalTime,
        signalClose: classified.signalClose,
        entryTime: invalid.entryTime ?? classified.entryTime,
        entry: invalid.entry ?? classified.entry,
      });
      continue;
    }

    sessions.push({
      ...base,
      status: 'TRADE',
      reason: null,
      selectedContract: selected,
      selectedDistanceFrom180: Math.abs(selected.premium - 180),
      side: selected.optionType,
      signalTime: classified.signalTime,
      signalClose: classified.signalClose,
      entryTime: classified.entryTime,
      entry: classified.entry,
    });

    for (const variant of VARIANTS) {
      const position = variantPositions[variant.key];
      variants[variant.key].push({
        date: row.date,
        variant: variant.key,
        side: selected.optionType,
        contract: selected,
        spot925: row.spot925,
        expiry: row.expiry,
        selectedDistanceFrom180: Math.abs(selected.premium - 180),
        signalTime: classified.signalTime,
        signalClose: classified.signalClose,
        trailGapPoints: TRAIL_GAP,
        trailStepPoints: variant.trailStepPoints,
        ...position,
        money: money(position, row.date, historicalLotSize),
      });
    }
  }

  const statusCounts = {};
  for (const session of sessions) statusCounts[session.status] = (statusCounts[session.status] ?? 0) + 1;

  return {
    methodology: {
      study: 'single-closest-contract-first-completed-close-above-180',
      contractSelection: 'At 09:25 choose exactly one of the selected CE/PE actual contracts by minimum absolute premium distance from ₹180; above/below does not matter',
      signal: 'Monitor only that one contract; first completed 1-minute close > ₹180 from 09:30 through 09:44 qualifies even if it was never <=₹180',
      execution: 'Enter at the next 1-minute bar open; require 160 < entry < 220',
      sideChoice: 'Side is fixed by the single closest 09:25 contract; there is no CE/PE signal race and therefore no same-minute ambiguity',
      variants: {
        V2: 'continuous 20-point trail after activation at ₹220',
        V3_5: '5-point stepped trail with 20-point gap',
        V3_10: '10-point stepped trail with 20-point gap',
      },
      capital: CAPITAL,
      historicalLotSize,
      overnight: false,
      historicalSelectionCaveat: 'CE and PE candidates are reproduced by the prior historical progressive ITM selection pipeline; this study changes side choice and signal timing, not that upstream data-fetch process',
    },
    period: { startDate, endDate },
    selectionSourceDiagnostics: selectionSource.diagnostics,
    sessionStatusCounts: statusCounts,
    sessionLedger: sessions,
    variants: Object.fromEntries(VARIANTS.map((variant) => [variant.key, {
      summary: summarize(variants[variant.key]),
      trades: variants[variant.key],
    }])),
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => {
    const [key, ...rest] = value.slice(2).split('=');
    return [key, rest.join('=')];
  }));
}

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const args = parseArgs(process.argv.slice(2));
  const startDate = args.start;
  const endDate = args.end;
  const historicalLotSize = Number(args['lot-size']);
  if (!startDate || !endDate || !(historicalLotSize > 0)) {
    throw new Error('--start, --end and --lot-size are required');
  }
  const result = await backtestSingleClosestFirstClose({
    token,
    startDate,
    endDate,
    historicalLotSize,
    spacingMs: Number(process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_SPACING_MS),
  });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith('groww-backtest-nifty-180-single-closest.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
