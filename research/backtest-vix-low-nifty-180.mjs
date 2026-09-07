import fs from 'node:fs';
import { backtestSingleClosestFirstClose } from './groww-backtest-nifty-180-single-closest.mjs';
import { normalizeCandles, splitDateRange } from './groww-backtest-nifty-180.mjs';
import { classifyVolRegimeForSession, VOL_REGIME_RULES } from './vol-regime-filter.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_SPACING_MS = 1500;
const INDIA_VIX = Object.freeze({
  exchange: 'NSE',
  segment: 'CASH',
  growwSymbol: 'NSE-INDIAVIX',
});

let lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function apiGet(token, endpoint, params, spacingMs) {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt <= 8; attempt += 1) {
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

export async function fetchIndiaVixDaily({ token, startDate, endDate, spacingMs = DEFAULT_SPACING_MS }) {
  const rows = [];
  for (const chunk of splitDateRange(startDate, endDate, 28)) {
    const payload = await apiGet(token, '/historical/candles', {
      exchange: INDIA_VIX.exchange,
      segment: INDIA_VIX.segment,
      groww_symbol: INDIA_VIX.growwSymbol,
      start_time: `${chunk.startDate} 09:15:00`,
      end_time: `${chunk.endDate} 15:30:00`,
      candle_interval: '1day',
    }, spacingMs);
    for (const candle of normalizeCandles(payload.candles ?? [])) {
      rows.push({ date: candle.timestamp.slice(0, 10), close: candle.close });
    }
  }
  return rows;
}

function scenarioSummary(trades, scenario) {
  const values = trades.map((trade) => trade.money?.[scenario]?.netPnl).filter(Number.isFinite);
  const grossProfit = values.filter((value) => value > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(values.filter((value) => value < 0).reduce((a, b) => a + b, 0));
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return {
    trades: values.length,
    winners: values.filter((value) => value > 0).length,
    losers: values.filter((value) => value < 0).length,
    winRate: values.length ? values.filter((value) => value > 0).length / values.length : null,
    totalNetPnl: values.reduce((a, b) => a + b, 0),
    profitFactor: grossLoss ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null),
    maxDrawdownRupees: drawdown,
  };
}

export function summarizeTrades(trades) {
  return {
    current: scenarioSummary(trades, 'current'),
    stress0_5: scenarioSummary(trades, 'stress0_5'),
    stress1_0: scenarioSummary(trades, 'stress1_0'),
  };
}

export function applyLowVixFilter(result, vixRows, rules = VOL_REGIME_RULES) {
  const regimes = result.sessionLedger.map((session) => ({
    date: session.date,
    status: classifyVolRegimeForSession({ sessionDate: session.date, vixRows, rules }),
  }));
  const openDates = new Set(regimes.filter((row) => row.status.status === 'REGIME_OPEN').map((row) => row.date));
  const filteredSessions = result.sessionLedger.map((session) => ({
    ...session,
    vixRegime: regimes.find((row) => row.date === session.date)?.status ?? { status: 'DATA_MISSING' },
    filterStatus: openDates.has(session.date) ? session.status : 'VIX_FILTERED',
  }));
  const variants = {};
  for (const key of ['V2', 'V3_10']) {
    const sourceTrades = result.variants[key]?.trades ?? [];
    const retainedTrades = sourceTrades.filter((trade) => openDates.has(trade.date));
    variants[key] = {
      summary: summarizeTrades(retainedTrades),
      trades: retainedTrades,
    };
  }
  const regimeCounts = {};
  for (const row of regimes) regimeCounts[row.status.status] = (regimeCounts[row.status.status] ?? 0) + 1;
  return {
    schemaVersion: 1,
    study: 'O1 VIX-low V2/V3-10 filter',
    rules,
    baseMethodology: result.methodology,
    period: result.period,
    vixInstrument: INDIA_VIX,
    sessionCounts: {
      source: result.sessionLedger.length,
      retained: openDates.size,
      regimes: regimeCounts,
    },
    filteredSessions,
    variants,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => {
    const [key, ...rest] = value.slice(2).split('=');
    return [key, rest.join('=')];
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token || !args.start || !args.end || !args['lot-size']) throw new Error('GROWW_ACCESS_TOKEN, --start, --end and --lot-size are required');
  const spacingMs = Number(process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_SPACING_MS);
  const source = await backtestSingleClosestFirstClose({
    token,
    startDate: args.start,
    endDate: args.end,
    historicalLotSize: Number(args['lot-size']),
    spacingMs,
  });
  const vixRows = await fetchIndiaVixDaily({
    token,
    startDate: plusDays(args.start, -500),
    endDate: args.end,
    spacingMs,
  });
  const result = applyLowVixFilter(source, vixRows);
  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result.sessionCounts, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('backtest-vix-low-nifty-180.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
