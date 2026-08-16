export const STEPPED_RULES = Object.freeze({
  referencePremium: 180,
  initialStopPremium: 160,
  entryCeilingPremium: 220,
  signalStart: '09:30',
  signalCutoff: '09:45',
  sessionExit: '15:29',
  trailGapPoints: 20,
});

function timeOf(timestamp) {
  const m = String(timestamp).match(/T(\d{2}:\d{2})/);
  if (!m) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return m[1];
}

function findIndexByTimestamp(candles, timestamp) {
  return candles.findIndex((c) => c.timestamp === timestamp);
}

function stopFill(candle, stop) {
  return candle.open <= stop ? candle.open : stop;
}

export function steppedTrailStop({ entry, peakHigh, initialStop, trailGapPoints = 20, trailStepPoints }) {
  if (!(trailGapPoints > 0) || !(trailStepPoints > 0)) throw new Error('trail gap and step must be positive');
  const favorableMove = Math.max(0, peakHigh - entry);
  const completedSteps = Math.floor((favorableMove + 1e-9) / trailStepPoints);
  if (completedSteps < 1) return initialStop;
  const steppedPeak = entry + completedSteps * trailStepPoints;
  return Math.max(initialStop, steppedPeak - trailGapPoints);
}

export function evaluateSteppedMomentumPosition(candles, signal, {
  trailStepPoints = 10,
  trailGapPoints = STEPPED_RULES.trailGapPoints,
  rules = STEPPED_RULES,
} = {}) {
  const signalIndex = findIndexByTimestamp(candles, signal.timestamp);
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

  for (let i = signalIndex + 1; i < candles.length; i++) {
    const candle = candles[i];
    const t = timeOf(candle.timestamp);
    if (t > rules.sessionExit) break;

    peakHigh = Math.max(peakHigh, candle.high);
    troughLow = Math.min(troughLow, candle.low);

    if (candle.low <= activeStop) {
      const exit = stopFill(candle, activeStop);
      return {
        entry,
        entryTime: entryBar.timestamp,
        exit,
        exitTime: candle.timestamp,
        result: trailActivated ? 'TRAIL_STOP' : 'INITIAL_STOP',
        trailActivated,
        finalStop: activeStop,
        peakPremium: peakHigh,
        troughPremium: troughLow,
        mfePoints: peakHigh - entry,
        maePoints: entry - troughLow,
        pnlPerUnit: exit - entry,
        trailStepPoints,
        trailGapPoints,
        stopHistory,
      };
    }

    const proposedStop = steppedTrailStop({
      entry,
      peakHigh,
      initialStop: rules.initialStopPremium,
      trailGapPoints,
      trailStepPoints,
    });
    if (proposedStop > activeStop) {
      trailActivated = true;
      activeStop = proposedStop;
      stopHistory.push({
        effectiveFrom: candles[i + 1]?.timestamp ?? candle.timestamp,
        stop: activeStop,
        reason: 'stepped-trailing',
        sourceBar: candle.timestamp,
        sourcePeak: peakHigh,
        trailStepPoints,
        trailGapPoints,
      });
    }
  }

  const eligible = candles.filter((c) => timeOf(c.timestamp) <= rules.sessionExit && c.timestamp >= entryBar.timestamp);
  const last = eligible.at(-1);
  if (!last) return null;
  return {
    entry,
    entryTime: entryBar.timestamp,
    exit: last.close,
    exitTime: last.timestamp,
    result: 'SESSION_EXIT',
    trailActivated,
    finalStop: activeStop,
    peakPremium: peakHigh,
    troughPremium: troughLow,
    mfePoints: peakHigh - entry,
    maePoints: entry - troughLow,
    pnlPerUnit: last.close - entry,
    trailStepPoints,
    trailGapPoints,
    stopHistory,
  };
}
