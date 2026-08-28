import fs from 'node:fs';
import { replayStrategy, STRATEGY_DEFAULTS } from './etf-dip-recovery-engine.mjs';
import {
  candidateForDate,
  classifyEtf,
  dailyCloses,
  parseInstrumentCsv,
  summarizeIntraday,
} from './groww-etf-dip-recovery-backtest.mjs';

const BASE_URL = 'https://api.dhan.co/v2';
const INSTRUMENT_URL = 'https://images.dhan.co/api-data/api-scrip-master-detailed.csv';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function chunkDhanIntradayRange(startDate, endDate, maxInclusiveDays = 90) {
  if (startDate > endDate) throw new Error('startDate must be <= endDate');
  const chunks = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const maximumEnd = addDays(cursor, maxInclusiveDays - 1);
    const chunkEnd = maximumEnd < endDate ? maximumEnd : endDate;
    chunks.push({ startDate: cursor, endDate: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

export function dhanEtfUniverse(rows) {
  const bySymbol = new Map();
  for (const row of rows) {
    const symbol = String(row.UNDERLYING_SYMBOL || '').trim().toUpperCase();
    const isNseEtf = row.EXCH_ID === 'NSE'
      && row.SEGMENT === 'E'
      && row.INSTRUMENT === 'EQUITY'
      && row.INSTRUMENT_TYPE === 'ETF'
      && row.SERIES === 'EQ';
    const buyAllowed = !row.BUY_SELL_INDICATOR || row.BUY_SELL_INDICATOR === 'A';
    if (!isNseEtf || !buyAllowed || !symbol || !row.SECURITY_ID) continue;
    const name = [row.SYMBOL_NAME, row.DISPLAY_NAME].filter(Boolean).join(' | ');
    bySymbol.set(symbol, {
      symbol,
      securityId: String(row.SECURITY_ID),
      isin: row.ISIN && row.ISIN !== 'NA' ? row.ISIN : null,
      name: name || symbol,
      category: classifyEtf({ trading_symbol: symbol, name }),
    });
  }
  return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function dhanArraysToCandles(payload) {
  const body = payload?.data ?? payload ?? {};
  const timestamps = body.timestamp ?? [];
  const fields = ['open', 'high', 'low', 'close', 'volume'];
  for (const field of fields) {
    if (!Array.isArray(body[field])) throw new Error(`Dhan response missing ${field} array`);
    if (body[field].length !== timestamps.length) {
      throw new Error(`Dhan response length mismatch: timestamp=${timestamps.length}, ${field}=${body[field].length}`);
    }
  }
  return timestamps.map((timestamp, index) => [
    Number(timestamp),
    Number(body.open[index]),
    Number(body.high[index]),
    Number(body.low[index]),
    Number(body.close[index]),
    Number(body.volume[index] ?? 0),
  ]);
}

async function dhanPost(token, endpoint, request, { maxRetries = 6 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'access-token': token,
      },
      body: JSON.stringify(request),
    });
    const body = await response.json().catch(() => ({}));
    const isErrorBody = body?.errorCode || body?.errorType || body?.status === 'failure';
    if (response.ok && !isErrorBody) return body;
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000 : Math.min(1000 * (2 ** attempt), 20_000);
      await sleep(delay);
      continue;
    }
    const detail = body?.errorMessage || body?.message || JSON.stringify(body);
    throw new Error(`${endpoint} failed (${response.status}): ${detail}`);
  }
  throw new Error(`${endpoint} exhausted retries`);
}

async function fetchDhanCandles({ token, instrument, startDate, endDate, interval, pauseMs }) {
  const candles = [];
  if (interval === '1day') {
    const response = await dhanPost(token, '/charts/historical', {
      securityId: instrument.securityId,
      exchangeSegment: 'NSE_EQ',
      instrument: 'EQUITY',
      expiryCode: 0,
      oi: false,
      fromDate: startDate,
      toDate: addDays(endDate, 1),
    });
    candles.push(...dhanArraysToCandles(response));
    if (pauseMs) await sleep(pauseMs);
  } else {
    for (const chunk of chunkDhanIntradayRange(startDate, endDate)) {
      const response = await dhanPost(token, '/charts/intraday', {
        securityId: instrument.securityId,
        exchangeSegment: 'NSE_EQ',
        instrument: 'EQUITY',
        interval: '5',
        oi: false,
        fromDate: `${chunk.startDate} 09:15:00`,
        toDate: `${chunk.endDate} 15:30:00`,
      });
      candles.push(...dhanArraysToCandles(response));
      if (pauseMs) await sleep(pauseMs);
    }
  }
  const deduped = new Map(candles.map((candle) => [String(candle[0]), candle]));
  return [...deduped.values()].sort((a, b) => Number(a[0]) - Number(b[0]));
}

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, ...rest] = item.slice(2).split('=');
    args[key] = rest.join('=');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.DHAN_ACCESS_TOKEN;
  if (!token) throw new Error('DHAN_ACCESS_TOKEN is required (historical-data calls only; no order endpoint is used)');
  const startDate = args.start || '2023-08-28';
  const endDate = args.end || '2026-08-27';
  const dailyStart = args['daily-start'] || addDays(startDate, -75);
  const pauseMs = Number(args['pause-ms'] ?? 225);
  const out = args.out || 'etf-dip-recovery-3y-result.json';
  const maxSymbols = Number(args['max-symbols'] || 0);
  const targetPcts = [...new Set(String(args.targets || '7,8,10,12,15,20')
    .split(',').map(Number).filter((value) => Number.isFinite(value) && value > 0))];
  if (!targetPcts.length) throw new Error('At least one positive --targets value is required');

  const instrumentResponse = await fetch(INSTRUMENT_URL);
  if (!instrumentResponse.ok) throw new Error(`Dhan instrument master failed (${instrumentResponse.status})`);
  let universe = dhanEtfUniverse(parseInstrumentCsv(await instrumentResponse.text()));
  if (maxSymbols > 0) universe = universe.slice(0, maxSymbols);
  console.error(`Dhan NSE ETF universe: ${universe.length}`);

  const candidatesByDate = new Map();
  const marketBySymbol = new Map();
  const failures = [];
  const coverage = [];
  const sessionSet = new Set();

  for (let index = 0; index < universe.length; index++) {
    const instrument = universe[index];
    console.error(`[${index + 1}/${universe.length}] ${instrument.symbol} (${instrument.securityId})`);
    try {
      const daily = await fetchDhanCandles({ token, instrument, startDate: dailyStart, endDate, interval: '1day', pauseMs });
      const intradayCandles = await fetchDhanCandles({ token, instrument, startDate, endDate, interval: '5minute', pauseMs });
      const closes = dailyCloses(daily);
      const dailyDates = [...closes.keys()].sort();
      const intraday = summarizeIntraday(intradayCandles);
      marketBySymbol.set(instrument.symbol, intraday);
      for (const date of intraday.keys()) if (date >= startDate && date <= endDate) sessionSet.add(date);
      for (const date of intraday.keys()) {
        if (date < startDate || date > endDate) continue;
        const candidate = candidateForDate({ instrument, date, dailyDates, closes, intraday });
        if (!candidate) continue;
        if (!candidatesByDate.has(date)) candidatesByDate.set(date, []);
        candidatesByDate.get(date).push(candidate);
      }
      coverage.push({
        symbol: instrument.symbol,
        securityId: instrument.securityId,
        category: instrument.category,
        dailyCandles: daily.length,
        intradayCandles: intradayCandles.length,
        sessions: intraday.size,
      });
    } catch (error) {
      failures.push({ symbol: instrument.symbol, securityId: instrument.securityId, error: error.message });
      console.error(`  FAILED: ${error.message}`);
    }
  }

  const sessions = [...sessionSet].sort();
  const horizons = [10, 20, 40, 60, 120, 250, 500];
  const scenarioReplays = targetPcts.map((targetReturnPct) => ({
    targetReturnPct,
    replay: replayStrategy(
      { sessions, candidatesByDate, marketBySymbol },
      { horizons, targetReturnPct },
    ),
  }));
  const { targetReturnPct: baselineTargetPct, replay } = scenarioReplays[0];
  const unclassified = universe
    .filter((item) => item.category.startsWith('UNCLASSIFIED:'))
    .map((item) => ({ symbol: item.symbol, name: item.name }));
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'DhanHQ v2',
      instrumentMaster: INSTRUMENT_URL,
      interval: '5minute',
      entryBarTime: '15:10',
      entryInterpretation: 'close of 15:10-15:15 IST candle',
      apiScope: 'historical-data endpoints only; no order endpoint is called',
    },
    period: { startDate, endDate, dailyWarmupStart: dailyStart, sessions: sessions.length },
    rules: {
      ...STRATEGY_DEFAULTS,
      targetReturnPct: baselineTargetPct,
      thirtyDayDefinition: 'previous session close versus close 30 trading sessions earlier',
      ranking: 'most negative eligible thirtyDayReturnPct, then most negative dayReturnPct, then highest volume',
      thirtyDayThreshold: 'at or below -2.5%; values above -2.5% are ineligible',
      consecutiveCategoryRule: 'exclude only when the immediately preceding trading session had a purchase in the same category; choose next ranked category',
      exit: `limit target at entry * ${1 + baselineTargetPct / 100}; no stop and no forced exit`,
    },
    universe: {
      instruments: universe.length,
      classified: universe.length - unclassified.length,
      unclassified,
      identification: 'Current Dhan detailed master: NSE equity segment, EQUITY instrument, ETF instrument type, EQ series, buy allowed',
    },
    dataQuality: { successfulSymbols: coverage.length, failedSymbols: failures.length, failures, coverage },
    selections: replay.selections.map((decision) => ({
      date: decision.date,
      status: decision.status,
      eligibleCount: decision.eligible.length,
      selected: decision.selected,
      excluded: decision.excluded,
    })),
    trades: replay.trades,
    summary: replay.summary,
    capitalUse: replay.capitalUse,
    annualizedReturn: replay.annualizedReturn,
    targetSweep: scenarioReplays.map(({ targetReturnPct, replay: scenario }) => ({
      targetReturnPct,
      summary: scenario.summary,
      capitalUse: scenario.capitalUse,
      annualizedReturn: scenario.annualizedReturn,
      trades: scenario.trades,
    })),
    limitations: [
      'The current active-instrument master is used, so ETFs delisted before the run date are absent (survivorship bias).',
      'Some ETFs launched during the period have shorter histories; they become eligible only after enough data exists.',
      `Target touches (${targetPcts.join('%, ')}%) are treated as limit fills at exactly the target; 0%, 0.25%, and 0.5% execution-haircut sensitivities are reported.`,
      'Open positions are marked at the final available 15:15 price and are never relabelled as wins.',
      'Capital efficiency assumes equal notional for every signal and reserves enough capital for the observed peak number of concurrent positions.',
    ],
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify({
    out,
    period: result.period,
    universe: result.universe,
    dataQuality: { successfulSymbols: coverage.length, failedSymbols: failures.length },
    summary: result.summary,
    capitalUse: result.capitalUse,
    annualizedReturn: result.annualizedReturn,
    targetSweep: result.targetSweep.map((scenario) => ({
      targetReturnPct: scenario.targetReturnPct,
      summary: scenario.summary,
      capitalUse: scenario.capitalUse,
      annualizedReturn: scenario.annualizedReturn,
    })),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
