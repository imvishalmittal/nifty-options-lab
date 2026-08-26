import fs from 'node:fs';

import {
  PAPER_RULES, PAPER_VARIANTS, initialPosition, lotsAffordable, nearestExpiry, nextBarEntry,
  processCompletedBar, selectSide, sessionExit, timeOf,
} from './paper-engine.mjs';
import { candleAt, createGrowwPaperClient } from './groww-paper-client.mjs';
import { selectPaperContracts } from './paper-contract-selection.mjs';
import { classifyV4Entry, CONFIRMED_VARIANTS, initialV4Position, processV4CompletedBar } from './v4-engine.mjs';

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function optionCosts(entry, exit, units, tradeDate) {
  const sttRate = tradeDate < '2026-04-01' ? 0.001 : 0.0015;
  const buy = entry * units; const sell = exit * units; const total = buy + sell;
  const brokerage = 40; const exchange = total * 0.0003503; const sebi = total * 0.000001;
  const ipft = total * 0.000005; const stamp = buy * 0.00003; const stt = sell * sttRate;
  const gst = (brokerage + exchange + sebi + ipft) * 0.18;
  const charges = brokerage + exchange + sebi + ipft + stamp + stt + gst;
  return { gross: (exit - entry) * units, charges, net: (exit - entry) * units - charges };
}

function simulate({ variants, entry, entryBar, candles, createPosition, processBar }) {
  const positions = Object.fromEntries(variants.map((variant) => [variant.id, createPosition({ entry, entryTime: entryBar.timestamp, variant })]));
  for (const candle of candles.filter((row) => row.timestamp >= entryBar.timestamp)) {
    for (const variant of variants) positions[variant.id] = processBar(positions[variant.id], candle);
    if (Object.values(positions).every((position) => position.exit)) break;
  }
  if (Object.values(positions).some((position) => !position.exit)) {
    const closing = candles.filter((candle) => timeOf(candle.timestamp) <= PAPER_RULES.sessionExit).at(-1);
    if (timeOf(closing?.timestamp) === PAPER_RULES.sessionExit) {
      for (const variant of variants) positions[variant.id] = sessionExit(positions[variant.id], closing);
    }
  }
  return positions;
}

function baseRow({ position, date, expiry, chosen, lots }) {
  const variant = position.variant; const units = lots * PAPER_RULES.lotSize;
  const pnl = optionCosts(position.entry, position.exit.price, units, date); const mfe = position.peakHigh - position.entry;
  const startTarget = variant.kind === 'fixed_target' ? position.targetPremium : variant.kind === 'v2'
    ? PAPER_RULES.trailActivation : Number((position.entry + PAPER_RULES.trailGap).toFixed(2));
  const row = {
    source: 'PAPER_REPLAY', strategy: variant.strategy, strategyVersion: variant.strategyVersion, date,
    indexStockName: 'NIFTY 50', weeklyExpiry: expiry, lots, callType: chosen.side, strikePrice: chosen.strike,
    startTarget, startStopLoss: position.initialStop, endStopLoss: Number(position.activeStop.toFixed(2)),
    entryTime: timeOf(position.entryTime), exitTime: timeOf(position.exit.time),
    stopLossAdjustments: Math.max(0, position.stopHistory.length - 1), totalPnl: Number(pnl.net.toFixed(2)),
    entryPremium: position.entry, peakPremium: Number(position.peakHigh.toFixed(2)), maxFavorableMove: Number(mfe.toFixed(2)),
    breakevenReached: mfe >= PAPER_RULES.trailGap, trailGapPoints: PAPER_RULES.trailGap,
    exitPremium: position.exit.price, exitReason: position.exit.result,
    grossPnl: Number(pnl.gross.toFixed(2)), charges: Number(pnl.charges.toFixed(2)), reconstructed: true,
  };
  if (variant.kind === 'v3' || variant.kind === 'v3_time') row.trailStepPoints = variant.trailStep;
  if (variant.targetMultiple) row.targetMultiple = variant.targetMultiple;
  if (variant.failureBars) { row.failureBars = variant.failureBars; row.minimumFavorableMove = variant.minFavorableMove; }
  if (variant.initialRiskPoints) row.initialRiskPoints = variant.initialRiskPoints;
  return row;
}

function confirmedRow({ position, date, expiry, chosen, lots, signalInfo }) {
  const variant = position.variant; const units = lots * PAPER_RULES.lotSize;
  const pnl = optionCosts(position.entry, position.exit.price, units, date); const mfe = position.peakHigh - position.entry;
  const row = {
    source: 'PAPER_REPLAY', strategy: variant.strategy, strategyVersion: variant.strategyVersion, date,
    indexStockName: 'NIFTY 50', weeklyExpiry: expiry, lots, callType: chosen.side, strikePrice: chosen.strike,
    startTarget: variant.id === 'V4' ? PAPER_RULES.trailActivation : Number((position.entry + PAPER_RULES.trailGap).toFixed(2)),
    startStopLoss: position.initialStop, endStopLoss: Number(position.activeStop.toFixed(2)),
    entryTime: timeOf(position.entryTime), exitTime: timeOf(position.exit.time),
    stopLossAdjustments: Math.max(0, position.stopHistory.length - 1), totalPnl: Number(pnl.net.toFixed(2)),
    entryPremium: position.entry, peakPremium: Number(position.peakHigh.toFixed(2)), maxFavorableMove: Number(mfe.toFixed(2)),
    breakevenReached: mfe >= PAPER_RULES.trailGap, trailGapPoints: PAPER_RULES.trailGap,
    exitPremium: position.exit.price, exitReason: position.exit.result,
    grossPnl: Number(pnl.gross.toFixed(2)), charges: Number(pnl.charges.toFixed(2)),
    signalSource: signalInfo.source, niftyRangeHigh: signalInfo.niftyRange?.high ?? null,
    niftyRangeLow: signalInfo.niftyRange?.low ?? null, niftySignalTime: timeOf(signalInfo.niftySignal?.timestamp),
    niftySignalClose: signalInfo.niftySignal?.close ?? null, primarySymbol: signalInfo.primary?.symbol ?? null,
    backupSymbol: signalInfo.backup?.symbol ?? null, reconstructed: true,
  };
  if (variant.trailStep) row.trailStepPoints = variant.trailStep;
  return row;
}

function noTrade(reason) { return { status: 'NO_TRADE', reason, trades: [], complete: true }; }

export function replayBase({ date, expiry, ce, pe, callCandles, putCandles }) {
  const signal = selectSide(callCandles, putCandles);
  if (!signal) return noTrade('No valid ₹180 crossing before 09:45');
  const chosenCandles = signal.side === 'CE' ? callCandles : putCandles;
  const contract = signal.side === 'CE' ? ce : pe;
  const entry = nextBarEntry(chosenCandles, signal.signal);
  if (!entry) return noTrade('No completed causal entry bar before 09:45');
  if (entry.rejected) return noTrade('Entry outside 160-220 band');
  const lots = lotsAffordable(entry.entry);
  if (lots < 1) return noTrade('₹60k capital cannot fund one lot');
  const positions = simulate({ variants: PAPER_VARIANTS, entry: entry.entry, entryBar: entry.entryBar, candles: chosenCandles, createPosition: initialPosition, processBar: processCompletedBar });
  const complete = Object.values(positions).every((position) => position.exit);
  return {
    status: complete ? 'CLOSED' : 'INCOMPLETE_REPLAY', complete,
    reason: complete ? null : 'Selected trade remains open and 15:29 candle is unavailable',
    signalTime: timeOf(signal.signal.timestamp), side: signal.side, strike: contract.strike,
    entry: entry.entry, entryTime: timeOf(entry.entryBar.timestamp), lots,
    trades: complete ? PAPER_VARIANTS.map((variant) => baseRow({ position: positions[variant.id], date, expiry, chosen: { ...contract, side: signal.side }, lots })) : [],
  };
}

export function replayConfirmed({ date, expiry, ce, pe, callCandles, putCandles, niftyCandles }) {
  const classified = classifyV4Entry({ callSelection: ce, putSelection: pe, callCandles, putCandles, niftyCandles });
  if (classified.status !== 'ENTRY') {
    if (classified.status === 'NO_TRADE') return noTrade(classified.reason);
    return noTrade('No V4 option signal with matching NIFTY confirmation before 09:45');
  }
  const lots = lotsAffordable(classified.entry);
  if (lots < 1) return noTrade('₹60k capital cannot fund one lot');
  const chosenCandles = classified.side === 'CE' ? callCandles : putCandles;
  const positions = simulate({ variants: CONFIRMED_VARIANTS, entry: classified.entry, entryBar: classified.entryBar, candles: chosenCandles, createPosition: initialV4Position, processBar: processV4CompletedBar });
  const complete = Object.values(positions).every((position) => position.exit);
  return {
    status: complete ? 'CLOSED' : 'INCOMPLETE_REPLAY', complete,
    reason: complete ? null : 'Selected trade remains open and 15:29 candle is unavailable',
    signalTime: timeOf(classified.signal.timestamp), signalSource: classified.source,
    side: classified.side, strike: classified.contract.strike, entry: classified.entry,
    entryTime: timeOf(classified.entryBar.timestamp), lots,
    trades: complete ? CONFIRMED_VARIANTS.map((variant) => confirmedRow({
      position: positions[variant.id], date, expiry, chosen: { ...classified.contract, side: classified.side }, lots, signalInfo: classified,
    })) : [],
  };
}

export async function runReplay({ token, date }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date=YYYY-MM-DD is required');
  const { apiGet, fetchCandles } = createGrowwPaperClient({ token });
  const niftyCandles = await fetchCandles('CASH', 'NSE-NIFTY', date, '09:15', '15:30');
  const spot925 = candleAt(niftyCandles, '09:25')?.open;
  if (!Number.isFinite(spot925)) throw new Error('Replay has no 09:25 NIFTY candle');
  const expiryPayload = await apiGet('/historical/expiries', { exchange: 'NSE', underlying_symbol: 'NIFTY', year: Number(date.slice(0, 4)) });
  const expiry = nearestExpiry(expiryPayload.expiries ?? [], date);
  if (!expiry) throw new Error('Replay has no eligible weekly expiry');
  const loadContracts = async () => (await apiGet('/historical/contracts', { exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry })).contracts ?? [];
  const selection = await selectPaperContracts({ fetchCandles, loadContracts, date, spot: spot925, maxAttempts: 1 });
  if (!selection.complete) throw new Error('Replay could not bracket ₹180 after repairing the contract ladder');
  const [callCandles, putCandles] = await Promise.all([
    fetchCandles('FNO', selection.ce.selected.symbol, date, '09:25', '15:30'),
    fetchCandles('FNO', selection.pe.selected.symbol, date, '09:25', '15:30'),
  ]);
  const selectionAudit = { spot925, expiry, referencePremium: PAPER_RULES.referencePremium, selectionAttempts: 1, ce: selection.ce, pe: selection.pe };
  const base = replayBase({ date, expiry, ce: selection.ce.selected, pe: selection.pe.selected, callCandles, putCandles });
  const confirmed = replayConfirmed({ date, expiry, ce: selection.ce.selected, pe: selection.pe.selected, callCandles, putCandles, niftyCandles });
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), date, source: 'PAPER_REPLAY',
    complete: base.complete && confirmed.complete, selectionAudit, base, confirmed,
  };
}

async function main() {
  const date = arg('date'); const out = arg('out', 'paper-replay.json');
  const result = await runReplay({ token: process.env.GROWW_ACCESS_TOKEN, date });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ date, complete: result.complete, base: result.base.status, confirmed: result.confirmed.status, out }));
  if (!result.complete) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
