export const SINGLE_CLOSEST_RULES = Object.freeze({
  referencePremium: 180,
  initialStopPremium: 160,
  entryCeilingPremium: 220,
  signalStart: '09:30',
  signalCutoff: '09:45',
});

function timeOf(timestamp) {
  const m = String(timestamp).match(/T(\d{2}:\d{2})/);
  if (!m) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return m[1];
}

export function chooseSingleClosest(callSelection, putSelection, referencePremium = SINGLE_CLOSEST_RULES.referencePremium) {
  const available = [callSelection, putSelection].filter((row) => Number.isFinite(row?.premium));
  if (!available.length) return null;
  return available.sort((a, b) => {
    const da = Math.abs(a.premium - referencePremium);
    const db = Math.abs(b.premium - referencePremium);
    if (da !== db) return da - db;
    if (a.premium !== b.premium) return b.premium - a.premium;
    return String(a.optionType).localeCompare(String(b.optionType));
  })[0];
}

export function firstCompletedCloseAbove(candles, rules = SINGLE_CLOSEST_RULES) {
  for (const candle of candles) {
    const t = timeOf(candle.timestamp);
    if (t < rules.signalStart || t >= rules.signalCutoff) continue;
    if (candle.close > rules.referencePremium) return candle;
  }
  return null;
}

export function nextExecutableBar(candles, signal, rules = SINGLE_CLOSEST_RULES) {
  const index = candles.findIndex((candle) => candle.timestamp === signal?.timestamp);
  if (index < 0 || index + 1 >= candles.length) return null;
  const entryBar = candles[index + 1];
  if (timeOf(entryBar.timestamp) >= rules.signalCutoff) return null;
  return entryBar;
}

export function classifySingleClosestSignal(candles, rules = SINGLE_CLOSEST_RULES) {
  const signal = firstCompletedCloseAbove(candles, rules);
  if (!signal) {
    return { status: 'NO_TRADE', reason: 'No completed 1-minute close above ₹180 in the signal window' };
  }
  const entryBar = nextExecutableBar(candles, signal, rules);
  if (!entryBar) {
    return {
      status: 'NO_TRADE',
      reason: 'No executable next-bar entry before 09:45 cutoff',
      signalTime: signal.timestamp,
      signalClose: signal.close,
    };
  }
  const entry = entryBar.open;
  if (!(entry > rules.initialStopPremium && entry < rules.entryCeilingPremium)) {
    return {
      status: 'NO_TRADE',
      reason: 'Executable entry is outside the fixed 160-220 band',
      signalTime: signal.timestamp,
      signalClose: signal.close,
      entryTime: entryBar.timestamp,
      entry,
    };
  }
  return {
    status: 'SIGNAL',
    signal,
    signalTime: signal.timestamp,
    signalClose: signal.close,
    entryBar,
    entryTime: entryBar.timestamp,
    entry,
  };
}
