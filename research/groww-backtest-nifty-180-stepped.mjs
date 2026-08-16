import fs from 'node:fs';
import { backtestNifty180, normalizeCandles } from './groww-backtest-nifty-180.mjs';
import { evaluateSteppedMomentumPosition } from './nifty-180-stepped-trail.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_SPACING_MS = 1500;
const STEP_SIZES = Object.freeze([5, 10]);
const TRAIL_GAP = 20;
const CAPITAL = 60000;
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(token, endpoint, params, spacingMs) {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt <= 8; attempt++) {
    lastRequestAt = Date.now();
    const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < 8) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(5000 * (2 ** attempt), 60000));
      continue;
    }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
  throw new Error(`Groww ${endpoint} exhausted retries`);
}

async function fetchFullSession(token, symbol, date, spacingMs) {
  const payload = await apiGet(token, '/historical/candles', {
    exchange: 'NSE', segment: 'FNO', groww_symbol: symbol,
    start_time: `${date} 09:25:00`, end_time: `${date} 15:29:00`, candle_interval: '1minute',
  }, spacingMs);
  return normalizeCandles(payload.candles ?? []);
}

function lotsAffordable(entryPremium, lotSize) {
  return Math.floor(CAPITAL / (entryPremium * lotSize));
}

function maxDrawdown(values) {
  let equity = 0, peak = 0, drawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return drawdown;
}

function summarize(rows) {
  const net = rows.map((r) => r.costs.netPnl);
  return {
    trades: rows.length,
    winners: net.filter((v) => v > 0).length,
    losers: net.filter((v) => v < 0).length,
    winRate: rows.length ? net.filter((v) => v > 0).length / rows.length : null,
    totalNetPnl: net.reduce((a, b) => a + b, 0),
    averageNetPnl: rows.length ? net.reduce((a, b) => a + b, 0) / rows.length : null,
    maxDrawdownRupees: maxDrawdown(net),
    grossBreakevenOrBetter: rows.filter((r) => r.exit >= r.entry).length,
  };
}

export async function backtestStepped({ token, startDate, endDate, historicalLotSize, spacingMs = DEFAULT_SPACING_MS }) {
  const baseline = await backtestNifty180({ token, startDate, endDate, maxCandidatesPerSide: 8, lotSize: null, requestSpacingMsOverride: spacingMs });
  const baselineTrades = baseline.results.filter((r) => r.status === 'TRADE');
  const fullSessionCache = new Map();
  const variants = Object.fromEntries(STEP_SIZES.map((step) => [step, []]));

  for (const trade of baselineTrades) {
    const symbol = trade.contract?.symbol;
    if (!symbol) continue;
    const key = `${trade.date}:${symbol}`;
    if (!fullSessionCache.has(key)) fullSessionCache.set(key, await fetchFullSession(token, symbol, trade.date, spacingMs));
    const candles = fullSessionCache.get(key);
    const signal = candles.find((c) => c.timestamp === trade.signalTime);
    if (!signal) continue;

    for (const step of STEP_SIZES) {
      const position = evaluateSteppedMomentumPosition(candles, signal, { trailStepPoints: step, trailGapPoints: TRAIL_GAP });
      if (!position || position.rejected) continue;
      const lots = lotsAffordable(position.entry, historicalLotSize);
      if (lots < 1) continue;
      const units = lots * historicalLotSize;
      const costs = calculateLongOptionRoundTripCosts({ entryPremium: position.entry, exitPremium: position.exit, lotSize: units, tradeDate: trade.date });
      variants[step].push({
        date: trade.date, side: trade.side, contract: trade.contract, expiry: trade.expiry,
        signalTime: trade.signalTime, trailStepPoints: step, trailGapPoints: TRAIL_GAP,
        lots, units, ...position, costs,
      });
    }
  }

  return {
    methodology: {
      source: 'Frozen V1 actual-contract selection and entry signal',
      initialStop: 160,
      entryBand: '160 < entry < 220',
      trailGapPoints: TRAIL_GAP,
      trailStepPointsTested: STEP_SIZES,
      paperCandidateStep: 10,
      trailUpdate: 'completed 1-minute high; stepped stop effective next bar only',
      capital: CAPITAL,
      historicalLotSize,
      overnight: false,
    },
    period: { startDate, endDate },
    baselineDiagnostics: baseline.diagnostics,
    variants: Object.fromEntries(STEP_SIZES.map((step) => [step, { summary: summarize(variants[step]), trades: variants[step] }])),
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((v) => v.startsWith('--')).map((v) => {
    const [key, ...rest] = v.slice(2).split('='); return [key, rest.join('=')];
  }));
}

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const args = parseArgs(process.argv.slice(2));
  const startDate = args.start;
  const endDate = args.end;
  const historicalLotSize = Number(args['lot-size']);
  if (!startDate || !endDate || !(historicalLotSize > 0)) throw new Error('--start, --end and --lot-size are required');
  const result = await backtestStepped({ token, startDate, endDate, historicalLotSize, spacingMs: Number(process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_SPACING_MS) });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith('groww-backtest-nifty-180-stepped.mjs')) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
