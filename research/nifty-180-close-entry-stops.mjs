export const CLOSE_ENTRY_RULES = Object.freeze({
  referencePremium: 180,
  signalStart: '09:30',
  signalCutoff: '09:45',
  sessionExit: '15:29',
  trailActivationPremium: 220,
  trailGapPoints: 20,
});

export const STOP_VARIANTS = Object.freeze([
  { key: 'IMMEDIATE_BE', kind: 'immediate-breakeven', activationPoints: 0 },
  { key: 'BE_5', kind: 'delayed-breakeven', activationPoints: 5 },
  { key: 'BE_10', kind: 'delayed-breakeven', activationPoints: 10 },
  { key: 'BE_20', kind: 'delayed-breakeven', activationPoints: 20 },
  { key: 'SIGNAL_LOW', kind: 'signal-low', activationPoints: null },
]);

export const EXIT_FAMILIES = Object.freeze([
  { key: 'V2', kind: 'continuous', stepPoints: null },
  { key: 'V3_10', kind: 'stepped', stepPoints: 10 },
]);

function timeOf(timestamp) {
  const match = String(timestamp).match(/T(\d{2}:\d{2})/);
  if (!match) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return match[1];
}

export function firstIntrabar180Signal(candles, rules = CLOSE_ENTRY_RULES) {
  return candles.find((candle) => {
    const time = timeOf(candle.timestamp);
    return time >= rules.signalStart && time < rules.signalCutoff && candle.high >= rules.referencePremium;
  }) ?? null;
}

function stopFill(candle, stop) {
  return candle.open <= stop ? candle.open : stop;
}

function trailingStop({ entry, peakHigh, initialStop, family, rules }) {
  if (family.kind === 'continuous') {
    if (peakHigh < rules.trailActivationPremium) return initialStop;
    return Math.max(initialStop, peakHigh - rules.trailGapPoints);
  }
  const favorableMove = Math.max(0, peakHigh - entry);
  const completedSteps = Math.floor((favorableMove + 1e-9) / family.stepPoints);
  if (completedSteps < 1) return initialStop;
  return Math.max(initialStop, entry + completedSteps * family.stepPoints - rules.trailGapPoints);
}

export function evaluateCloseEntryPosition(candles, signal, stopVariant, family, rules = CLOSE_ENTRY_RULES) {
  const signalIndex = candles.findIndex((candle) => candle.timestamp === signal?.timestamp);
  if (signalIndex < 0 || signalIndex + 1 >= candles.length) return null;
  const entry = signal.close;
  if (!(entry > 0)) return { rejected: true, reason: 'Signal close is not a positive executable premium' };

  const signalLow = signal.low;
  const entryTime = candles[signalIndex + 1].timestamp;
  let activeStop = stopVariant.kind === 'immediate-breakeven' ? entry : signalLow;
  let peakHigh = entry;
  let troughLow = entry;
  let breakevenActivated = stopVariant.kind === 'immediate-breakeven';
  let trailActivated = false;
  const stopHistory = [{ effectiveFrom: candles[signalIndex + 1].timestamp, stop: activeStop, reason: stopVariant.kind }];

  // Entry occurs at the completed signal candle's close. Its earlier high/low
  // cannot trigger a post-entry stop. Evaluation therefore starts next bar.
  for (let index = signalIndex + 1; index < candles.length; index += 1) {
    const candle = candles[index];
    if (timeOf(candle.timestamp) > rules.sessionExit) break;
    if (candle.low <= activeStop) {
      const exit = stopFill(candle, activeStop);
      const realizedTrough = Math.min(troughLow, exit);
      return {
        entry, entryTime, signalHigh: signal.high, signalLow,
        exit, exitTime: candle.timestamp,
        result: trailActivated ? 'TRAIL_STOP' : (breakevenActivated ? 'BREAKEVEN_STOP' : 'INITIAL_STOP'),
        activeStop, breakevenActivated, trailActivated, peakPremium: peakHigh,
        troughPremium: realizedTrough, mfePoints: peakHigh - entry,
        maePoints: entry - realizedTrough, pnlPerUnit: exit - entry, stopHistory,
      };
    }

    peakHigh = Math.max(peakHigh, candle.high);
    troughLow = Math.min(troughLow, candle.low);
    let proposedStop = activeStop;
    let reason = null;
    if (stopVariant.kind === 'delayed-breakeven' && !breakevenActivated
      && peakHigh >= entry + stopVariant.activationPoints) {
      proposedStop = Math.max(proposedStop, entry);
      breakevenActivated = true;
      reason = `breakeven-after-${stopVariant.activationPoints}`;
    }
    const familyStop = trailingStop({ entry, peakHigh, initialStop: proposedStop, family, rules });
    if (familyStop > proposedStop) {
      proposedStop = familyStop;
      trailActivated = true;
      reason = family.kind === 'continuous' ? 'V2-continuous-trail' : 'V3-10-stepped-trail';
    }
    if (proposedStop > activeStop) {
      activeStop = proposedStop;
      stopHistory.push({
        effectiveFrom: candles[index + 1]?.timestamp ?? candle.timestamp,
        stop: activeStop, reason, sourceBar: candle.timestamp, sourcePeak: peakHigh,
      });
    }
  }

  const eligible = candles.filter((candle) => candle.timestamp > signal.timestamp && timeOf(candle.timestamp) <= rules.sessionExit);
  const last = eligible.at(-1);
  if (!last) return null;
  return {
    entry, entryTime, signalHigh: signal.high, signalLow,
    exit: last.close, exitTime: last.timestamp, result: 'SESSION_EXIT', activeStop,
    breakevenActivated, trailActivated, peakPremium: peakHigh, troughPremium: troughLow,
    mfePoints: peakHigh - entry, maePoints: entry - troughLow,
    pnlPerUnit: last.close - entry, stopHistory,
  };
}

export function evaluateAllCloseEntryVariants(candles, rules = CLOSE_ENTRY_RULES) {
  const signal = firstIntrabar180Signal(candles, rules);
  if (!signal) return { status: 'NO_TRADE', reason: 'No candle high reached ₹180 during the entry window' };
  const positions = {};
  for (const stopVariant of STOP_VARIANTS) {
    for (const family of EXIT_FAMILIES) {
      const key = `${family.key}_${stopVariant.key}`;
      positions[key] = evaluateCloseEntryPosition(candles, signal, stopVariant, family, rules);
    }
  }
  return { status: 'SIGNAL', signal, positions };
}
