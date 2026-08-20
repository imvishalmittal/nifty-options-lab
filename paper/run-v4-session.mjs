import fs from 'node:fs';
import {
  PAPER_RULES, chooseClosestPremium, itmContracts, lotsAffordable, nearestExpiry, premiumBracket, sessionExit, timeOf,
} from './paper-engine.mjs';
import { classifyV4Entry, CONFIRMED_VARIANTS, initialV4Position, processV4CompletedBar } from './v4-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const JOURNAL = 'public/paper/v4-trades.json';
const STATUS = 'public/paper/v4-session-status.json';
let lastRequestAt = 0;
const spacingMs = Number(process.env.GROWW_REQUEST_SPACING_MS || 1500);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function indiaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
function normalizeTimestamp(value) { const text = String(value).replace(' ', 'T'); return /([zZ]|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}+05:30`; }
function normalizeCandles(raw = []) { return raw.map((c) => ({ timestamp: normalizeTimestamp(c[0]), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] ?? 0) })).filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite)).sort((a, b) => a.timestamp.localeCompare(b.timestamp)); }
function completedCandles(candles, currentClock) { return candles.filter((candle) => { const clock = timeOf(candle.timestamp); return clock && clock < currentClock; }); }
async function throttle() { const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt)); if (wait) await sleep(wait); lastRequestAt = Date.now(); }
async function apiGet(token, endpoint, params, maxRetries = 6) {
  const url = new URL(`${BASE_URL}${endpoint}`); Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value)); });
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await throttle();
    const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) { await sleep(Math.min(5000 * (2 ** attempt), 60000)); continue; }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
}
async function fetchCandles(token, segment, symbol, date, startClock, endClock) {
  const payload = await apiGet(token, '/historical/candles', { exchange: 'NSE', segment, groww_symbol: symbol, start_time: `${date} ${startClock}:00`, end_time: `${date} ${endClock}:00`, candle_interval: '1minute' });
  return normalizeCandles(payload.candles ?? []);
}
async function waitUntil(clock) { while (indiaParts().time < clock) await sleep(15000); }
function candleAt(candles, clock) { return candles.find((candle) => timeOf(candle.timestamp) === clock) ?? null; }
async function selectContract(token, date, candidates) {
  const rows = [];
  for (const candidate of candidates) {
    const candles = await fetchCandles(token, 'FNO', candidate.symbol, date, '09:25', '09:29');
    const premium = candleAt(candles, '09:25')?.open ?? null;
    rows.push({ ...candidate, premium });
    if (premiumBracket(rows).bracketed) break;
  }
  const bracket = premiumBracket(rows);
  return { selected: bracket.bracketed ? chooseClosestPremium(rows) : null, ...bracket, fetched: rows.length, candidatesChecked: rows };
}
function optionCosts(entry, exit, units, tradeDate) {
  const sttRate = tradeDate < '2026-04-01' ? 0.001 : 0.0015;
  const buy = entry * units, sell = exit * units, total = buy + sell;
  const brokerage = 40, exchange = total * 0.0003503, sebi = total * 0.000001, ipft = total * 0.000005, stamp = buy * 0.00003, stt = sell * sttRate;
  const gst = (brokerage + exchange + sebi + ipft) * 0.18;
  const charges = brokerage + exchange + sebi + ipft + stamp + stt + gst;
  return { gross: (exit - entry) * units, charges, net: (exit - entry) * units - charges };
}
function writeStatus(value) { fs.mkdirSync('public/paper', { recursive: true }); fs.writeFileSync(STATUS, JSON.stringify({ updatedAt: new Date().toISOString(), ...value }, null, 2)); }
function tradeKey(row) { return `${row.source}|${row.date}|${row.strategy}`; }
function appendTrades(rows) {
  let payload = { meta: {}, trades: [] };
  if (fs.existsSync(JOURNAL)) payload = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  payload.trades = Array.isArray(payload.trades) ? payload.trades : [];
  const existing = new Set(payload.trades.map(tradeKey));
  for (const row of rows) if (!existing.has(tradeKey(row))) { payload.trades.push(row); existing.add(tradeKey(row)); }
  payload.meta = { ...payload.meta, paperMode: true, paperStrategies: ['V4', 'V5'], lastPaperSession: rows[0]?.date ?? payload.meta.lastPaperSession };
  fs.writeFileSync(JOURNAL, JSON.stringify(payload, null, 2));
}
function positionStatus(position) { return { activeStop: Number(position.activeStop.toFixed(2)), peakPremium: Number(position.peakHigh.toFixed(2)), stopLossAdjustments: Math.max(0, position.stopHistory.length - 1), pendingFailFastFrom: position.pendingFailFastFrom, exit: position.exit }; }
function buildRow({ position, date, expiry, chosen, lots, signalInfo }) {
  if (!position.exit) throw new Error(`${position.variant.id} has no executable exit`);
  const units = lots * PAPER_RULES.lotSize; const pnl = optionCosts(position.entry, position.exit.price, units, date); const mfe = position.peakHigh - position.entry;
  const variant = position.variant;
  const row = {
    source: 'PAPER', strategy: variant.strategy, strategyVersion: variant.strategyVersion, date, indexStockName: 'NIFTY 50', weeklyExpiry: expiry, lots,
    callType: chosen.side, strikePrice: chosen.strike, startTarget: variant.id === 'V4' ? PAPER_RULES.trailActivation : Number((position.entry + PAPER_RULES.trailGap).toFixed(2)), startStopLoss: position.initialStop,
    endStopLoss: Number(position.activeStop.toFixed(2)), entryTime: timeOf(position.entryTime), exitTime: timeOf(position.exit.time),
    stopLossAdjustments: Math.max(0, position.stopHistory.length - 1), totalPnl: Number(pnl.net.toFixed(2)), entryPremium: position.entry,
    peakPremium: Number(position.peakHigh.toFixed(2)), maxFavorableMove: Number(mfe.toFixed(2)), breakevenReached: mfe >= PAPER_RULES.trailGap,
    trailGapPoints: PAPER_RULES.trailGap, exitPremium: position.exit.price, exitReason: position.exit.result, grossPnl: Number(pnl.gross.toFixed(2)), charges: Number(pnl.charges.toFixed(2)),
    signalSource: signalInfo.source, niftyRangeHigh: signalInfo.niftyRange?.high ?? null, niftyRangeLow: signalInfo.niftyRange?.low ?? null,
    niftySignalTime: timeOf(signalInfo.niftySignal?.timestamp), niftySignalClose: signalInfo.niftySignal?.close ?? null,
    primarySymbol: signalInfo.primary?.symbol ?? null, backupSymbol: signalInfo.backup?.symbol ?? null,
  };
  if (variant.trailStep) row.trailStepPoints = variant.trailStep;
  return row;
}

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN; if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const { date } = indiaParts(); writeStatus({ date, status: 'STARTING', strategies: CONFIRMED_VARIANTS.map((variant) => variant.id), rules: PAPER_RULES }); await waitUntil('09:27');

  let spotCandles = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentClock = indiaParts().time;
    spotCandles = completedCandles(await fetchCandles(token, 'CASH', 'NSE-NIFTY', date, '09:15', currentClock), currentClock);
    if (candleAt(spotCandles, '09:25')) break;
    await sleep(30000);
  }
  const spot925 = candleAt(spotCandles, '09:25')?.open;
  if (!Number.isFinite(spot925)) { writeStatus({ date, status: 'NO_TRADE', reason: 'No completed 09:25 NIFTY candle' }); return; }

  const year = Number(date.slice(0, 4));
  const expiryPayload = await apiGet(token, '/historical/expiries', { exchange: 'NSE', underlying_symbol: 'NIFTY', year });
  const expiry = nearestExpiry(expiryPayload.expiries ?? [], date);
  if (!expiry) { writeStatus({ date, status: 'DATA_MISSING', reason: 'No weekly expiry' }); return; }
  const contractPayload = await apiGet(token, '/historical/contracts', { exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry });
  const contracts = contractPayload.contracts ?? [];
  const ce = await selectContract(token, date, itmContracts(contracts, spot925, 'CE'));
  const pe = await selectContract(token, date, itmContracts(contracts, spot925, 'PE'));
  const selectionAudit = { spot925, expiry, referencePremium: PAPER_RULES.referencePremium, ce, pe };
  if (!ce.selected || !pe.selected || !ce.bracketed || !pe.bracketed) { writeStatus({ date, status: 'DATA_BOUNDARY', reason: 'Could not bracket ₹180 on both CE and PE candidate ladders', selectionAudit }); return; }

  writeStatus({ date, status: 'WAITING_SIGNAL', selectionAudit });
  let entryInfo = null; let signalInfo = null; let chosen = null;
  while (indiaParts().time <= PAPER_RULES.signalCutoff) {
    const end = indiaParts().time;
    const callCandles = completedCandles(await fetchCandles(token, 'FNO', ce.selected.symbol, date, '09:25', end), end);
    const putCandles = completedCandles(await fetchCandles(token, 'FNO', pe.selected.symbol, date, '09:25', end), end);
    const niftyCandles = completedCandles(await fetchCandles(token, 'CASH', 'NSE-NIFTY', date, '09:25', end), end);
    const classified = classifyV4Entry({ callSelection: ce.selected, putSelection: pe.selected, callCandles, putCandles, niftyCandles });
    if (classified.status === 'DATA_MISSING') { writeStatus({ date, status: 'DATA_MISSING', reason: classified.reason, selectionAudit }); return; }
    if (classified.status === 'NO_TRADE') { writeStatus({ date, status: 'NO_TRADE', reason: classified.reason, selectionAudit, entry: classified.entry ?? null }); return; }
    if (classified.status === 'ENTRY') {
      entryInfo = { entry: classified.entry, entryBar: classified.entryBar };
      signalInfo = classified;
      chosen = { ...classified.contract, side: classified.side };
      break;
    }
    await sleep(30000);
  }
  if (!entryInfo || !chosen || !signalInfo) { writeStatus({ date, status: 'NO_TRADE', reason: 'No V4 option signal with matching NIFTY confirmation before 09:45', selectionAudit }); return; }

  const lots = lotsAffordable(entryInfo.entry);
  if (lots < 1) { writeStatus({ date, status: 'NO_TRADE', reason: '₹60k capital cannot fund one lot', entry: entryInfo.entry, selectionAudit }); return; }
  const positions = Object.fromEntries(CONFIRMED_VARIANTS.map((variant) => [variant.id, initialV4Position({ entry: entryInfo.entry, entryTime: entryInfo.entryBar.timestamp, variant })]));
  const processed = new Set();
  writeStatus({ date, status: 'OPEN', selectionAudit, signalSource: signalInfo.source, niftyRange: signalInfo.niftyRange, niftySignal: signalInfo.niftySignal, side: chosen.side, strike: chosen.strike, lots, entry: entryInfo.entry, entryTime: entryInfo.entryBar.timestamp, variants: Object.fromEntries(Object.entries(positions).map(([id, position]) => [id, positionStatus(position)])) });

  while (Object.values(positions).some((position) => !position.exit)) {
    const now = indiaParts().time;
    const candles = completedCandles(await fetchCandles(token, 'FNO', chosen.symbol, date, timeOf(entryInfo.entryBar.timestamp), now), now);
    for (const candle of candles) {
      if (candle.timestamp < entryInfo.entryBar.timestamp || processed.has(candle.timestamp)) continue;
      for (const id of Object.keys(positions)) positions[id] = processV4CompletedBar(positions[id], candle);
      processed.add(candle.timestamp);
      if (Object.values(positions).every((position) => position.exit)) break;
    }
    if (Object.values(positions).every((position) => position.exit)) break;
    if (now >= '15:30') {
      const last = candles.filter((candle) => timeOf(candle.timestamp) <= PAPER_RULES.sessionExit).at(-1);
      if (last) for (const id of Object.keys(positions)) positions[id] = sessionExit(positions[id], last);
      break;
    }
    writeStatus({ date, status: 'OPEN', selectionAudit, signalSource: signalInfo.source, niftyRange: signalInfo.niftyRange, niftySignal: signalInfo.niftySignal, side: chosen.side, strike: chosen.strike, lots, entry: entryInfo.entry, entryTime: entryInfo.entryBar.timestamp, variants: Object.fromEntries(Object.entries(positions).map(([id, position]) => [id, positionStatus(position)])) });
    await sleep(30000);
  }

  if (Object.values(positions).some((position) => !position.exit)) { writeStatus({ date, status: 'ERROR', reason: 'At least one confirmed strategy has no executable exit', selectionAudit }); return; }
  const rows = CONFIRMED_VARIANTS.map((variant) => buildRow({ position: positions[variant.id], date, expiry, chosen, lots, signalInfo }));
  appendTrades(rows);
  writeStatus({ date, status: 'CLOSED', selectionAudit, trades: rows });
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); writeStatus({ status: 'FAILED', reason: error.message }); process.exitCode = 1; });
