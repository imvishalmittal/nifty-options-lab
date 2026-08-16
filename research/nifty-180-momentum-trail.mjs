export const MOMENTUM_RULES = Object.freeze({
  referencePremium: 180,
  initialStopPremium: 160,
  trailActivationPremium: 220,
  signalStart: '09:30',
  signalCutoff: '09:45',
  sessionExit: '15:29',
});

function timeOf(timestamp) {
  const m = String(timestamp).match(/T(\d{2}:\d{2})/);
  if (!m) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return m[1];
}

function firstConfirmation(candles, rules = MOMENTUM_RULES) {
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    const t = timeOf(current.timestamp);
    if (t < rules.signalStart || t >= rules.signalCutoff) continue;
    if (previous.close <= rules.referencePremium && current.close > rules.referencePremium) return current;
  }
  return null;
}

function findIndexByTimestamp(candles, timestamp) {
  return candles.findIndex((c) => c.timestamp === timestamp);
}

function stopFill(candle, stop) {
  return candle.open <= stop ? candle.open : stop;
}

export function evaluateMomentumPosition(candles, signal, {
  trailGapPoints = 20,
  rules = MOMENTUM_RULES,
} = {}) {
  if (!(trailGapPoints > 0)) throw new Error('trailGapPoints must be positive');
  const signalIndex = findIndexByTimestamp(candles, signal.timestamp);
  if (signalIndex < 0 || signalIndex + 1 >= candles.length) return null;

  const entryBar = candles[signalIndex + 1];
  if (timeOf(entryBar.timestamp) >= rules.signalCutoff) return null;
  const entry = entryBar.open;
  if (!(entry > rules.initialStopPremium && entry < rules.trailActivationPremium)) {
    return { rejected: true, reason: 'Executable entry is outside the fixed 160-220 band', entry, entryTime: entryBar.timestamp };
  }

  let activeStop = rules.initialStopPremium;
  let peakHigh = entry;
  let troughLow = entry;
  let trailActivated = false;
  let activationTime = null;
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
        activationTime,
        finalStop: activeStop,
        peakPremium: peakHigh,
        troughPremium: troughLow,
        mfePoints: peakHigh - entry,
        maePoints: entry - troughLow,
        pnlPerUnit: exit - entry,
        stopHistory,
      };
    }

    // Trail changes are based only on a fully completed one-minute bar and
    // become effective from the next bar. This prevents intrabar look-ahead.
    if (peakHigh >= rules.trailActivationPremium) {
      const proposedStop = Math.max(rules.initialStopPremium, peakHigh - trailGapPoints);
      if (!trailActivated) {
        trailActivated = true;
        activationTime = candle.timestamp;
      }
      if (proposedStop > activeStop) {
        activeStop = proposedStop;
        const nextBar = candles[i + 1];
        stopHistory.push({
          effectiveFrom: nextBar?.timestamp ?? candle.timestamp,
          stop: activeStop,
          reason: 'trailing',
          sourceBar: candle.timestamp,
          sourcePeak: peakHigh,
        });
      }
    }
  }

  const eligible = candles.filter((c) => timeOf(c.timestamp) <= rules.sessionExit && c.timestamp >= entryBar.timestamp);
  const last = eligible.at(-1);
  if (!last) return null;
  peakHigh = Math.max(peakHigh, last.high);
  troughLow = Math.min(troughLow, last.low);
  return {
    entry,
    entryTime: entryBar.timestamp,
    exit: last.close,
    exitTime: last.timestamp,
    result: 'SESSION_EXIT',
    trailActivated,
    activationTime,
    finalStop: activeStop,
    peakPremium: peakHigh,
    troughPremium: troughLow,
    mfePoints: peakHigh - entry,
    maePoints: entry - troughLow,
    pnlPerUnit: last.close - entry,
    stopHistory,
  };
}

export function evaluateMomentumDay({ call, put, callCandles, putCandles, trailGapPoints = 20, rules = MOMENTUM_RULES }) {
  const callSignal = firstConfirmation(callCandles, rules);
  const putSignal = firstConfirmation(putCandles, rules);
  if (!callSignal && !putSignal) return { status: 'NO_TRADE', reason: 'No post-09:30 crossing above 180 before entry cutoff' };
  if (callSignal && putSignal && callSignal.timestamp === putSignal.timestamp) {
    return { status: 'AMBIGUOUS', reason: 'CE and PE confirmed above 180 in the same minute' };
  }

  const side = !putSignal || (callSignal && callSignal.timestamp < putSignal.timestamp) ? 'CE' : 'PE';
  const signal = side === 'CE' ? callSignal : putSignal;
  const candles = side === 'CE' ? callCandles : putCandles;
  const contract = side === 'CE' ? call : put;
  const position = evaluateMomentumPosition(candles, signal, { trailGapPoints, rules });
  if (!position) return { status: 'NO_TRADE', side, contract, signalTime: signal.timestamp, signalClose: signal.close, reason: 'No executable holding interval' };
  if (position.rejected) return { status: 'NO_TRADE', side, contract, signalTime: signal.timestamp, signalClose: signal.close, ...position };
  return { status: 'TRADE', side, contract, signalTime: signal.timestamp, signalClose: signal.close, trailGapPoints, ...position };
}

export function lotsAffordable({ capital, entryPremium, lotSize }) {
  if (!(capital > 0) || !(entryPremium > 0) || !(lotSize > 0)) return 0;
  return Math.floor(capital / (entryPremium * lotSize));
}
