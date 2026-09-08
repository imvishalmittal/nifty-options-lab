import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DAY_MS = 86_400_000;

export function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...parts] = arg.slice(2).split('=');
    return [key, parts.join('=') || true];
  }));
}

export function normalizeYahooChart(payload, symbol) {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const close = result?.indicators?.adjclose?.[0]?.adjclose ?? quote?.close;
  if (!result?.timestamp || !quote || !close) {
    throw new Error(`Yahoo returned no usable daily data for ${symbol}`);
  }

  return result.timestamp.flatMap((timestamp, index) => {
    const row = {
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: quote.open[index],
      high: quote.high[index],
      low: quote.low[index],
      close: close[index],
    };
    return Object.values(row).some((value) => value == null) ? [] : [row];
  });
}

export async function fetchYahooDaily(symbol, start, end, fetchImpl = fetch) {
  const period1 = Math.floor(Date.parse(`${start}T00:00:00Z`) / 1000);
  const period2 = Math.floor((Date.parse(`${end}T00:00:00Z`) + DAY_MS) / 1000);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set('period1', String(period1));
  url.searchParams.set('period2', String(period2));
  url.searchParams.set('interval', '1d');
  url.searchParams.set('events', 'history');
  const response = await fetchImpl(url, { headers: { 'user-agent': 'nifty-options-lab/1.0' } });
  if (!response.ok) throw new Error(`Yahoo ${symbol} request failed: HTTP ${response.status}`);
  return normalizeYahooChart(await response.json(), symbol);
}

function pct(numerator, denominator) {
  return denominator === 0 ? null : (numerator / denominator - 1) * 100;
}

function summarize(rows) {
  if (rows.length === 0) return { observations: 0 };
  const average = (field) => rows.reduce((sum, row) => sum + row[field], 0) / rows.length;
  const probability = (field) => rows.filter((row) => row[field] < 0).length / rows.length;
  return {
    observations: rows.length,
    gapDownProbability: probability('gapPct'),
    negativeIntradayProbability: probability('intradayPct'),
    negativeFullDayProbability: probability('fullDayPct'),
    averageGapPct: average('gapPct'),
    averageIntradayPct: average('intradayPct'),
    averageFullDayPct: average('fullDayPct'),
  };
}

export function buildAlignedSessions(sp500, nasdaq, nifty) {
  const sp = sp500.map((row, index) => ({ ...row, returnPct: index ? pct(row.close, sp500[index - 1].close) : null }));
  const nqByDate = new Map(nasdaq.map((row, index) => [row.date, index ? pct(row.close, nasdaq[index - 1].close) : null]));
  const sessions = [];
  let usIndex = 0;

  for (let index = 1; index < nifty.length; index += 1) {
    const india = nifty[index];
    while (usIndex + 1 < sp.length && sp[usIndex + 1].date < india.date) usIndex += 1;
    const us = sp[usIndex];
    if (!us || us.date >= india.date || us.returnPct == null) continue;
    sessions.push({
      indiaDate: india.date,
      usDate: us.date,
      sp500ReturnPct: us.returnPct,
      nasdaqReturnPct: nqByDate.get(us.date) ?? null,
      gapPct: pct(india.open, nifty[index - 1].close),
      intradayPct: pct(india.close, india.open),
      fullDayPct: pct(india.close, nifty[index - 1].close),
    });
  }
  return sessions;
}

export function analyzeSessions(sessions) {
  const predicates = {
    allSessions: () => true,
    sp500Negative: (row) => row.sp500ReturnPct < 0,
    sp500DownHalfPercent: (row) => row.sp500ReturnPct <= -0.5,
    sp500DownOnePercent: (row) => row.sp500ReturnPct <= -1,
    sp500AndNasdaqNegative: (row) => row.sp500ReturnPct < 0 && row.nasdaqReturnPct < 0,
  };
  return Object.fromEntries(Object.entries(predicates).map(([name, predicate]) => [name, summarize(sessions.filter(predicate))]));
}

export function runStudy(sp500, nasdaq, nifty, metadata = {}) {
  const sessions = buildAlignedSessions(sp500, nasdaq, nifty);
  const byYear = Object.fromEntries([...new Set(sessions.map((row) => row.indiaDate.slice(0, 4)))].map((year) => [
    year,
    analyzeSessions(sessions.filter((row) => row.indiaDate.startsWith(year))),
  ]));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    methodology: {
      causalAlignment: 'Latest completed US session whose calendar date precedes the NIFTY session',
      gapPct: 'NIFTY open versus prior NIFTY close',
      intradayPct: 'NIFTY close versus NIFTY open',
      fullDayPct: 'NIFTY close versus prior NIFTY close',
      thresholdsFrozenBeforeResults: true,
    },
    metadata,
    overall: analyzeSessions(sessions),
    byYear,
    sessions,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const start = String(args.start || '2022-01-01');
  const end = String(args.end || new Date().toISOString().slice(0, 10));
  const out = String(args.out || 'us-close-india-study.json');
  const fetchStart = new Date(Date.parse(`${start}T00:00:00Z`) - 14 * DAY_MS).toISOString().slice(0, 10);
  const [sp500, nasdaq, nifty] = await Promise.all([
    fetchYahooDaily('^GSPC', fetchStart, end),
    fetchYahooDaily('^IXIC', fetchStart, end),
    fetchYahooDaily('^NSEI', fetchStart, end),
  ]);
  const result = runStudy(sp500, nasdaq, nifty, {
    requestedStart: start,
    requestedEnd: end,
    source: 'Yahoo Finance chart API',
    symbols: { sp500: '^GSPC', nasdaq: '^IXIC', nifty: '^NSEI' },
  });
  result.sessions = result.sessions.filter((row) => row.indiaDate >= start && row.indiaDate <= end);
  result.overall = analyzeSessions(result.sessions);
  result.byYear = Object.fromEntries([...new Set(result.sessions.map((row) => row.indiaDate.slice(0, 4)))].map((year) => [
    year,
    analyzeSessions(result.sessions.filter((row) => row.indiaDate.startsWith(year))),
  ]));
  await writeFile(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ out, sessions: result.sessions.length, overall: result.overall }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
