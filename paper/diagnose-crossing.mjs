import fs from 'node:fs';
import { PAPER_RULES, chooseClosestPremium, itmContracts, nearestExpiry, timeOf, firstSignal } from './paper-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const token = process.env.GROWW_ACCESS_TOKEN;
const date = process.env.DIAGNOSTIC_DATE || '2026-08-18';
const spacingMs = Number(process.env.GROWW_REQUEST_SPACING_MS || 1500);
let lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTimestamp(value) { const text = String(value).replace(' ', 'T'); return /([zZ]|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}+05:30`; }
function normalizeCandles(raw = []) { return raw.map((c) => ({ timestamp: normalizeTimestamp(c[0]), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] ?? 0) })).filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite)).sort((a, b) => a.timestamp.localeCompare(b.timestamp)); }
async function throttle() { const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt)); if (wait) await sleep(wait); lastRequestAt = Date.now(); }
async function apiGet(endpoint, params, maxRetries = 6) {
  const url = new URL(`${BASE_URL}${endpoint}`); Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await throttle();
    const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) { await sleep(Math.min(5000 * (2 ** attempt), 60000)); continue; }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
}
async function fetchCandles(segment, symbol, startClock, endClock) {
  const payload = await apiGet('/historical/candles', { exchange: 'NSE', segment, groww_symbol: symbol, start_time: `${date} ${startClock}:00`, end_time: `${date} ${endClock}:00`, candle_interval: '1minute' });
  return normalizeCandles(payload.candles ?? []);
}
function candleAt(candles, clock) { return candles.find((c) => timeOf(c.timestamp) === clock) ?? null; }
async function selectContract(candidates) {
  const rows = []; let bracketed = false;
  for (const candidate of candidates) {
    const candles = await fetchCandles('FNO', candidate.symbol, '09:25', '09:29');
    const premium = candleAt(candles, '09:25')?.open ?? null;
    rows.push({ ...candidate, premium });
    if (Number.isFinite(premium) && premium >= PAPER_RULES.referencePremium) { bracketed = true; break; }
  }
  return { selected: chooseClosestPremium(rows), bracketed, candidatesChecked: rows };
}
function summarize(candles) {
  const rows = candles.filter((c) => { const t = timeOf(c.timestamp); return t >= '09:25' && t <= '09:45'; }).map((c, i, arr) => {
    const prev = i > 0 ? arr[i - 1] : null;
    return { time: timeOf(c.timestamp), open: c.open, high: c.high, low: c.low, close: c.close, crossedByClose: Boolean(prev && prev.close <= PAPER_RULES.referencePremium && c.close > PAPER_RULES.referencePremium), touched180: c.high >= PAPER_RULES.referencePremium };
  });
  const signal = firstSignal(candles);
  return { rows, firstValidSignal: signal ? { time: timeOf(signal.timestamp), ...signal } : null, maxHigh: rows.length ? Math.max(...rows.map((r) => r.high)) : null, maxClose: rows.length ? Math.max(...rows.map((r) => r.close)) : null };
}

if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
const spotCandles = await fetchCandles('CASH', 'NSE-NIFTY', '09:15', '09:30');
const spot925 = candleAt(spotCandles, '09:25')?.open;
if (!Number.isFinite(spot925)) throw new Error('No 09:25 NIFTY candle');
const year = Number(date.slice(0, 4));
const expiryPayload = await apiGet('/historical/expiries', { exchange: 'NSE', underlying_symbol: 'NIFTY', year });
const expiry = nearestExpiry(expiryPayload.expiries ?? [], date);
const contractPayload = await apiGet('/historical/contracts', { exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry });
const contracts = contractPayload.contracts ?? [];
const ce = await selectContract(itmContracts(contracts, spot925, 'CE'));
const pe = await selectContract(itmContracts(contracts, spot925, 'PE'));
if (!ce.selected || !pe.selected) throw new Error('Could not select CE/PE');
const ceCandles = await fetchCandles('FNO', ce.selected.symbol, '09:25', '09:46');
const peCandles = await fetchCandles('FNO', pe.selected.symbol, '09:25', '09:46');
const result = { date, rules: { referencePremium: PAPER_RULES.referencePremium, signalStart: PAPER_RULES.signalStart, signalCutoff: PAPER_RULES.signalCutoff }, spot925, expiry, ce: { selection: ce, ...summarize(ceCandles) }, pe: { selection: pe, ...summarize(peCandles) } };
fs.mkdirSync('public/paper/diagnostics', { recursive: true });
const out = `public/paper/diagnostics/${date}-crossing.json`;
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
