import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { replayStrategy, STRATEGY_DEFAULTS } from './etf-dip-recovery-engine.mjs';
import { candidateForDate, parseInstrumentCsv } from './groww-etf-dip-recovery-backtest.mjs';
import { addDays, dhanEtfUniverse } from './dhan-etf-dip-recovery-backtest.mjs';

const DHAN_INSTRUMENT_URL = 'https://images.dhan.co/api-data/api-scrip-master-detailed.csv';
const UDIFF_START = '2024-07-08';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateParts(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const year = String(date.getUTCFullYear());
  return { day, month, year, compact: `${year}${String(date.getUTCMonth() + 1).padStart(2, '0')}${day}` };
}

export function nseBhavcopyUrl(dateText) {
  const { day, month, year, compact } = dateParts(dateText);
  if (dateText < UDIFF_START) {
    return `https://archives.nseindia.com/content/historical/EQUITIES/${year}/${month}/cm${day}${month}${year}bhav.csv.zip`;
  }
  return `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${compact}_F_0000.csv.zip`;
}

function weekdays(startDate, endDate) {
  const dates = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(date);
  }
  return dates;
}

function unzipCsv(buffer) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nse-bhavcopy-'));
  const archive = path.join(directory, 'bhavcopy.zip');
  try {
    fs.writeFileSync(archive, buffer);
    return execFileSync('unzip', ['-p', archive], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function fetchArchive(date, { maxRetries = 4 } = {}) {
  const url = nseBhavcopyUrl(date);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/zip,application/octet-stream,*/*',
        'User-Agent': 'Mozilla/5.0 research-only NSE bhavcopy replay',
      },
    });
    if (response.ok) return { date, url, status: 'OK', csv: unzipCsv(Buffer.from(await response.arrayBuffer())) };
    if (response.status === 404) return { date, url, status: 'NOT_TRADING_DAY' };
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < maxRetries) {
      await sleep(Math.min(1000 * (2 ** attempt), 12_000));
      continue;
    }
    return { date, url, status: 'FAILED', error: `HTTP ${response.status}` };
  }
  return { date, url, status: 'FAILED', error: 'retry limit exhausted' };
}

export function parseNseBhavcopy(text, date, allowedSymbols) {
  const rows = parseInstrumentCsv(text);
  const isUdfff = rows.length > 0 && Object.hasOwn(rows[0], 'TckrSymb');
  const bars = [];
  for (const row of rows) {
    const symbol = String(isUdfff ? row.TckrSymb : row.SYMBOL).trim().toUpperCase();
    const series = String(isUdfff ? row.SctySrs : row.SERIES).trim().toUpperCase();
    if (series !== 'EQ' || !allowedSymbols.has(symbol)) continue;
    const bar = {
      date,
      symbol,
      open: Number(isUdfff ? row.OpnPric : row.OPEN),
      high: Number(isUdfff ? row.HghPric : row.HIGH),
      low: Number(isUdfff ? row.LwPric : row.LOW),
      close: Number(isUdfff ? row.ClsPric : row.CLOSE),
      volume: Number(isUdfff ? row.TtlTradgVol : row.TOTTRDQTY),
    };
    if ([bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) && bar.close > 0) bars.push(bar);
  }
  return bars;
}

const UNIT_FACTORS = [0.05, 0.1, 0.2, 0.25, 1 / 3, 0.5, 2, 3, 4, 5, 10, 20];

export function adjustForUnitChanges(inputBars, tolerance = 0.08) {
  const bars = inputBars.map((bar) => ({ ...bar, _rawClose: bar.close })).sort((a, b) => a.date.localeCompare(b.date));
  const events = [];
  for (let index = 1; index < bars.length; index++) {
    const rawRatio = Number(bars[index]._rawClose) / Number(bars[index - 1]._rawClose);
    const factor = UNIT_FACTORS
      .map((candidate) => ({ candidate, error: Math.abs(rawRatio / candidate - 1) }))
      .sort((a, b) => a.error - b.error)[0];
    if (!factor || factor.error > tolerance) continue;
    for (let prior = 0; prior < index; prior++) {
      for (const field of ['open', 'high', 'low', 'close']) bars[prior][field] *= factor.candidate;
    }
    events.push({ date: bars[index].date, rawRatio, adjustmentFactor: factor.candidate });
  }
  for (const bar of bars) delete bar._rawClose;
  return { bars, events };
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

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startDate = args.start || '2023-08-28';
  const endDate = args.end || '2026-08-27';
  const dailyStart = args['daily-start'] || addDays(startDate, -75);
  const out = args.out || 'etf-dip-recovery-daily-3y-result.json';
  const concurrency = Number(args.concurrency || 6);
  const targets = String(args.targets || '7,8,10,12,15,20')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!targets.length) throw new Error('At least one positive --targets value is required');

  const masterResponse = await fetch(DHAN_INSTRUMENT_URL);
  if (!masterResponse.ok) throw new Error(`Public ETF instrument master failed (${masterResponse.status})`);
  const universe = dhanEtfUniverse(parseInstrumentCsv(await masterResponse.text()));
  const bySymbol = new Map(universe.map((instrument) => [instrument.symbol, instrument]));
  const allowedSymbols = new Set(bySymbol.keys());
  console.error(`Current active NSE ETF universe: ${universe.length}`);

  const requestedDates = weekdays(dailyStart, endDate);
  const archives = await mapConcurrent(requestedDates, concurrency, async (date, index) => {
    const archive = await fetchArchive(date);
    if ((index + 1) % 50 === 0) console.error(`Fetched ${index + 1}/${requestedDates.length} weekday archives`);
    return archive;
  });
  const failedArchives = archives.filter((item) => item.status === 'FAILED');
  if (failedArchives.length) throw new Error(`NSE archive failures: ${JSON.stringify(failedArchives.slice(0, 10))}`);

  const barsBySymbol = new Map(universe.map((instrument) => [instrument.symbol, []]));
  const tradingDates = [];
  for (const archive of archives) {
    if (archive.status !== 'OK') continue;
    const bars = parseNseBhavcopy(archive.csv, archive.date, allowedSymbols);
    if (!bars.length) continue;
    tradingDates.push(archive.date);
    for (const bar of bars) barsBySymbol.get(bar.symbol).push(bar);
  }

  const candidatesByDate = new Map();
  const marketBySymbol = new Map();
  const coverage = [];
  const unitChangeEvents = [];
  for (const instrument of universe) {
    const adjusted = adjustForUnitChanges(barsBySymbol.get(instrument.symbol));
    for (const event of adjusted.events) unitChangeEvents.push({ symbol: instrument.symbol, ...event });
    const closes = new Map(adjusted.bars.map((bar) => [bar.date, bar.close]));
    const dailyDates = [...closes.keys()].sort();
    const daily = new Map(adjusted.bars.map((bar) => [bar.date, {
      entryPrice: bar.close,
      volumeToEntry: bar.volume,
      high: bar.high,
      low: bar.low,
      highAfterEntry: bar.close,
      lowAfterEntry: bar.close,
      markPrice: bar.close,
    }]));
    marketBySymbol.set(instrument.symbol, daily);
    for (const date of dailyDates) {
      if (date < startDate || date > endDate) continue;
      const candidate = candidateForDate({ instrument, date, dailyDates, closes, intraday: daily });
      if (!candidate) continue;
      if (!candidatesByDate.has(date)) candidatesByDate.set(date, []);
      candidatesByDate.get(date).push(candidate);
    }
    coverage.push({ symbol: instrument.symbol, category: instrument.category, sessions: adjusted.bars.length });
  }

  const sessions = tradingDates.filter((date) => date >= startDate && date <= endDate).sort();
  const horizons = [10, 20, 40, 60, 120, 250, 500];
  const replayInput = { sessions, candidatesByDate, marketBySymbol };
  const replays = targets.map((targetReturnPct) => ({
    targetReturnPct,
    replay: replayStrategy(replayInput, { horizons, targetReturnPct }),
  }));
  const replay = replays[0].replay;
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'NSE official daily bhavcopy archives',
      interval: '1day',
      approximation: true,
      entryInterpretation: 'daily closing price; not the original 15:15 price',
      volumeInterpretation: 'full-session traded quantity; not volume known at 15:15',
      archiveFormats: { legacyThrough: '2024-07-05', udiffFrom: UDIFF_START },
    },
    period: { startDate, endDate, dailyWarmupStart: dailyStart, sessions: sessions.length },
    rules: {
      ...STRATEGY_DEFAULTS,
      thirtyDayDefinition: 'previous session close versus close 30 trading sessions earlier',
      ranking: 'most negative eligible thirtyDayReturnPct, then most negative dayReturnPct, then highest volume',
      thirtyDayThreshold: 'at or below -2.5%; values above -2.5% are ineligible',
      consecutiveCategoryRule: 'exclude only when the immediately preceding trading session had a purchase in the same category; choose next ranked category',
      exit: `limit targets at adjusted entry * (1 + target/100) for ${targets.join(', ')}% from the next session onward; no stop and no forced exit`,
      approximationChanges: ['entry uses daily close', 'volume uses full-session volume', 'entry-day high cannot hit target'],
    },
    universe: {
      instruments: universe.length,
      classified: universe.filter((item) => !item.category.startsWith('UNCLASSIFIED:')).length,
      unclassified: universe.filter((item) => item.category.startsWith('UNCLASSIFIED:')),
      identification: 'Current public Dhan detailed master used only to identify active NSE EQ-series ETFs; no authenticated Dhan API used',
    },
    dataQuality: {
      successfulSymbols: coverage.filter((item) => item.sessions > 0).length,
      failedSymbols: coverage.filter((item) => item.sessions === 0).length,
      coverage,
      requestedWeekdayArchives: requestedDates.length,
      tradingDayArchives: tradingDates.length,
      nonTradingWeekdays: archives.filter((item) => item.status === 'NOT_TRADING_DAY').map((item) => item.date),
      unitChangeEvents,
    },
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
    targetSweep: replays.map(({ targetReturnPct, replay: targetReplay }) => ({
      targetReturnPct,
      summary: targetReplay.summary,
      capitalUse: targetReplay.capitalUse,
      annualizedReturn: targetReplay.annualizedReturn,
      trades: targetReplay.trades,
    })),
    limitations: [
      'This is a robustness approximation, not an exact replay of the 15:15 strategy.',
      'Daily close replaces the 15:15 candle close and full-day volume replaces cumulative volume known at 15:15.',
      'The current active ETF master introduces survivorship bias because previously delisted ETFs are absent.',
      'Mechanical unit-change adjustment handles split-like discontinuities; cash distributions and unusual corporate actions may remain imperfect.',
      `A ${targets.join(', ')}% target touch is treated as a fill at exactly the target; execution-haircut sensitivities are reported.`,
      'Open positions are marked at the final adjusted close and are never counted as wins.',
    ],
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify({
    out,
    period: result.period,
    universe: result.universe,
    dataQuality: {
      requestedWeekdayArchives: result.dataQuality.requestedWeekdayArchives,
      tradingDayArchives: result.dataQuality.tradingDayArchives,
      unitChangeEvents: unitChangeEvents.length,
    },
    summary: result.summary,
    capitalUse: result.capitalUse,
    targetSweep: result.targetSweep.map((item) => ({
      targetReturnPct: item.targetReturnPct,
      summary: item.summary,
      capitalUse: item.capitalUse,
      annualizedReturn: item.annualizedReturn,
    })),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
