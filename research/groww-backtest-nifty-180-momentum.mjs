import fs from 'node:fs';
import { backtestNifty180, normalizeCandles } from './groww-backtest-nifty-180.mjs';
import { evaluateMomentumPosition, lotsAffordable } from './nifty-180-momentum-trail.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_SPACING_MS = 1500;
const TRAIL_GAPS = Object.freeze([5, 10, 15, 20]);
const CAPITALS = Object.freeze([50000, 60000, 70000]);
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

function moneyScenarios(position, tradeDate, historicalLotSize) {
  const byCapital = {};
  for (const capital of CAPITALS) {
    const lots = lotsAffordable({ capital, entryPremium: position.entry, lotSize: historicalLotSize });
    const units = lots * historicalLotSize;
    byCapital[capital] = lots === 0 ? { capital, lots: 0, units: 0, affordable: false } : {
      capital, lots, units, affordable: true,
      premiumCapitalUsed: position.entry * units,
      currentCosts: calculateLongOptionRoundTripCosts({ entryPremium: position.entry, exitPremium: position.exit, lotSize: units, tradeDate }),
      stress0_5: calculateLongOptionRoundTripCosts({ entryPremium: position.entry, exitPremium: position.exit, lotSize: units, tradeDate, slippagePointsPerLeg: 0.5 }),
      stress1_0: calculateLongOptionRoundTripCosts({ entryPremium: position.entry, exitPremium: position.exit, lotSize: units, tradeDate, slippagePointsPerLeg: 1.0 }),
    };
  }
  return byCapital;
}

function maxDrawdown(values) {
  let equity = 0, peak = 0, max = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    max = Math.max(max, peak - equity);
  }
  return max;
}

function summarize(rows, capital) {
  const scored = rows.filter((r) => r.capitalScenarios[capital]?.affordable);
  const net = scored.map((r) => r.capitalScenarios[capital].currentCosts.netPnl);
  const stress05 = scored.map((r) => r.capitalScenarios[capital].stress0_5.netPnl);
  const stress10 = scored.map((r) => r.capitalScenarios[capital].stress1_0.netPnl);
  const best = [...scored].sort((a,b) => b.capitalScenarios[capital].currentCosts.netPnl - a.capitalScenarios[capital].currentCosts.netPnl)[0] ?? null;
  const worst = [...scored].sort((a,b) => a.capitalScenarios[capital].currentCosts.netPnl - b.capitalScenarios[capital].currentCosts.netPnl)[0] ?? null;
  return {
    capital,
    trades: scored.length,
    winners: net.filter((v) => v > 0).length,
    losers: net.filter((v) => v < 0).length,
    winRate: scored.length ? net.filter((v) => v > 0).length / scored.length : null,
    totalNetPnl: net.reduce((a,b) => a+b, 0),
    totalNetPnlStress0_5: stress05.reduce((a,b) => a+b, 0),
    totalNetPnlStress1_0: stress10.reduce((a,b) => a+b, 0),
    maxDrawdownRupees: maxDrawdown(net),
    bestTrade: best ? { date: best.date, entryTime: best.entryTime, exitTime: best.exitTime, pnl: best.capitalScenarios[capital].currentCosts.netPnl } : null,
    worstTrade: worst ? { date: worst.date, entryTime: worst.entryTime, exitTime: worst.exitTime, pnl: worst.capitalScenarios[capital].currentCosts.netPnl } : null,
  };
}

export async function backtestMomentum({ token, startDate, endDate, historicalLotSize, spacingMs = DEFAULT_SPACING_MS }) {
  if (!(historicalLotSize > 0)) throw new Error('historicalLotSize is required');
  const baseline = await backtestNifty180({ token, startDate, endDate, maxCandidatesPerSide: 8, lotSize: null, requestSpacingMsOverride: spacingMs });
  const baselineTrades = baseline.results.filter((r) => r.status === 'TRADE');
  const fullSessionCache = new Map();
  const variants = Object.fromEntries(TRAIL_GAPS.map((gap) => [gap, []]));

  for (const trade of baselineTrades) {
    const symbol = trade.contract?.symbol;
    if (!symbol) continue;
    const key = `${trade.date}:${symbol}`;
    if (!fullSessionCache.has(key)) fullSessionCache.set(key, await fetchFullSession(token, symbol, trade.date, spacingMs));
    const candles = fullSessionCache.get(key);
    const signal = candles.find((c) => c.timestamp === trade.signalTime);
    if (!signal) continue;

    for (const gap of TRAIL_GAPS) {
      const position = evaluateMomentumPosition(candles, signal, { trailGapPoints: gap });
      if (!position || position.rejected) continue;
      variants[gap].push({
        date: trade.date,
        side: trade.side,
        contract: trade.contract,
        spot925: trade.spot925,
        expiry: trade.expiry,
        signalTime: trade.signalTime,
        signalClose: trade.signalClose,
        trailGapPoints: gap,
        ...position,
        capitalScenarios: moneyScenarios(position, trade.date, historicalLotSize),
      });
    }
  }

  return {
    methodology: {
      entrySource: 'Frozen V1 actual-contract selection and 09:30-09:45 crossing signal',
      initialStop: 160,
      trailActivation: 220,
      trailGapsTested: TRAIL_GAPS,
      trailUpdate: 'completed 1-minute high; new stop effective next bar only',
      overnight: false,
      sessionFallback: 'final available bar through 15:29',
      capitalScenarios: CAPITALS,
      historicalLotSize,
    },
    period: { startDate, endDate },
    baselineDiagnostics: baseline.diagnostics,
    variants: Object.fromEntries(TRAIL_GAPS.map((gap) => [gap, {
      summary: Object.fromEntries(CAPITALS.map((capital) => [capital, summarize(variants[gap], capital)])),
      trades: variants[gap],
    }])),
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
  const result = await backtestMomentum({ token, startDate, endDate, historicalLotSize, spacingMs: Number(process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_SPACING_MS) });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith('groww-backtest-nifty-180-momentum.mjs')) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
