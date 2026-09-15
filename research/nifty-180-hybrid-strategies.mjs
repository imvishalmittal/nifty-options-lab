import { chooseSingleClosest } from './nifty-180-single-closest.mjs';
import { steppedTrailStop } from './nifty-180-stepped-trail.mjs';

export const HYBRID_RULES = Object.freeze({
  referencePremium: 180,
  initialStopPremium: 160,
  entryCeilingPremium: 220,
  signalStart: '09:30',
  signalCutoff: '09:45',
  sessionExit: '15:29',
  trailActivationPremium: 220,
  trailGapPoints: 20,
});

export const HYBRID_STRATEGIES = Object.freeze([
  Object.freeze({ key: 'S1', name: 'Recovery Hybrid', failFast: false, niftyConfirmation: false }),
  Object.freeze({ key: 'S2', name: 'Fail-Fast Hybrid', failFast: true, niftyConfirmation: false }),
  Object.freeze({ key: 'S3', name: 'NIFTY-Confirmed Fail-Fast Hybrid', failFast: true, niftyConfirmation: true }),
]);

export const HYBRID_VARIANTS = Object.freeze([
  Object.freeze({ key: 'V2', kind: 'continuous', trailStepPoints: null }),
  Object.freeze({ key: 'V3_5', kind: 'stepped', trailStepPoints: 5 }),
  Object.freeze({ key: 'V3_10', kind: 'stepped', trailStepPoints: 10 }),
]);

export function timeOf(timestamp) {
  const match = String(timestamp).match(/T(\d{2}:\d{2})/);
  if (!match) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return match[1];
}

function compareTimestamp(a, b) {
  if (!a) return 1;
  if (!b) return -1;
  return a.timestamp.localeCompare(b.timestamp);
}

export function choosePrimaryBackup(callSelection, putSelection, referencePremium = HYBRID_RULES.referencePremium) {
  const primary = chooseSingleClosest(callSelection, putSelection, referencePremium);
  if (!primary) return { primary: null, backup: null };
  const backup = primary.optionType === 'CE' ? putSelection : callSelection;
  return { primary, backup: backup?.symbol ? backup : null };
}

export function firstFreshCross(candles, rules = HYBRID_RULES) {
  for (let i = 1; i < candles.length; i += 1) {
    const previous = candles[i - 1];
    const current = candles[i];
    const t = timeOf(current.timestamp);
    if (t < rules.signalStart || t >= rules.signalCutoff) continue;
    if (previous.close <= rules.referencePremium && current.close > rules.referencePremium) return current;
  }
  return null;
}

export function firstCloseAbove(candles, rules = HYBRID_RULES) {
  for (const candle of candles) {
    const t = timeOf(candle.timestamp);
    if (t < rules.signalStart || t >= rules.signalCutoff) continue;
    if (candle.close > rules.referencePremium) return candle;
  }
  return null;
}

export function recoverySignal({ primary, backup, primaryCandles, backupCandles, rules = HYBRID_RULES }) {
  const primarySignal = firstCloseAbove(primaryCandles, rules);
  const backupSignal = backup ? firstFreshCross(backupCandles, rules) : null;
  if (!primarySignal && !backupSignal) return null;
  if (primarySignal && (!backupSignal || compareTimestamp(primarySignal, backupSignal) <= 0)) {
    return { source: 'PRIMARY', contract: primary, side: primary.optionType, signal: primarySignal };
  }
  return { source: 'BACKUP', contract: backup, side: backup.optionType, signal: backupSignal };
}

export function niftyReferenceRange(niftyCandles) {
  const required = ['09:25', '09:26', '09:27', '09:28', '09:29'];
  const rows = required.map((clock) => niftyCandles.find((candle) => timeOf(candle.timestamp) === clock));
  if (rows.some((row) => !row)) return null;
  return {
    high: Math.max(...rows.map((row) => row.high)),
    low: Math.min(...rows.map((row) => row.low)),
    clocks: required,
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

export function niftyConfirmedRecoverySignal({
  primary,
  backup,
  primaryCandles,
  backupCandles,
  niftyCandles,
  rules = HYBRID_RULES,
}) {
  const range = niftyReferenceRange(niftyCandles);
  if (!range) return { dataMissing: true, reason: 'Incomplete NIFTY 09:25-09:29 confirmation range' };

  const primaryMap = byClock(primaryCandles);
  const backupMap = byClock(backupCandles);
  const niftyMap = byClock(niftyCandles);
  let primaryArmed = false;
  let backupArmed = false;

  for (let minute = 30; minute <= 44; minute += 1) {
    const clock = `09:${String(minute).padStart(2, '0')}`;
    if (clock < rules.signalStart || clock >= rules.signalCutoff) continue;
    const p = primaryMap.get(clock);
    const b = backupMap.get(clock);
    const n = niftyMap.get(clock);

    if (p) primaryArmed = p.close > rules.referencePremium;
    if (b) {
      const previous = previousBar(backupCandles, b.timestamp);
      if (previous && previous.close <= rules.referencePremium && b.close > rules.referencePremium) backupArmed = true;
      if (b.close <= rules.referencePremium) backupArmed = false;
    }

    if (primaryArmed && p && directionConfirmed(primary.optionType, n, range)) {
      return { source: 'PRIMARY', contract: primary, side: primary.optionType, signal: p, niftySignal: n, niftyRange: range };
    }
    if (backup && backupArmed && b && directionConfirmed(backup.optionType, n, range)) {
      return { source: 'BACKUP', contract: backup, side: backup.optionType, signal: b, niftySignal: n, niftyRange: range };
    }
  }
  return { signal: null, niftyRange: range };
}

export function nextBarEntry(candles, signal, rules = HYBRID_RULES) {
  const index = candles.findIndex((candle) => candle.timestamp === signal?.timestamp);
  if (index < 0 || index + 1 >= candles.length) return null;
  const entryBar = candles[index + 1];
  if (timeOf(entryBar.timestamp) >= rules.signalCutoff) return null;
  const entry = entryBar.open;
  if (!(entry > rules.initialStopPremium && entry < rules.entryCeilingPremium)) {
    return { rejected: true, reason: 'Executable entry is outside the fixed 160-220 band', entry, entryBar };
  }
  return { entry, entryBar };
}

export function classifyHybridEntry({
  strategy,
  callSelection,
  putSelection,
  callCandles,
  putCandles,
  niftyCandles = [],
  rules = HYBRID_RULES,
}) {
  const { primary, backup } = choosePrimaryBackup(callSelection, putSelection, rules.referencePremium);
  if (!primary?.symbol || !backup?.symbol) {
    return { status: 'DATA_MISSING', reason: 'Both primary and opposite-side backup contracts are required', primary, backup };
  }
  const primaryCandles = primary.optionType === 'CE' ? callCandles : putCandles;
  const backupCandles = backup.optionType === 'CE' ? callCandles : putCandles;
  const candidate = strategy.niftyConfirmation
    ? niftyConfirmedRecoverySignal({ primary, backup, primaryCandles, backupCandles, niftyCandles, rules })
    : recoverySignal({ primary, backup, primaryCandles, backupCandles, rules });

  if (candidate?.dataMissing) return { status: 'DATA_MISSING', reason: candidate.reason, primary, backup };
  if (!candidate?.signal) {
    return {
      status: 'NO_TRADE',
      reason: strategy.niftyConfirmation
        ? 'No option signal with matching NIFTY directional confirmation before cutoff'
        : 'Neither primary first-close nor backup fresh-cross signal qualified before cutoff',
      primary,
      backup,
      niftyRange: candidate?.niftyRange ?? null,
    };
  }

  const chosenCandles = candidate.side === 'CE' ? callCandles : putCandles;
  const entry = nextBarEntry(chosenCandles, candidate.signal, rules);
  if (!entry) {
    return {
      status: 'NO_TRADE',
      reason: 'No executable next-bar entry before 09:45 cutoff',
      primary,
      backup,
      ...candidate,
    };
  }
  if (entry.rejected) {
    return {
      status: 'NO_TRADE',
      reason: entry.reason,
      primary,
      backup,
      ...candidate,
      entry: entry.entry,
      entryTime: entry.entryBar.timestamp,
    };
  }
  return {
    status: 'SIGNAL',
    primary,
    backup,
    ...candidate,
    entry: entry.entry,
    entryBar: entry.entryBar,
    entryTime: entry.entryBar.timestamp,
    chosenCandles,
  };
}

function stopFill(candle, stop) {
  return candle.open <= stop ? candle.open : stop;
}

function finishPosition({ entry, entryBar, exit, exitTime, result, activeStop, peakHigh, troughLow, trailActivated, stopHistory, variant }) {
  return {
    entry,
    entryTime: entryBar.timestamp,
    exit,
    exitTime,
    result,
    trailActivated,
    finalStop: activeStop,
    peakPremium: peakHigh,
    troughPremium: troughLow,
    mfePoints: peakHigh - entry,
    maePoints: entry - troughLow,
    pnlPerUnit: exit - entry,
    trailStepPoints: variant.trailStepPoints,
    trailGapPoints: HYBRID_RULES.trailGapPoints,
    stopHistory,
  };
}

export function evaluateHybridPosition(candles, signal, variant, {
  failFast = false,
  rules = HYBRID_RULES,
} = {}) {
  const signalIndex = candles.findIndex((candle) => candle.timestamp === signal?.timestamp);
  if (signalIndex < 0 || signalIndex + 1 >= candles.length) return null;
  const entryBar = candles[signalIndex + 1];
  if (timeOf(entryBar.timestamp) >= rules.signalCutoff) return null;
  const entry = entryBar.open;
  if (!(entry > rules.initialStopPremium && entry < rules.entryCeilingPremium)) {
    return { rejected: true, reason: 'Executable entry is outside the fixed 160-220 band', entry, entryTime: entryBar.timestamp };
  }

  let activeStop = rules.initialStopPremium;
  let peakHigh = entry;
  let troughLow = entry;
  let trailActivated = false;
  const stopHistory = [{ effectiveFrom: entryBar.timestamp, stop: activeStop, reason: 'initial' }];

  for (let i = signalIndex + 1; i < candles.length; i += 1) {
    const candle = candles[i];
    if (timeOf(candle.timestamp) > rules.sessionExit) break;

    // Preserve the existing V2/V3 intrabar conventions so the hybrid study
    // changes only the intended signal/fail-fast logic.
    if (variant.kind === 'continuous') {
      peakHigh = Math.max(peakHigh, candle.high);
      troughLow = Math.min(troughLow, candle.low);
      if (candle.low <= activeStop) {
        const exit = stopFill(candle, activeStop);
        return finishPosition({ entry, entryBar, exit, exitTime: candle.timestamp, result: trailActivated ? 'TRAIL_STOP' : 'INITIAL_STOP', activeStop, peakHigh, troughLow, trailActivated, stopHistory, variant });
      }
    } else {
      if (candle.low <= activeStop) {
        const exit = stopFill(candle, activeStop);
        const realizedTrough = Math.min(troughLow, exit);
        return finishPosition({ entry, entryBar, exit, exitTime: candle.timestamp, result: trailActivated ? 'TRAIL_STOP' : 'INITIAL_STOP', activeStop, peakHigh, troughLow: realizedTrough, trailActivated, stopHistory, variant });
      }
      peakHigh = Math.max(peakHigh, candle.high);
      troughLow = Math.min(troughLow, candle.low);
    }

    let proposedStop = activeStop;
    if (variant.kind === 'continuous' && peakHigh >= rules.trailActivationPremium) {
      proposedStop = Math.max(rules.initialStopPremium, peakHigh - rules.trailGapPoints);
    } else if (variant.kind === 'stepped') {
      proposedStop = steppedTrailStop({
        entry,
        peakHigh,
        initialStop: rules.initialStopPremium,
        trailGapPoints: rules.trailGapPoints,
        trailStepPoints: variant.trailStepPoints,
      });
    }
    if (proposedStop > activeStop) {
      trailActivated = true;
      activeStop = proposedStop;
      stopHistory.push({
        effectiveFrom: candles[i + 1]?.timestamp ?? candle.timestamp,
        stop: activeStop,
        reason: variant.kind === 'continuous' ? 'trailing' : 'stepped-trailing',
        sourceBar: candle.timestamp,
        sourcePeak: peakHigh,
      });
    }

    if (failFast && !trailActivated && candle.close < rules.referencePremium) {
      const next = candles[i + 1];
      if (next && timeOf(next.timestamp) <= rules.sessionExit) {
        const exit = next.open;
        const realizedPeak = variant.kind === 'continuous' ? peakHigh : Math.max(peakHigh, candle.high);
        const realizedTrough = Math.min(troughLow, exit);
        return finishPosition({ entry, entryBar, exit, exitTime: next.timestamp, result: 'FAILED_BREAKOUT_EXIT', activeStop, peakHigh: realizedPeak, troughLow: realizedTrough, trailActivated, stopHistory, variant });
      }
    }
  }

  const eligible = candles.filter((candle) => timeOf(candle.timestamp) <= rules.sessionExit && candle.timestamp >= entryBar.timestamp);
  const last = eligible.at(-1);
  if (!last) return null;
  return finishPosition({ entry, entryBar, exit: last.close, exitTime: last.timestamp, result: 'SESSION_EXIT', activeStop, peakHigh, troughLow, trailActivated, stopHistory, variant });
}
