import fs from 'node:fs';
import { backtestNifty180, normalizeCandles } from './groww-backtest-nifty-180.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import {
  ENTRY_RELATIVE_RULES,
  ENTRY_RELATIVE_VARIANTS,
  evaluateEntryRelativePosition,
} from './nifty-180-entry-relative.mjs';
import { niftyLotSizeForExpiry } from './opportunity/opportunity-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_SPACING_MS = 1600;
const CAPITAL = 60000;
let lastRequestAt = 0;
let requestCount = 0;
let retryCount = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(token, endpoint, params, spacingMs) {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt <= 8; attempt += 1) {
    lastRequestAt = Date.now();
    requestCount += 1;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' },
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < 8) {
      retryCount += 1;
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

function maxDrawdown(values) {
  let equity = 0;
  let peak = 0;
  let maximum = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maximum = Math.max(maximum, peak - equity);
  }
  return maximum;
}

function profitFactor(values) {
  const gains = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const losses = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  if (!losses) return gains > 0 ? null : null;
  return gains / losses;
}

export function summarizeEntryRelativeTrades(rows) {
  const normalized = rows.map((row) => row.costs.normalized.netPnl);
  const stress0_5 = rows.map((row) => row.costs.stress0_5.netPnl);
  const stress1_0 = rows.map((row) => row.costs.stress1_0.netPnl);
  const gross = rows.map((row) => row.grossPnlRupees);
  return {
    trades: rows.length,
    winners: normalized.filter((value) => value > 0).length,
    losers: normalized.filter((value) => value < 0).length,
    winRate: rows.length ? normalized.filter((value) => value > 0).length / rows.length : null,
    grossProfitFactor: profitFactor(gross),
    normalizedProfitFactor: profitFactor(normalized),
    totalNetPnlRupees: normalized.reduce((sum, value) => sum + value, 0),
    totalNetPnlStress0_5: stress0_5.reduce((sum, value) => sum + value, 0),
    totalNetPnlStress1_0: stress1_0.reduce((sum, value) => sum + value, 0),
    maximumDrawdownRupees: maxDrawdown(normalized),
    maximumDrawdownStress1_0: maxDrawdown(stress1_0),
  };
}

function attachCosts(position, tradeDate, lotSize) {
  const lots = Math.floor(CAPITAL / (position.entry * lotSize));
  if (lots < 1) return null;
  const units = lots * lotSize;
  const inputs = {
    entryPremium: position.entry,
    exitPremium: position.exit,
    lotSize: units,
    tradeDate,
  };
  return {
    lots,
    units,
    premiumCapitalUsed: position.entry * units,
    grossPnlRupees: position.pnlPerUnit * units,
    costs: {
      normalized: calculateLongOptionRoundTripCosts(inputs),
      stress0_5: calculateLongOptionRoundTripCosts({ ...inputs, slippagePointsPerLeg: 0.5 }),
      stress1_0: calculateLongOptionRoundTripCosts({ ...inputs, slippagePointsPerLeg: 1 }),
    },
  };
}

export async function backtestEntryRelative({
  token,
  startDate,
  endDate,
  spacingMs = DEFAULT_SPACING_MS,
}) {
  lastRequestAt = 0;
  requestCount = 0;
  retryCount = 0;
  const baseline = await backtestNifty180({
    token,
    startDate,
    endDate,
    maxCandidatesPerSide: 8,
    lotSize: null,
    requestSpacingMsOverride: spacingMs,
  });
  const baselineTrades = baseline.results.filter((row) => row.status === 'TRADE');
  const variants = Object.fromEntries(ENTRY_RELATIVE_VARIANTS.map((variant) => [variant.id, []]));
  const cache = new Map();

  for (const trade of baselineTrades) {
    const symbol = trade.contract?.symbol;
    if (!symbol) continue;
    const cacheKey = `${trade.date}:${symbol}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, await fetchFullSession(token, symbol, trade.date, spacingMs));
    const candles = cache.get(cacheKey);
    const signal = candles.find((candle) => candle.timestamp === trade.signalTime);
    if (!signal) continue;
    const lotSize = niftyLotSizeForExpiry(trade.expiry);

    for (const variant of ENTRY_RELATIVE_VARIANTS) {
      const position = evaluateEntryRelativePosition(candles, signal, { variant });
      if (!position || position.rejected) continue;
      const money = attachCosts(position, trade.date, lotSize);
      if (!money) continue;
      variants[variant.id].push({
        date: trade.date,
        variant: variant.id,
        side: trade.side,
        contract: trade.contract,
        expiry: trade.expiry,
        signalTime: trade.signalTime,
        signalClose: trade.signalClose,
        historicalLotSize: lotSize,
        ...position,
        ...money,
      });
    }
  }

  return {
    schemaVersion: 1,
    strategy: 'nifty-180-entry-relative-risk',
    phase: 'discovery-2020-2024',
    period: { startDate, endDate },
    rules: ENTRY_RELATIVE_RULES,
    methodology: {
      signalAndContractSelection: 'Frozen ₹180 selector and completed 09:30-09:45 crossing; next-bar entry',
      eligibilityBand: '160 < executable entry < 220',
      fixedLevelComparator: '170 stop / 210 target; eligible only when 170 < executable entry < 210',
      initialStop: 'entry - 20 points',
      fixedTargetAndContinuousActivation: 'entry + 40 points',
      stopOrdering: 'active stop first on ambiguous one-minute bars',
      trailUpdate: 'completed candle only; effective next bar',
      capital: CAPITAL,
      lotSize: 'historical by expiry',
      costs: 'Groww option charges plus 0/0.5/1.0 premium-point slippage per leg',
    },
    diagnostics: {
      baseline: baseline.diagnostics,
      fullSessionFetches: cache.size,
      apiRequestsBeyondBaseline: requestCount,
      retriesBeyondBaseline: retryCount,
    },
    variants: Object.fromEntries(ENTRY_RELATIVE_VARIANTS.map((variant) => [variant.id, {
      label: variant.label,
      summary: summarizeEntryRelativeTrades(variants[variant.id]),
      trades: variants[variant.id],
    }])),
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
  const result = await backtestEntryRelative({
    token,
    startDate: args.start,
    endDate: args.end,
    spacingMs: Number(process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_SPACING_MS),
  });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('groww-backtest-nifty-180-entry-relative.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
