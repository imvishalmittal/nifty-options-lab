import fs from 'node:fs';
import { backtestNifty180, normalizeCandles } from './groww-backtest-nifty-180.mjs';
import { evaluateMomentumPosition } from './nifty-180-momentum-trail.mjs';
import { evaluateSteppedMomentumPosition } from './nifty-180-stepped-trail.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';

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

function lotsAffordable(entryPremium, lotSize) {
  if (!(entryPremium > 0) || !(lotSize > 0)) return 0;
  return Math.floor(CAPITAL / (entryPremium * lotSize));
}

function moneyScenarios(position, tradeDate, historicalLotSize) {
  const lots = lotsAffordable(position.entry, historicalLotSize);
  const units = lots * historicalLotSize;
  if (lots < 1) return { affordable: false, lots: 0, units: 0 };
  const common = {
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
    current: calculateLongOptionRoundTripCosts(common),
    stress0_5: calculateLongOptionRoundTripCosts({ ...common, slippagePointsPerLeg: 0.5 }),
    stress1_0: calculateLongOptionRoundTripCosts({ ...common, slippagePointsPerLeg: 1.0 }),
  };
}

function maxDrawdown(values) {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return drawdown;
}

function longestLosingStreak(values) {
  let current = 0;
  let longest = 0;
  for (const value of values) {
    if (value < 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function summarize(rows) {
  const scored = rows.filter((row) => row.money?.affordable);
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

function compactSession(row) {
  return {
    date: row.date,
    status: row.status,
    reason: row.reason ?? null,
    spot925: row.spot925 ?? null,
    expiry: row.expiry ?? null,
    callSelection: row.callSelection ?? null,
    putSelection: row.putSelection ?? null,
    candidateFetches: row.candidateFetches ?? null,
    side: row.side ?? null,
    contract: row.contract ?? null,
    signalTime: row.signalTime ?? null,
    signalClose: row.signalClose ?? null,
    entry: row.entry ?? null,
    entryTime: row.entryTime ?? null,
  };
}

export async function backtestFirstCloseStudy({
  token,
  startDate,
  endDate,
  historicalLotSize,
  spacingMs = DEFAULT_SPACING_MS,
}) {
  if (!(historicalLotSize > 0)) throw new Error('historicalLotSize is required');

  // The research branch changes only evaluatePremiumDay's confirmation rule.
  // Contract selection, 09:25 snapshot, expiry choice, entry band and all exit
  // engines are otherwise the same code paths used by the prior artifacts.
  const baseline = await backtestNifty180({
    token,
    startDate,
    endDate,
    maxCandidatesPerSide: 8,
    lotSize: null,
    requestSpacingMsOverride: spacingMs,
  });
  const baselineTrades = baseline.results.filter((row) => row.status === 'TRADE');
  const fullSessionCache = new Map();
  const variantRows = Object.fromEntries(VARIANTS.map((variant) => [variant.key, []]));

  for (const trade of baselineTrades) {
    const symbol = trade.contract?.symbol;
    if (!symbol) continue;
    const key = `${trade.date}:${symbol}`;
    if (!fullSessionCache.has(key)) {
      fullSessionCache.set(key, await fetchFullSession(token, symbol, trade.date, spacingMs));
    }
    const candles = fullSessionCache.get(key);
    const signal = candles.find((candle) => candle.timestamp === trade.signalTime);
    if (!signal) continue;

    for (const variant of VARIANTS) {
      const position = evaluateVariant(candles, signal, variant);
      if (!position || position.rejected) continue;
      variantRows[variant.key].push({
        date: trade.date,
        side: trade.side,
        contract: trade.contract,
        spot925: trade.spot925,
        expiry: trade.expiry,
        signalTime: trade.signalTime,
        signalClose: trade.signalClose,
        variant: variant.key,
        trailGapPoints: TRAIL_GAP,
        trailStepPoints: variant.trailStepPoints,
        ...position,
        money: moneyScenarios(position, trade.date, historicalLotSize),
      });
    }
  }

  const sessionLedger = baseline.results.map(compactSession);
  const sessionStatusCounts = {};
  for (const row of sessionLedger) sessionStatusCounts[row.status] = (sessionStatusCounts[row.status] ?? 0) + 1;

  return {
    methodology: {
      study: 'first-completed-close-above-180',
      contractSelection: 'closest 09:25 premium to ₹180; same historical selection pipeline as prior artifacts',
      signal: 'first completed 1-minute close > ₹180 from 09:30 through 09:44; no prior <= ₹180 close required',
      execution: 'next 1-minute bar open; entry must satisfy 160 < entry < 220',
      variants: {
        V2: 'continuous 20-point trail after activation at ₹220',
        V3_5: '5-point stepped trail with 20-point gap',
        V3_10: '10-point stepped trail with 20-point gap',
      },
      capital: CAPITAL,
      historicalLotSize,
      overnight: false,
      isolation: 'Only the confirmation rule is intentionally changed in this research branch',
    },
    period: { startDate, endDate },
    baselineDiagnostics: baseline.diagnostics,
    sessionStatusCounts,
    sessionLedger,
    variants: Object.fromEntries(VARIANTS.map((variant) => [variant.key, {
      summary: summarize(variantRows[variant.key]),
      trades: variantRows[variant.key],
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
  const result = await backtestFirstCloseStudy({
    token,
    startDate,
    endDate,
    historicalLotSize,
    spacingMs: Number(process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_SPACING_MS),
  });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith('groww-backtest-nifty-180-first-close.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
