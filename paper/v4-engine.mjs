import { PAPER_RULES, initialPosition, nextBarEntry, processCompletedBar, timeOf } from './paper-engine.mjs';

export const V4_VARIANT = Object.freeze({
  id: 'V4',
  strategy: 'NIFTY ₹180 NIFTY-Confirmed Fail-Fast V4',
  strategyVersion: 'V4',
  kind: 'v2',
});

export const V5_VARIANT = Object.freeze({
  id: 'V5',
  strategy: 'NIFTY ₹180 NIFTY-Confirmed Stepped Trail V5',
  strategyVersion: 'V5',
  kind: 'v3',
  trailStep: 10,
});

export const CONFIRMED_VARIANTS = Object.freeze([V4_VARIANT, V5_VARIANT]);

function selectionDistance(row, reference = PAPER_RULES.referencePremium) {
  return Math.abs(Number(row?.premium) - reference);
}

export function choosePrimaryBackup(callSelection, putSelection, rules = PAPER_RULES) {
  const candidates = [callSelection, putSelection].filter((row) => row?.symbol && Number.isFinite(row?.premium));
  if (candidates.length !== 2) return { primary: null, backup: null };
  const ranked = [...candidates].sort((a, b) => {
    const distance = selectionDistance(a, rules.referencePremium) - selectionDistance(b, rules.referencePremium);
    if (distance !== 0) return distance;
    if (a.premium !== b.premium) return b.premium - a.premium;
    return String(a.optionType).localeCompare(String(b.optionType));
  });
  return { primary: ranked[0], backup: ranked[1] };
}

export function niftyReferenceRange(niftyCandles) {
  const clocks = ['09:25', '09:26', '09:27', '09:28', '09:29'];
  const rows = clocks.map((clock) => niftyCandles.find((candle) => timeOf(candle.timestamp) === clock));
  if (rows.some((row) => !row)) return null;
  return {
    high: Math.max(...rows.map((row) => row.high)),
    low: Math.min(...rows.map((row) => row.low)),
    clocks,
  };
}

function byClock(candles) {
  return new Map(candles.map((candle) => [timeOf(candle.timestamp), candle]));
}

function previousBar(candles, timestamp) {
  const index = candles.findIndex((candle) => candle.timestamp === timestamp);
  return index > 0 ? candles[index - 1] : null;
}

function directionConfirmed(side, niftyBar, range) {
  if (!niftyBar || !range) return false;
  return side === 'CE' ? niftyBar.close > range.high : niftyBar.close < range.low;
}

export function classifyV4Signal({ callSelection, putSelection, callCandles, putCandles, niftyCandles, rules = PAPER_RULES }) {
  const { primary, backup } = choosePrimaryBackup(callSelection, putSelection, rules);
  if (!primary || !backup) return { status: 'DATA_MISSING', reason: 'Both CE and PE selections are required', primary, backup };
  const range = niftyReferenceRange(niftyCandles);
  if (!range) return { status: 'WAITING_DATA', reason: 'Incomplete NIFTY 09:25-09:29 range', primary, backup };

  const primaryCandles = primary.optionType === 'CE' ? callCandles : putCandles;
  const backupCandles = backup.optionType === 'CE' ? callCandles : putCandles;
  const primaryMap = byClock(primaryCandles);
  const backupMap = byClock(backupCandles);
  const niftyMap = byClock(niftyCandles);
  let primaryArmed = false;
  let backupArmed = false;

  for (let minute = 30; minute <= 44; minute += 1) {
    const clock = `09:${String(minute).padStart(2, '0')}`;
    const primaryBar = primaryMap.get(clock);
    const backupBar = backupMap.get(clock);
    const niftyBar = niftyMap.get(clock);

    if (primaryBar) primaryArmed = primaryBar.close > rules.referencePremium;
    if (backupBar) {
      const previous = previousBar(backupCandles, backupBar.timestamp);
      if (previous && previous.close <= rules.referencePremium && backupBar.close > rules.referencePremium) backupArmed = true;
      if (backupBar.close <= rules.referencePremium) backupArmed = false;
    }

    if (primaryArmed && primaryBar && directionConfirmed(primary.optionType, niftyBar, range)) {
      return { status: 'SIGNAL', source: 'PRIMARY', contract: primary, side: primary.optionType, signal: primaryBar, niftySignal: niftyBar, niftyRange: range, chosenCandles: primaryCandles, primary, backup };
    }
    if (backupArmed && backupBar && directionConfirmed(backup.optionType, niftyBar, range)) {
      return { status: 'SIGNAL', source: 'BACKUP', contract: backup, side: backup.optionType, signal: backupBar, niftySignal: niftyBar, niftyRange: range, chosenCandles: backupCandles, primary, backup };
    }
  }

  return { status: 'NO_SIGNAL', reason: 'No option signal with matching NIFTY confirmation yet', primary, backup, niftyRange: range };
}

export function classifyV4Entry(input, rules = PAPER_RULES) {
  const candidate = classifyV4Signal({ ...input, rules });
  if (candidate.status !== 'SIGNAL') return candidate;
  const entry = nextBarEntry(candidate.chosenCandles, candidate.signal, rules);
  if (!entry) return { ...candidate, status: 'WAITING_ENTRY', reason: 'Waiting for completed next bar' };
  if (entry.rejected) return { ...candidate, status: 'NO_TRADE', reason: 'Entry outside 160-220 band', entry: entry.entry, entryBar: entry.entryBar };
  return { ...candidate, status: 'ENTRY', entry: entry.entry, entryBar: entry.entryBar };
}

export function initialV4Position({ entry, entryTime, variant = V4_VARIANT, rules = PAPER_RULES }) {
  return { ...initialPosition({ entry, entryTime, variant, rules }), pendingFailFastFrom: null };
}

function stopFill(candle, stop) {
  return candle.open <= stop ? candle.open : stop;
}

export function processV4CompletedBar(position, candle, rules = PAPER_RULES) {
  if (position.variant.id !== 'V4') return processCompletedBar(position, candle, rules);
  if (position.exit || candle.timestamp === position.lastProcessed) return position;
  const next = { ...position, stopHistory: [...position.stopHistory], lastProcessed: candle.timestamp };

  if (next.pendingFailFastFrom) {
    const fill = candle.open;
    next.troughLow = Math.min(next.troughLow, fill);
    next.pendingFailFastFrom = null;
    next.exit = { price: fill, time: candle.timestamp, result: 'FAILED_BREAKOUT_EXIT' };
    return next;
  }

  if (candle.low <= next.activeStop) {
    const fill = stopFill(candle, next.activeStop);
    next.troughLow = Math.min(next.troughLow, fill);
    next.exit = { price: fill, time: candle.timestamp, result: next.trailActivated ? 'TRAIL_STOP' : 'INITIAL_STOP' };
    return next;
  }

  next.peakHigh = Math.max(next.peakHigh, candle.high);
  next.troughLow = Math.min(next.troughLow, candle.low);
  if (next.peakHigh >= rules.trailActivation) {
    const proposed = Math.max(rules.initialStop, next.peakHigh - rules.trailGap);
    if (proposed > next.activeStop) {
      next.trailActivated = true;
      next.activeStop = proposed;
      next.stopHistory.push({ effectiveFrom: null, stop: proposed, reason: 'continuous-trailing', sourceBar: candle.timestamp, sourcePeak: next.peakHigh });
    }
  }

  if (!next.trailActivated && candle.close < rules.referencePremium) next.pendingFailFastFrom = candle.timestamp;
  return next;
}
