import fs from 'node:fs';
import { replayStrategy, STRATEGY_DEFAULTS } from './etf-dip-recovery-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const INSTRUMENT_URL = 'https://growwapi-assets.groww.in/instruments/instrument.csv';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function chunkDateRange(startDate, endDate, chunkDays = 13) {
  if (startDate > endDate) throw new Error('startDate must be <= endDate');
  const chunks = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const chunkEnd = [addDays(cursor, chunkDays), endDate].sort()[0];
    chunks.push({ startDate: cursor, endDate: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else value += char;
  }
  cells.push(value);
  return cells;
}

export function parseInstrumentCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']));
  });
}

function words(value) {
  return ` ${String(value).toUpperCase().replace(/[^A-Z0-9]+/g, ' ')} `;
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(` ${term} `) || text.includes(term));
}

// Groww's instrument master often exposes only an abbreviated trading symbol
// as the ETF name. Keep the sector decision auditable instead of guessing from
// incomplete substrings during replay.
const SYMBOL_CATEGORY_OVERRIDES = Object.freeze({
  ABSLBANETF: 'BANKING_FINANCIAL',
  BBNPNBETF: 'BANKING_FINANCIAL',
  BSE500IETF: 'BROAD_MARKET',
  CASHIETF: 'DEBT_LIQUID',
  COMMOIETF: 'METALS_MATERIALS',
  CONSUMIETF: 'FMCG_CONSUMPTION',
  DIVOPPBEES: 'FACTOR',
  EVIETF: 'AUTO',
  FINIETF: 'BANKING_FINANCIAL',
  GSEC10IETF: 'DEBT_LIQUID',
  GSEC5IETF: 'DEBT_LIQUID',
  HYBRIDETF: 'MULTI_ASSET',
  INSUREIETF: 'BANKING_FINANCIAL',
  ITIETF: 'TECHNOLOGY_IT',
  JUNIORBEES: 'BROAD_MARKET',
  LIQGRWBEES: 'DEBT_LIQUID',
  MANUFGBEES: 'INDUSTRIAL_MANUFACTURING',
  MID150BEES: 'BROAD_MARKET',
  MIDSELIETF: 'BROAD_MARKET',
  MOGSEC: 'DEBT_LIQUID',
  MOM30IETF: 'FACTOR',
  NETF: 'BROAD_MARKET',
  NEXT50ETF: 'BROAD_MARKET',
  NEXT50IETF: 'BROAD_MARKET',
  NV20BEES: 'FACTOR',
  NV20IETF: 'FACTOR',
  PVTBANIETF: 'BANKING_FINANCIAL',
  QUAL30IETF: 'FACTOR',
  SBILIQETF: 'DEBT_LIQUID',
  SBINEQWETF: 'FACTOR',
  SBISMLETF: 'BROAD_MARKET',
  SBIVALETF: 'FACTOR',
  SHARIABEES: 'FACTOR',
  SMALLIETF: 'BROAD_MARKET',
  SNXT30BEES: 'BROAD_MARKET',
  TNIDETF: 'TECHNOLOGY_IT',
  TOP15IETF: 'FACTOR',
  VAL30IETF: 'FACTOR',
});

export function classifyEtf(instrument) {
  const symbol = String(instrument.trading_symbol || '').toUpperCase();
  if (SYMBOL_CATEGORY_OVERRIDES[symbol]) return SYMBOL_CATEGORY_OVERRIDES[symbol];
  const text = `${words(symbol)}${words(instrument.name)}`;
  const match = (category, terms) => (containsAny(text, terms) ? category : null);
  return match('GOLD', ['GOLD'])
    || match('SILVER', ['SILVER'])
    || match('DEBT_LIQUID', ['LIQUID', 'GILT', 'SDL', 'BOND', 'MONEY MARKET', 'OVERNIGHT', 'T BILL'])
    || match('BANKING_FINANCIAL', ['BANK', 'BANKING', 'FINANCE', 'FINANCIAL', 'PVTBANK'])
    || match('HEALTHCARE_PHARMA', ['HEALTH', 'HEALTHCARE', 'PHARMA', 'PHARMACEUTICAL'])
    || match('TECHNOLOGY_IT', ['INFORMATION TECHNOLOGY', 'TECHNOLOGY', 'DIGITAL', 'ITETF', 'ITBEES'])
    || match('FMCG_CONSUMPTION', ['FMCG', 'CONSUMER', 'CONSUMPTION'])
    || match('AUTO', ['AUTO', 'AUTOMOBILE'])
    || match('ENERGY_POWER', ['ENERGY', 'POWER', 'OIL', 'GAS'])
    || match('INFRA_REALTY', ['INFRA', 'INFRASTRUCTURE', 'REALTY', 'HOUSING'])
    || match('METALS_MATERIALS', ['METAL', 'COMMODITY'])
    || match('PSU_DEFENCE', ['PSU', 'CPSE', 'DEFENCE', 'DEFENSE'])
    || match('GLOBAL', ['NASDAQ', 'HANG SENG', 'HANGSENG', 'CHINA', 'JAPAN', 'FANG', 'US 100', 'MON100'])
    || match('FACTOR', ['MOMENTUM', 'LOW VOL', 'LOWVOL', 'QUALITY', 'ALPHA', 'VALUE', 'EQUAL WEIGHT'])
    || match('BROAD_MARKET', ['NIFTY', 'SENSEX', 'MIDCAP', 'MID CAP', 'SMALLCAP', 'SMALL CAP', 'LARGECAP', 'LARGE CAP'])
    || `UNCLASSIFIED:${symbol}`;
}

export function etfUniverse(instruments) {
  const bySymbol = new Map();
  for (const instrument of instruments) {
    // Groww's instrument annexure classifies both ordinary shares and ETFs as
    // instrument_type=EQ. ETF identity must therefore come from the exchange
    // name/symbol rather than a non-existent ETF instrument type.
    const identity = `${words(instrument.trading_symbol)}${words(instrument.name)}`;
    const isCashEquity = String(instrument.instrument_type).toUpperCase() === 'EQ';
    const isEtf = isCashEquity && (
      /\bETF\b/.test(identity)
      || identity.includes(' EXCHANGE TRADED FUND ')
      || identity.includes(' BEES ')
      || /(?:ETF|BEES)$/.test(String(instrument.trading_symbol).toUpperCase())
    );
    const isNseCash = instrument.exchange === 'NSE' && instrument.segment === 'CASH';
    const allowed = !instrument.buy_allowed || String(instrument.buy_allowed) === '1';
    if (!isEtf || !isNseCash || !allowed || !instrument.trading_symbol) continue;
    bySymbol.set(instrument.trading_symbol, {
      symbol: instrument.trading_symbol,
      growwSymbol: instrument.groww_symbol || `NSE-${instrument.trading_symbol}`,
      name: instrument.name || instrument.trading_symbol,
      category: classifyEtf(instrument),
      isin: instrument.isin || null,
    });
  }
  return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function indiaParts(value) {
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    const raw = Number(value);
    const date = new Date(raw < 1e12 ? raw * 1000 : raw);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  }
  const match = String(value).replace(' ', 'T').match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!match) throw new Error(`Unsupported candle timestamp: ${value}`);
  return { date: match[1], time: match[2] ?? '00:00' };
}

async function growwGet(token, endpoint, params, { maxRetries = 5 } = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' },
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000 : Math.min(1000 * (2 ** attempt), 15_000);
      await sleep(delay);
      continue;
    }
    throw new Error(`${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
  throw new Error(`${endpoint} exhausted retries`);
}

async function fetchCandles({ token, growwSymbol, startDate, endDate, interval, pauseMs }) {
  const chunks = interval === '5minute' ? chunkDateRange(startDate, endDate) : [{ startDate, endDate }];
  const candles = [];
  for (const chunk of chunks) {
    const payload = await growwGet(token, '/historical/candles', {
      exchange: 'NSE', segment: 'CASH', groww_symbol: growwSymbol,
      start_time: `${chunk.startDate} 09:15:00`, end_time: `${chunk.endDate} 15:30:00`,
      candle_interval: interval,
    });
    candles.push(...(payload.candles ?? []));
    if (pauseMs) await sleep(pauseMs);
  }
  const deduped = new Map(candles.map((candle) => [String(candle[0]), candle]));
  return [...deduped.values()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

export function dailyCloses(candles) {
  const map = new Map();
  for (const candle of candles) {
    const { date } = indiaParts(candle[0]);
    if (Number(candle[4]) > 0) map.set(date, Number(candle[4]));
  }
  return map;
}

export function summarizeIntraday(candles, entryBarTime = '15:10') {
  const grouped = new Map();
  for (const candle of candles) {
    const { date, time } = indiaParts(candle[0]);
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push({ time, open: Number(candle[1]), high: Number(candle[2]), low: Number(candle[3]), close: Number(candle[4]), volume: Number(candle[5] ?? 0) });
  }
  const summaries = new Map();
  for (const [date, bars] of grouped.entries()) {
    bars.sort((a, b) => a.time.localeCompare(b.time));
    const entryBar = bars.find((bar) => bar.time === entryBarTime);
    if (!entryBar) continue;
    const beforeOrEntry = bars.filter((bar) => bar.time <= entryBarTime);
    const afterEntry = bars.filter((bar) => bar.time > entryBarTime);
    summaries.set(date, {
      entryPrice: entryBar.close,
      volumeToEntry: beforeOrEntry.reduce((sum, bar) => sum + Math.max(0, bar.volume), 0),
      high: Math.max(...bars.map((bar) => bar.high)),
      low: Math.min(...bars.map((bar) => bar.low)),
      highAfterEntry: afterEntry.length ? Math.max(...afterEntry.map((bar) => bar.high)) : entryBar.close,
      lowAfterEntry: afterEntry.length ? Math.min(...afterEntry.map((bar) => bar.low)) : entryBar.close,
      markPrice: entryBar.close,
      bars: bars.length,
    });
  }
  return summaries;
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

function candidateForDate({ instrument, date, dailyDates, closes, intraday }) {
  const index = dailyDates.indexOf(date);
  if (index < 31) return null;
  const previousClose = closes.get(dailyDates[index - 1]);
  const baseClose = closes.get(dailyDates[index - 31]);
  const day = intraday.get(date);
  if (!(previousClose > 0 && baseClose > 0 && day?.entryPrice > 0)) return null;
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    category: instrument.category,
    entryPrice: day.entryPrice,
    volumeToEntry: day.volumeToEntry,
    previousClose,
    thirtySessionBaseDate: dailyDates[index - 31],
    thirtySessionBaseClose: baseClose,
    dayReturnPct: (day.entryPrice / previousClose - 1) * 100,
    thirtyDayReturnPct: (previousClose / baseClose - 1) * 100,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const startDate = args.start || '2026-05-28';
  const endDate = args.end || '2026-08-27';
  const dailyStart = args['daily-start'] || addDays(startDate, -75);
  const pauseMs = Number(args['pause-ms'] ?? 300);
  const out = args.out || 'etf-dip-recovery-result.json';
  const maxSymbols = Number(args['max-symbols'] || 0);

  const instrumentResponse = await fetch(INSTRUMENT_URL);
  if (!instrumentResponse.ok) throw new Error(`Instrument master failed (${instrumentResponse.status})`);
  let universe = etfUniverse(parseInstrumentCsv(await instrumentResponse.text()));
  if (maxSymbols > 0) universe = universe.slice(0, maxSymbols);
  console.error(`ETF universe: ${universe.length}`);

  const candidatesByDate = new Map();
  const marketBySymbol = new Map();
  const failures = [];
  const coverage = [];
  const sessionSet = new Set();

  for (let index = 0; index < universe.length; index++) {
    const instrument = universe[index];
    console.error(`[${index + 1}/${universe.length}] ${instrument.symbol}`);
    try {
      const daily = await fetchCandles({ token, growwSymbol: instrument.growwSymbol, startDate: dailyStart, endDate, interval: '1day', pauseMs });
      const intradayCandles = await fetchCandles({ token, growwSymbol: instrument.growwSymbol, startDate, endDate, interval: '5minute', pauseMs });
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
      coverage.push({ symbol: instrument.symbol, category: instrument.category, dailyCandles: daily.length, intradayCandles: intradayCandles.length, sessions: intraday.size });
    } catch (error) {
      failures.push({ symbol: instrument.symbol, error: error.message });
      console.error(`  FAILED: ${error.message}`);
    }
  }

  const sessions = [...sessionSet].sort();
  const replay = replayStrategy({ sessions, candidatesByDate, marketBySymbol });
  const unclassified = universe.filter((item) => item.category.startsWith('UNCLASSIFIED:')).map((item) => ({ symbol: item.symbol, name: item.name }));
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: { provider: 'Groww', instrumentMaster: INSTRUMENT_URL, interval: '5minute', entryBarTime: '15:10', entryInterpretation: 'close of 15:10-15:15 IST candle' },
    period: { startDate, endDate, dailyWarmupStart: dailyStart, sessions: sessions.length },
    rules: {
      ...STRATEGY_DEFAULTS,
      thirtyDayDefinition: 'previous session close versus close 30 trading sessions earlier',
      ranking: 'most negative eligible thirtyDayReturnPct, then most negative dayReturnPct, then highest volume',
      thirtyDayThreshold: 'at or below -2.5%; values above -2.5% are ineligible',
      consecutiveCategoryRule: 'exclude only when the immediately preceding trading session had a purchase in the same category; choose next ranked category',
      exit: 'limit target at entry * 1.07; no stop and no forced exit',
    },
    universe: {
      instruments: universe.length,
      classified: universe.length - unclassified.length,
      unclassified,
      identification: 'Groww NSE CASH instrument_type=EQ with ETF, Exchange Traded Fund, or BeES identity token',
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
    limitations: [
      'Current instrument master is used, so ETFs delisted before the run date are not represented.',
      'The test treats a 7% target touch as a limit fill at the target price and reports 0%, 0.25%, and 0.5% execution-haircut sensitivities.',
      'Open positions are marked at the final available 15:15 price and are never relabelled as wins.',
    ],
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify({ out, period: result.period, universe: result.universe, dataQuality: { successfulSymbols: coverage.length, failedSymbols: failures.length }, summary: result.summary }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
