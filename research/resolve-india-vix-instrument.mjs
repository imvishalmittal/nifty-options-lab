import fs from 'node:fs';
import { parseInstrumentCsv } from './morning-tea/groww-backtest.mjs';

const INSTRUMENTS_URL = 'https://growwapi-assets.groww.in/instruments/instrument.csv';
const API_URL = 'https://api.groww.in/v1/historical/candles';

export function findIndiaVixInstruments(rows) {
  return (rows ?? []).filter((row) => Object.values(row).some((value) => /INDIA\s*VIX/i.test(String(value))))
    .map((row) => ({
      exchange: row.exchange,
      segment: row.segment,
      growwSymbol: row.groww_symbol,
      tradingSymbol: row.trading_symbol,
      name: row.name,
      underlyingSymbol: row.underlying_symbol,
      instrumentType: row.instrument_type,
    }))
    .filter((row) => row.growwSymbol)
    .toSorted((a, b) => a.growwSymbol.localeCompare(b.growwSymbol));
}

async function smokeCandles(token, instrument, fetchImpl = fetch) {
  const url = new URL(API_URL);
  const params = {
    exchange: instrument.exchange || 'NSE',
    segment: instrument.segment || 'CASH',
    groww_symbol: instrument.growwSymbol,
    start_time: '2024-12-30 09:15:00',
    end_time: '2024-12-31 15:30:00',
    candle_interval: '1day',
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
  const body = await response.json().catch(() => ({}));
  const candles = body?.payload?.candles ?? body?.candles ?? [];
  return { ok: response.ok && body.status !== 'FAILURE' && Array.isArray(candles) && candles.length > 0, httpStatus: response.status, candleCount: Array.isArray(candles) ? candles.length : 0, message: body?.error?.message ?? body?.message ?? null };
}

export async function resolveIndiaVix({ token, fetchImpl = fetch }) {
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const response = await fetchImpl(INSTRUMENTS_URL, { headers: { Accept: 'text/csv' } });
  if (!response.ok) throw new Error(`Groww instrument CSV failed (${response.status})`);
  const matches = findIndiaVixInstruments(parseInstrumentCsv(await response.text()));
  const tested = [];
  for (const instrument of matches) tested.push({ instrument, smoke: await smokeCandles(token, instrument, fetchImpl) });
  const verified = tested.filter((item) => item.smoke.ok);
  if (verified.length !== 1) throw new Error(`Expected exactly one verified India VIX instrument, found ${verified.length}`);
  return { schemaVersion: 1, matches: tested, verified: verified[0] };
}

if (process.argv[1]?.endsWith('resolve-india-vix-instrument.mjs')) {
  const report = await resolveIndiaVix({ token: process.env.GROWW_ACCESS_TOKEN });
  fs.writeFileSync(process.argv[2] ?? 'india-vix-instrument.json', `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Verified India VIX symbol: ${report.verified.instrument.growwSymbol}\n`);
}
