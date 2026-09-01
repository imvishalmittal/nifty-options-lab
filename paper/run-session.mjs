import fs from 'node:fs';
import {
  PAPER_RULES, PAPER_VARIANTS, PAPER_VARIANT_LABELS, initialPosition, lotsAffordable,
  nearestExpiry, nextBarEntry, processCompletedBar, selectSide, sessionExit, timeOf,
  variantEligible,
} from './paper-engine.mjs';
import { candleAt, completedCandles, createGrowwPaperClient, indiaParts, sleep, waitUntil } from './groww-paper-client.mjs';
import { selectPaperContracts } from './paper-contract-selection.mjs';

const JOURNAL = 'public/paper/trades.json';
const STATUS = 'public/paper/session-status.json';
function optionCosts(entry, exit, units, tradeDate) {
  const sttRate = tradeDate < '2026-04-01' ? 0.001 : 0.0015;
  const buy = entry * units, sell = exit * units, total = buy + sell;
  const brokerage = 40, exchange = total * 0.0003503, sebi = total * 0.000001, ipft = total * 0.000005, stamp = buy * 0.00003, stt = sell * sttRate;
  const gst = (brokerage + exchange + sebi + ipft) * 0.18;
  const charges = brokerage + exchange + sebi + ipft + stamp + stt + gst;
  return { gross: (exit - entry) * units, charges, net: (exit - entry) * units - charges };
}
function writeStatus(value) { fs.mkdirSync('public/paper', { recursive: true }); fs.writeFileSync(STATUS, JSON.stringify({ updatedAt: new Date().toISOString(), ...value }, null, 2)); }
function paperKey(row) { return `${row.source}|${row.date}|${row.strategy}|${row.trailStepPoints ?? ''}`; }
function appendTrades(rows) {
  let payload = { meta: {}, trades: [] }; if (fs.existsSync(JOURNAL)) payload = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  payload.trades = Array.isArray(payload.trades) ? payload.trades : [];
  const existing = new Set(payload.trades.map(paperKey));
  for (const row of rows) { const key = paperKey(row); if (!existing.has(key)) { payload.trades.push(row); existing.add(key); } }
  payload.meta = { ...payload.meta, capital: PAPER_RULES.capital, trailGapPoints: PAPER_RULES.trailGap, paperMode: true, paperStrategies: PAPER_VARIANT_LABELS, lastPaperSession: rows[0]?.date ?? payload.meta.lastPaperSession };
  fs.writeFileSync(JOURNAL, JSON.stringify(payload, null, 2));
}
function positionStatus(position) { return { activeStop: Number(position.activeStop.toFixed(2)), targetPremium: position.targetPremium, peakPremium: Number(position.peakHigh.toFixed(2)), barsProcessed: position.barsProcessed, pendingTimeExitFrom: position.pendingTimeExitFrom, stopLossAdjustments: Math.max(0, position.stopHistory.length - 1), exit: position.exit }; }
function buildRow({ position, date, expiry, chosen, lots }) {
  if (!position.exit) throw new Error(`${position.variant.id} has no executable exit`);
  const units = lots * PAPER_RULES.lotSize; const pnl = optionCosts(position.entry, position.exit.price, units, date); const mfe = position.peakHigh - position.entry; const variant = position.variant;
  const startTarget = variant.kind === 'fixed_target' ? position.targetPremium : variant.trailActivationPremium ?? (variant.kind === 'v2' ? PAPER_RULES.trailActivation : Number((position.entry + PAPER_RULES.trailGap).toFixed(2)));
  const row = { source: 'PAPER', strategy: variant.strategy, strategyVersion: variant.strategyVersion, cohort: variant.cohort ?? '160/220', date, indexStockName: 'NIFTY 50', weeklyExpiry: expiry, lots, callType: chosen.side, strikePrice: chosen.strike, startTarget, startStopLoss: position.initialStop, endStopLoss: Number(position.activeStop.toFixed(2)), entryTime: timeOf(position.entryTime), exitTime: timeOf(position.exit.time), stopLossAdjustments: Math.max(0, position.stopHistory.length - 1), totalPnl: Number(pnl.net.toFixed(2)), entryPremium: position.entry, peakPremium: Number(position.peakHigh.toFixed(2)), maxFavorableMove: Number(mfe.toFixed(2)), breakevenReached: position.activeStop >= position.entry, trailGapPoints: PAPER_RULES.trailGap, exitPremium: position.exit.price, exitReason: position.exit.result, grossPnl: Number(pnl.gross.toFixed(2)), charges: Number(pnl.charges.toFixed(2)) };
  if (variant.kind === 'v3' || variant.kind === 'v3_time') row.trailStepPoints = variant.trailStep;
  if (variant.targetMultiple) row.targetMultiple = variant.targetMultiple;
  if (variant.failureBars) { row.failureBars = variant.failureBars; row.minimumFavorableMove = variant.minFavorableMove; }
  if (variant.initialRiskPoints) row.initialRiskPoints = variant.initialRiskPoints;
  return row;
}
async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN; if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const { apiGet, fetchCandles } = createGrowwPaperClient({ token });
  const { date } = indiaParts(); writeStatus({ date, status: 'STARTING', strategies: PAPER_VARIANTS.map((v) => v.id), rules: PAPER_RULES }); await waitUntil('09:27');
  let spotCandles = [];
  for (let attempt = 0; attempt < 8; attempt++) { const currentClock = indiaParts().time; spotCandles = completedCandles(await fetchCandles('CASH', 'NSE-NIFTY', date, '09:15', currentClock), currentClock); if (candleAt(spotCandles, '09:25')) break; await sleep(30000); }
  const spot925 = candleAt(spotCandles, '09:25')?.open; if (!Number.isFinite(spot925)) { writeStatus({ date, status: 'NO_SESSION', reason: 'No completed 09:25 NIFTY candle' }); return; }
  const year = Number(date.slice(0, 4)); const expiryPayload = await apiGet('/historical/expiries', { exchange: 'NSE', underlying_symbol: 'NIFTY', year }); const expiry = nearestExpiry(expiryPayload.expiries ?? [], date); if (!expiry) { writeStatus({ date, status: 'DATA_MISSING', reason: 'No weekly expiry' }); return; }
  const loadContracts = async () => (await apiGet('/historical/contracts', { exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry })).contracts ?? [];
  const selection = await selectPaperContracts({ fetchCandles, loadContracts, date, spot: spot925, now: () => indiaParts().time });
  const { ce, pe } = selection;
  const selectionAudit = { spot925, expiry, referencePremium: PAPER_RULES.referencePremium, selectionAttempts: selection.attempt, ce, pe };
  if (!ce.selected || !pe.selected || !ce.bracketed || !pe.bracketed) { writeStatus({ date, status: 'DATA_BOUNDARY', reason: 'Could not bracket ₹180 on both CE and PE candidate ladders', selectionAudit }); return; }
  writeStatus({ date, status: 'WAITING_SIGNAL', selectionAudit, call: ce.selected, put: pe.selected });
  let chosen = null, entryInfo = null;
  while (indiaParts().time <= PAPER_RULES.signalCutoff) {
    const end = indiaParts().time; const callCandles = completedCandles(await fetchCandles('FNO', ce.selected.symbol, date, '09:25', end), end); const putCandles = completedCandles(await fetchCandles('FNO', pe.selected.symbol, date, '09:25', end), end);
    const side = selectSide(callCandles, putCandles); if (side?.ambiguous) { writeStatus({ date, status: 'AMBIGUOUS', reason: 'CE and PE signalled in same completed minute', selectionAudit }); return; }
    if (side) { const chosenRows = side.side === 'CE' ? callCandles : putCandles; const selected = side.side === 'CE' ? ce.selected : pe.selected; entryInfo = nextBarEntry(chosenRows, side.signal); if (entryInfo?.rejected) { writeStatus({ date, status: 'NO_TRADE', reason: 'Entry outside 160-220 band', entry: entryInfo.entry, selectionAudit }); return; } if (entryInfo) { chosen = { ...selected, side: side.side, signal: side.signal }; break; } }
    await sleep(30000);
  }
  if (!entryInfo || !chosen) { writeStatus({ date, status: 'NO_TRADE', reason: 'No valid ₹180 crossing before 09:45', selectionAudit }); return; }
  const lots = lotsAffordable(entryInfo.entry); if (lots < 1) { writeStatus({ date, status: 'NO_TRADE', reason: '₹60k capital cannot fund one lot', entry: entryInfo.entry, selectionAudit }); return; }
  const activeVariants = PAPER_VARIANTS.filter((variant) => variantEligible(entryInfo.entry, variant));
  const positions = Object.fromEntries(activeVariants.map((variant) => [variant.id, initialPosition({ entry: entryInfo.entry, entryTime: entryInfo.entryBar.timestamp, variant })])); const processed = new Set();
  writeStatus({ date, status: 'OPEN', selectionAudit, side: chosen.side, strike: chosen.strike, lots, entry: entryInfo.entry, entryTime: entryInfo.entryBar.timestamp, variants: Object.fromEntries(Object.entries(positions).map(([id, position]) => [id, positionStatus(position)])) });
  while (Object.values(positions).some((position) => !position.exit)) {
    const now = indiaParts().time; const candles = completedCandles(await fetchCandles('FNO', chosen.symbol, date, timeOf(entryInfo.entryBar.timestamp), now), now);
    for (const candle of candles) { if (candle.timestamp < entryInfo.entryBar.timestamp || processed.has(candle.timestamp)) continue; for (const id of Object.keys(positions)) positions[id] = processCompletedBar(positions[id], candle); processed.add(candle.timestamp); }
    if (Object.values(positions).every((position) => position.exit)) break;
    if (now >= '15:30') { const last = candles.filter((c) => timeOf(c.timestamp) <= PAPER_RULES.sessionExit).at(-1); if (last) for (const id of Object.keys(positions)) positions[id] = sessionExit(positions[id], last); break; }
    writeStatus({ date, status: 'OPEN', selectionAudit, side: chosen.side, strike: chosen.strike, lots, entry: entryInfo.entry, entryTime: entryInfo.entryBar.timestamp, variants: Object.fromEntries(Object.entries(positions).map(([id, position]) => [id, positionStatus(position)])) }); await sleep(30000);
  }
  if (Object.values(positions).some((position) => !position.exit)) { writeStatus({ date, status: 'ERROR', reason: 'At least one strategy has no executable exit', selectionAudit }); return; }
  const rows = activeVariants.map((variant) => buildRow({ position: positions[variant.id], date, expiry, chosen, lots })); appendTrades(rows); writeStatus({ date, status: 'CLOSED', selectionAudit, ineligibleStrategies: PAPER_VARIANTS.filter((variant) => !variantEligible(entryInfo.entry, variant)).map((variant) => variant.id), trades: rows }); console.log(JSON.stringify(rows, null, 2));
}
main().catch((error) => { console.error(error.stack || error.message); writeStatus({ status: 'FAILED', reason: error.message }); process.exitCode = 1; });
