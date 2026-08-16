import fs from 'node:fs';
import {
  PAPER_RULES, chooseClosestPremium, initialPosition, itmContracts, lotsAffordable,
  nearestExpiry, nextBarEntry, processCompletedBar, selectSide, sessionExit, timeOf,
} from './paper-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const JOURNAL = 'public/paper/trades.json';
const STATUS = 'public/paper/session-status.json';
let lastRequestAt = 0;
const spacingMs = Number(process.env.GROWW_REQUEST_SPACING_MS || 1500);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function indiaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function normalizeTimestamp(value) {
  const text = String(value).replace(' ', 'T');
  return /([zZ]|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}+05:30`;
}

function normalizeCandles(raw = []) {
  return raw.map((c) => ({ timestamp: normalizeTimestamp(c[0]), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] ?? 0) }))
    .filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function completedCandles(candles, currentClock) {
  return candles.filter((candle) => {
    const clock = timeOf(candle.timestamp);
    return clock && clock < currentClock;
  });
}

async function throttle() {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();
}

async function apiGet(token, endpoint, params, maxRetries = 6) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value)); });
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await throttle();
    const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      await sleep(Math.min(5000 * (2 ** attempt), 60000));
      continue;
    }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
}

async function fetchCandles(token, segment, symbol, date, startClock, endClock) {
  const payload = await apiGet(token, '/historical/candles', {
    exchange: 'NSE', segment, groww_symbol: symbol,
    start_time: `${date} ${startClock}:00`, end_time: `${date} ${endClock}:00`, candle_interval: '1minute',
  });
  return normalizeCandles(payload.candles ?? []);
}

async function waitUntil(clock) {
  while (indiaParts().time < clock) await sleep(15000);
}

function candleAt(candles, clock) { return candles.find((c) => timeOf(c.timestamp) === clock) ?? null; }

async function selectContract(token, date, candidates) {
  const rows = [];
  let bracketed = false;
  for (const candidate of candidates) {
    const candles = await fetchCandles(token, 'FNO', candidate.symbol, date, '09:25', '09:29');
    const premium = candleAt(candles, '09:25')?.open ?? null;
    rows.push({ ...candidate, premium });
    if (Number.isFinite(premium) && premium >= PAPER_RULES.referencePremium) { bracketed = true; break; }
  }
  const selected = chooseClosestPremium(rows);
  return { selected, bracketed, fetched: rows.length };
}

function optionCosts(entry, exit, units, tradeDate) {
  const sttRate = tradeDate < '2026-04-01' ? 0.001 : 0.0015;
  const buy = entry * units, sell = exit * units, total = buy + sell;
  const brokerage = 40;
  const exchange = total * 0.0003503;
  const sebi = total * 0.000001;
  const ipft = total * 0.000005;
  const stamp = buy * 0.00003;
  const stt = sell * sttRate;
  const gst = (brokerage + exchange + sebi + ipft) * 0.18;
  const charges = brokerage + exchange + sebi + ipft + stamp + stt + gst;
  return { gross: (exit - entry) * units, charges, net: (exit - entry) * units - charges };
}

function writeStatus(value) {
  fs.mkdirSync('public/paper', { recursive: true });
  fs.writeFileSync(STATUS, JSON.stringify({ updatedAt: new Date().toISOString(), ...value }, null, 2));
}

function appendTrade(row) {
  let payload = { meta: {}, trades: [] };
  if (fs.existsSync(JOURNAL)) payload = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  payload.trades = Array.isArray(payload.trades) ? payload.trades : [];
  if (!payload.trades.some((trade) => trade.source === 'PAPER' && trade.date === row.date)) payload.trades.push(row);
  payload.meta = {
    ...payload.meta,
    strategy: 'NIFTY ₹180 Stepped Trail V3',
    capital: PAPER_RULES.capital,
    trailGapPoints: PAPER_RULES.trailGap,
    trailStepPoints: PAPER_RULES.trailStep,
    paperMode: true,
    lastPaperSession: row.date,
  };
  fs.writeFileSync(JOURNAL, JSON.stringify(payload, null, 2));
}

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const { date } = indiaParts();
  writeStatus({ date, status: 'STARTING', rules: PAPER_RULES });
  await waitUntil('09:27');

  let spotCandles = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const currentClock = indiaParts().time;
    spotCandles = completedCandles(await fetchCandles(token, 'CASH', 'NSE-NIFTY', date, '09:15', currentClock), currentClock);
    if (candleAt(spotCandles, '09:25')) break;
    await sleep(30000);
  }
  const spot925 = candleAt(spotCandles, '09:25')?.open;
  if (!Number.isFinite(spot925)) { writeStatus({ date, status: 'NO_SESSION', reason: 'No completed 09:25 NIFTY candle' }); return; }

  const year = Number(date.slice(0, 4));
  const expiryPayload = await apiGet(token, '/historical/expiries', { exchange: 'NSE', underlying_symbol: 'NIFTY', year });
  const expiry = nearestExpiry(expiryPayload.expiries ?? [], date);
  if (!expiry) { writeStatus({ date, status: 'DATA_MISSING', reason: 'No weekly expiry' }); return; }
  const contractPayload = await apiGet(token, '/historical/contracts', { exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry });
  const contracts = contractPayload.contracts ?? [];
  const ce = await selectContract(token, date, itmContracts(contracts, spot925, 'CE'));
  const pe = await selectContract(token, date, itmContracts(contracts, spot925, 'PE'));
  if (!ce.selected || !pe.selected || !ce.bracketed || !pe.bracketed) {
    writeStatus({ date, status: 'DATA_BOUNDARY', spot925, expiry, ce, pe }); return;
  }
  writeStatus({ date, status: 'WAITING_SIGNAL', spot925, expiry, call: ce.selected, put: pe.selected });

  let chosen = null;
  let entryInfo = null;
  while (indiaParts().time <= PAPER_RULES.signalCutoff) {
    const end = indiaParts().time;
    const callCandles = completedCandles(await fetchCandles(token, 'FNO', ce.selected.symbol, date, '09:25', end), end);
    const putCandles = completedCandles(await fetchCandles(token, 'FNO', pe.selected.symbol, date, '09:25', end), end);
    const side = selectSide(callCandles, putCandles);
    if (side?.ambiguous) { writeStatus({ date, status: 'AMBIGUOUS', reason: 'CE and PE signalled in same completed minute' }); return; }
    if (side) {
      const chosenRows = side.side === 'CE' ? callCandles : putCandles;
      const selected = side.side === 'CE' ? ce.selected : pe.selected;
      entryInfo = nextBarEntry(chosenRows, side.signal);
      if (entryInfo?.rejected) { writeStatus({ date, status: 'NO_TRADE', reason: 'Entry outside 160-220 band', entry: entryInfo.entry }); return; }
      if (entryInfo) { chosen = { ...selected, side: side.side, signal: side.signal }; break; }
    }
    await sleep(30000);
  }
  if (!entryInfo || !chosen) { writeStatus({ date, status: 'NO_TRADE', reason: 'No valid ₹180 crossing before 09:45' }); return; }

  const lots = lotsAffordable(entryInfo.entry);
  if (lots < 1) { writeStatus({ date, status: 'NO_TRADE', reason: '₹60k capital cannot fund one lot', entry: entryInfo.entry }); return; }
  let position = initialPosition({ entry: entryInfo.entry, entryTime: entryInfo.entryBar.timestamp });
  const processed = new Set();
  writeStatus({ date, status: 'OPEN', expiry, side: chosen.side, strike: chosen.strike, lots, entry: position.entry, entryTime: position.entryTime, activeStop: position.activeStop });

  while (!position.exit) {
    const now = indiaParts().time;
    const candles = completedCandles(await fetchCandles(token, 'FNO', chosen.symbol, date, timeOf(entryInfo.entryBar.timestamp), now), now);
    for (const candle of candles) {
      if (candle.timestamp < entryInfo.entryBar.timestamp || processed.has(candle.timestamp)) continue;
      position = processCompletedBar(position, candle);
      processed.add(candle.timestamp);
      if (position.exit) break;
    }
    if (position.exit) break;
    if (now >= '15:30') {
      const last = candles.filter((c) => timeOf(c.timestamp) <= PAPER_RULES.sessionExit).at(-1);
      if (last) position = sessionExit(position, last);
      break;
    }
    writeStatus({ date, status: 'OPEN', expiry, side: chosen.side, strike: chosen.strike, lots, entry: position.entry, entryTime: position.entryTime, activeStop: position.activeStop, stopLossAdjustments: Math.max(0, position.stopHistory.length - 1), peakPremium: position.peakHigh });
    await sleep(30000);
  }

  if (!position.exit) { writeStatus({ date, status: 'ERROR', reason: 'No executable exit' }); return; }
  const units = lots * PAPER_RULES.lotSize;
  const pnl = optionCosts(position.entry, position.exit.price, units, date);
  const maxFavorableMove = position.peakHigh - position.entry;
  const breakevenReached = position.peakHigh >= position.entry + PAPER_RULES.trailGap;
  const row = {
    source: 'PAPER', strategy: 'NIFTY ₹180 Stepped Trail V3', date, indexStockName: 'NIFTY 50', weeklyExpiry: expiry, lots, callType: chosen.side,
    strikePrice: chosen.strike,
    startTarget: Number((position.entry + PAPER_RULES.trailGap).toFixed(2)),
    startStopLoss: PAPER_RULES.initialStop,
    endStopLoss: Number(position.activeStop.toFixed(2)), entryTime: timeOf(position.entryTime), exitTime: timeOf(position.exit.time),
    stopLossAdjustments: Math.max(0, position.stopHistory.length - 1), totalPnl: Number(pnl.net.toFixed(2)),
    entryPremium: Number(position.entry.toFixed(2)), peakPremium: Number(position.peakHigh.toFixed(2)),
    maxFavorableMove: Number(maxFavorableMove.toFixed(2)), breakevenReached,
    exitPremium: Number(position.exit.price.toFixed(2)), exitReason: position.exit.result,
    grossPnl: Number(pnl.gross.toFixed(2)), charges: Number(pnl.charges.toFixed(2)),
    trailGapPoints: PAPER_RULES.trailGap, trailStepPoints: PAPER_RULES.trailStep,
  };
  appendTrade(row);
  writeStatus({ date, status: 'CLOSED', trade: row, grossPnl: pnl.gross, charges: pnl.charges });
  console.log(JSON.stringify(row, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  writeStatus({ status: 'FAILED', reason: error.message });
  process.exitCode = 1;
});
