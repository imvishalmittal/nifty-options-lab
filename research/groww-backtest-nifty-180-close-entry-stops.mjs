import fs from 'node:fs';
import { backtestNifty180, normalizeCandles } from './groww-backtest-nifty-180.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import { chooseSingleClosest } from './nifty-180-single-closest.mjs';
import {
  CLOSE_ENTRY_RULES,
  EXIT_FAMILIES,
  STOP_VARIANTS,
  evaluateAllCloseEntryVariants,
} from './nifty-180-close-entry-stops.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_SPACING_MS = 1500;
const CAPITAL = 60000;
let lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(token, endpoint, params, spacingMs) {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt <= 8; attempt += 1) {
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

function money(position, tradeDate, historicalLotSize) {
  const lots = Math.floor(CAPITAL / (position.entry * historicalLotSize));
  const units = lots * historicalLotSize;
  if (lots < 1) return { affordable: false, lots: 0, units: 0 };
  const base = { entryPremium: position.entry, exitPremium: position.exit, lotSize: units, tradeDate };
  return {
    affordable: true, lots, units, premiumCapitalUsed: position.entry * units,
    current: calculateLongOptionRoundTripCosts(base),
    stress0_5: calculateLongOptionRoundTripCosts({ ...base, slippagePointsPerLeg: 0.5 }),
    stress1_0: calculateLongOptionRoundTripCosts({ ...base, slippagePointsPerLeg: 1 }),
  };
}

function scenarioSummary(rows, scenario) {
  const values = rows.map((row) => row.money?.[scenario]?.netPnl).filter(Number.isFinite);
  const grossProfit = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  let equity = 0; let peak = 0; let maxDrawdown = 0;
  for (const value of values) { equity += value; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity); }
  return {
    trades: values.length, winners: values.filter((value) => value > 0).length,
    losers: values.filter((value) => value < 0).length,
    winRate: values.length ? values.filter((value) => value > 0).length / values.length : null,
    totalNetPnl: values.reduce((sum, value) => sum + value, 0),
    profitFactor: grossLoss ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null),
    maxDrawdownRupees: maxDrawdown,
  };
}

export function summarizeCloseEntryTrades(rows) {
  const summarizeSide = (side) => {
    const selected = side === 'COMBINED' ? rows : rows.filter((row) => row.side === side);
    return {
      current: scenarioSummary(selected, 'current'),
      stress0_5: scenarioSummary(selected, 'stress0_5'),
      stress1_0: scenarioSummary(selected, 'stress1_0'),
    };
  };
  return { combined: summarizeSide('COMBINED'), CE: summarizeSide('CE'), PE: summarizeSide('PE') };
}

export async function backtestCloseEntryStops({ token, startDate, endDate, historicalLotSize, spacingMs = DEFAULT_SPACING_MS }) {
  const source = await backtestNifty180({
    token, startDate, endDate, maxCandidatesPerSide: 8, lotSize: null, requestSpacingMsOverride: spacingMs,
  });
  const keys = STOP_VARIANTS.flatMap((stop) => EXIT_FAMILIES.map((family) => `${family.key}_${stop.key}`));
  const trades = Object.fromEntries(keys.map((key) => [key, []]));
  const sessionLedger = [];

  for (const row of source.results) {
    if (row.status === 'DATA_MISSING' || row.status === 'CANDIDATE_BOUNDARY') {
      sessionLedger.push({ date: row.date, status: row.status, reason: row.reason });
      continue;
    }
    const selected = chooseSingleClosest(row.callSelection, row.putSelection);
    if (!selected?.symbol) {
      sessionLedger.push({ date: row.date, status: 'DATA_MISSING', reason: 'No single closest 09:25 contract' });
      continue;
    }
    const candles = await fetchFullSession(token, selected.symbol, row.date, spacingMs);
    const evaluation = evaluateAllCloseEntryVariants(candles);
    if (evaluation.status !== 'SIGNAL') {
      sessionLedger.push({ date: row.date, status: 'NO_TRADE', reason: evaluation.reason, side: selected.optionType, contract: selected });
      continue;
    }
    const invalidKeys = keys.filter((key) => !evaluation.positions[key] || evaluation.positions[key].rejected);
    if (invalidKeys.length) {
      sessionLedger.push({ date: row.date, status: 'DATA_MISSING', reason: `Incomplete variant positions: ${invalidKeys.join(',')}` });
      continue;
    }
    sessionLedger.push({
      date: row.date, status: 'TRADE', side: selected.optionType, contract: selected,
      signalTime: evaluation.signal.timestamp, signalHigh: evaluation.signal.high,
      signalLow: evaluation.signal.low, entryTime: candles[candles.indexOf(evaluation.signal) + 1]?.timestamp,
      entry: evaluation.signal.close,
    });
    for (const key of keys) {
      const position = evaluation.positions[key];
      trades[key].push({
        date: row.date, key, side: selected.optionType, contract: selected,
        spot925: row.spot925, expiry: row.expiry, signalTime: evaluation.signal.timestamp,
        ...position, money: money(position, row.date, historicalLotSize),
      });
    }
  }

  const counts = {};
  for (const row of sessionLedger) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return {
    schemaVersion: 1,
    study: 'NIFTY ₹180 intrabar-cross close-entry stop variants',
    period: { startDate, endDate },
    methodology: {
      contractSelection: 'Single closest actual CE/PE contract to ₹180 at 09:25',
      signal: 'First 09:30-09:44 completed 1-minute candle whose high is at least ₹180',
      execution: 'Buy at that signal candle close; exits and stop changes begin next candle',
      rules: CLOSE_ENTRY_RULES,
      stopVariants: STOP_VARIANTS,
      exitFamilies: EXIT_FAMILIES,
      capital: CAPITAL, historicalLotSize, overnight: false,
    },
    sourceDiagnostics: source.diagnostics,
    sessionStatusCounts: counts,
    sessionLedger,
    variants: Object.fromEntries(keys.map((key) => [key, { summary: summarizeCloseEntryTrades(trades[key]), trades: trades[key] }])),
  };
}

function args(argv) {
  return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => {
    const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')];
  }));
}

if (process.argv[1]?.endsWith('groww-backtest-nifty-180-close-entry-stops.mjs')) {
  const input = args(process.argv.slice(2));
  backtestCloseEntryStops({
    token: process.env.GROWW_ACCESS_TOKEN, startDate: input.start, endDate: input.end,
    historicalLotSize: Number(input['lot-size']),
    spacingMs: Number(process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_SPACING_MS),
  }).then((result) => {
    if (input.out) fs.writeFileSync(input.out, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result.sessionStatusCounts, null, 2)}\n`);
  }).catch((error) => { console.error(error.stack || error.message); process.exit(1); });
}
