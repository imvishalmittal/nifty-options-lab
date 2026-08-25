export const ENTRY_RELATIVE_RULES = Object.freeze({
  referencePremium: 180,
  entryFloorPremium: 160,
  entryCeilingPremium: 220,
  initialRiskPoints: 20,
  rewardPoints: 40,
  trailGapPoints: 20,
  signalCutoff: '09:45',
  sessionExit: '15:29',
});

export const ENTRY_RELATIVE_VARIANTS = Object.freeze([
  Object.freeze({ id: 'RELATIVE_FIXED_2R', kind: 'fixed', label: 'Entry-relative fixed 2R' }),
  Object.freeze({ id: 'RELATIVE_CONTINUOUS', kind: 'continuous', label: 'Entry-relative continuous trail' }),
  Object.freeze({ id: 'RELATIVE_STEP_5', kind: 'stepped', trailStepPoints: 5, label: 'Entry-relative 5-point stepped trail' }),
  Object.freeze({ id: 'RELATIVE_STEP_10', kind: 'stepped', trailStepPoints: 10, label: 'Entry-relative 10-point stepped trail' }),
]);

function timeOf(timestamp) {
  const match = String(timestamp).match(/T(\d{2}:\d{2})/);
  if (!match) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return match[1];
}

function stopFill(candle, stop) {
  return candle.open <= stop ? candle.open : stop;
}

function steppedStop({ entry, peakHigh, initialStop, trailGapPoints, trailStepPoints }) {
  const favorableMove = Math.max(0, peakHigh - entry);
  const steps = Math.floor((favorableMove + 1e-9) / trailStepPoints);
  if (steps < 1) return initialStop;
  return Math.max(initialStop, entry + steps * trailStepPoints - trailGapPoints);
}

export function evaluateEntryRelativePosition(candles, signal, {
  variant,
  rules = ENTRY_RELATIVE_RULES,
} = {}) {
  if (!variant || !ENTRY_RELATIVE_VARIANTS.some((row) => row.id === variant.id)) {
    throw new Error('A frozen entry-relative variant is required');
  }
  const signalIndex = candles.findIndex((candle) => candle.timestamp === signal?.timestamp);
  if (signalIndex < 0 || signalIndex + 1 >= candles.length) return null;

  const entryBar = candles[signalIndex + 1];
  if (timeOf(entryBar.timestamp) >= rules.signalCutoff) return null;
  const entry = Number(entryBar.open);
  if (!(entry > rules.entryFloorPremium && entry < rules.entryCeilingPremium)) {
    return {
      rejected: true,
      reason: 'Executable entry is outside the frozen 160-220 eligibility band',
      entry,
      entryTime: entryBar.timestamp,
    };
  }

  const initialStop = Number((entry - rules.initialRiskPoints).toFixed(2));
  const target = Number((entry + rules.rewardPoints).toFixed(2));
  let activeStop = initialStop;
  let peakHigh = entry;
  let troughLow = entry;
  let trailActivated = false;
  const stopHistory = [{ effectiveFrom: entryBar.timestamp, stop: initialStop, reason: 'entry-minus-risk' }];

  for (let index = signalIndex + 1; index < candles.length; index += 1) {
    const candle = candles[index];
    if (timeOf(candle.timestamp) > rules.sessionExit) break;

    // Conservative stop-first convention for one-minute OHLC bars. A stop
    // already effective at the start of this bar wins over a target/high that
    // may also occur in the same bar because intrabar ordering is unknowable.
    if (candle.low <= activeStop) {
      const exit = stopFill(candle, activeStop);
      troughLow = Math.min(troughLow, exit);
      return {
        entry,
        entryTime: entryBar.timestamp,
        initialStop,
        target,
        exit,
        exitTime: candle.timestamp,
        result: trailActivated ? 'TRAIL_STOP' : 'INITIAL_STOP',
        finalStop: activeStop,
        trailActivated,
        peakPremium: peakHigh,
        troughPremium: troughLow,
        mfePoints: peakHigh - entry,
        maePoints: entry - troughLow,
        pnlPerUnit: exit - entry,
        stopHistory,
      };
    }

    if (variant.kind === 'fixed' && candle.high >= target) {
      peakHigh = Math.max(peakHigh, target);
      troughLow = Math.min(troughLow, candle.open);
      return {
        entry,
        entryTime: entryBar.timestamp,
        initialStop,
        target,
        exit: target,
        exitTime: candle.timestamp,
        result: 'TARGET',
        finalStop: activeStop,
        trailActivated: false,
        peakPremium: peakHigh,
        troughPremium: troughLow,
        mfePoints: peakHigh - entry,
        maePoints: entry - troughLow,
        pnlPerUnit: target - entry,
        stopHistory,
      };
    }

    peakHigh = Math.max(peakHigh, candle.high);
    troughLow = Math.min(troughLow, candle.low);

    let proposedStop = activeStop;
    if (variant.kind === 'continuous' && peakHigh >= target) {
      proposedStop = Math.max(initialStop, peakHigh - rules.trailGapPoints);
    } else if (variant.kind === 'stepped') {
      proposedStop = steppedStop({
        entry,
        peakHigh,
        initialStop,
        trailGapPoints: rules.trailGapPoints,
        trailStepPoints: variant.trailStepPoints,
      });
    }
    if (proposedStop > activeStop) {
      trailActivated = true;
      activeStop = Number(proposedStop.toFixed(2));
      stopHistory.push({
        effectiveFrom: candles[index + 1]?.timestamp ?? candle.timestamp,
        stop: activeStop,
        reason: variant.kind === 'continuous' ? 'continuous-trailing' : 'stepped-trailing',
        sourceBar: candle.timestamp,
        sourcePeak: peakHigh,
      });
    }
  }

  const last = candles.filter((candle) => candle.timestamp >= entryBar.timestamp
    && timeOf(candle.timestamp) <= rules.sessionExit).at(-1);
  if (!last) return null;
  return {
    entry,
    entryTime: entryBar.timestamp,
    initialStop,
    target,
    exit: last.close,
    exitTime: last.timestamp,
    result: 'SESSION_EXIT',
    finalStop: activeStop,
    trailActivated,
    peakPremium: peakHigh,
    troughPremium: troughLow,
    mfePoints: peakHigh - entry,
    maePoints: entry - troughLow,
    pnlPerUnit: last.close - entry,
    stopHistory,
  };
}
