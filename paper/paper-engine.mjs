export const PAPER_RULES = Object.freeze({
  referencePremium: 180,
  initialStop: 160,
  entryCeiling: 220,
  v2TrailActivation: 220,
  trailGap: 20,
  signalStart: '09:30',
  signalCutoff: '09:45',
  sessionExit: '15:29',
  capital: 60000,
  lotSize: 65,
});

export const PAPER_VARIANTS = Object.freeze([
  Object.freeze({ id: 'V2', strategy: 'NIFTY ₹180 Momentum V2', strategyVersion: 'V2', kind: 'v2' }),
  Object.freeze({ id: 'V3_5', strategy: 'NIFTY ₹180 Stepped Trail V3', strategyVersion: 'V3', kind: 'v3', trailStep: 5 }),
  Object.freeze({ id: 'V3_10', strategy: 'NIFTY ₹180 Stepped Trail V3', strategyVersion: 'V3', kind: 'v3', trailStep: 10 }),
]);

export function timeOf(timestamp) {
  const match = String(timestamp).match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

export function parseOption(symbol) {
  const match = String(symbol).match(/^NSE-NIFTY-(\d{2}[A-Za-z]{3}\d{2})-(\d+(?:\.\d+)?)-(CE|PE)$/);
  if (!match) return null;
  return { symbol, expiryCode: match[1], strike: Number(match[2]), optionType: match[3] };
}

export function nearestExpiry(expiries, date) {
  return [...expiries].filter((value) => value >= date).sort()[0] ?? null;
}

export function itmContracts(contracts, spot, optionType, max = 8) {
  return contracts.map(parseOption).filter(Boolean).filter((contract) => {
    if (contract.optionType !== optionType) return false;
    return optionType === 'CE' ? contract.strike < spot : contract.strike > spot;
  }).sort((a, b) => optionType === 'CE' ? b.strike - a.strike : a.strike - b.strike).slice(0, max);
}

export function chooseClosestPremium(rows, reference = PAPER_RULES.referencePremium) {
  const usable = rows.filter((row) => Number.isFinite(row.premium));
  if (!usable.length) return null;
  return [...usable].sort((a, b) => {
    const da = Math.abs(a.premium - reference);
    const db = Math.abs(b.premium - reference);
    if (da !== db) return da - db;
    return b.premium - a.premium;
  })[0];
}

export function firstSignal(candles, rules = PAPER_RULES) {
  for (let i = 1; i < candles.length; i++) {
    const previous = candles[i - 1];
    const current = candles[i];
    const t = timeOf(current.timestamp);
    if (!t || t < rules.signalStart || t >= rules.signalCutoff) continue;
    if (previous.close <= rules.referencePremium && current.close > rules.referencePremium) return current;
  }
  return null;
}

export function selectSide(callCandles, putCandles, rules = PAPER_RULES) {
  const callSignal = firstSignal(callCandles, rules);
  const putSignal = firstSignal(putCandles, rules);
  if (!callSignal && !putSignal) return null;
  if (callSignal && putSignal && callSignal.timestamp === putSignal.timestamp) return { ambiguous: true };
  return !putSignal || (callSignal && callSignal.timestamp < putSignal.timestamp)
    ? { side: 'CE', signal: callSignal }
    : { side: 'PE', signal: putSignal };
}

export function nextBarEntry(candles, signal, rules = PAPER_RULES) {
  const index = candles.findIndex((bar) => bar.timestamp === signal.timestamp);
  if (index < 0 || index + 1 >= candles.length) return null;
  const entryBar = candles[index + 1];
  if (timeOf(entryBar.timestamp) >= rules.signalCutoff) return null;
  const entry = entryBar.open;
  if (!(entry > rules.initialStop && entry < rules.entryCeiling)) return { rejected: true, entry, entryBar };
  return { entry, entryBar };
}

export function lotsAffordable(entryPremium, rules = PAPER_RULES) {
  if (!(entryPremium > 0)) return 0;
  return Math.floor(rules.capital / (entryPremium * rules.lotSize));
}

export function v2Stop(entry, peakHigh, rules = PAPER_RULES) {
  if (peakHigh < rules.v2TrailActivation) return rules.initialStop;
  return Math.max(rules.initialStop, peakHigh - rules.trailGap);
}

export function steppedStop(entry, peakHigh, trailStep, rules = PAPER_RULES) {
  if (!(trailStep > 0)) throw new Error('trailStep must be positive');
  const move = Math.max(0, peakHigh - entry);
  const steps = Math.floor((move + 1e-9) / trailStep);
  if (steps < 1) return rules.initialStop;
  return Math.max(rules.initialStop, entry + steps * trailStep - rules.trailGap);
}

export function proposedStop(position, variant, rules = PAPER_RULES) {
  if (variant.kind === 'v2') return v2Stop(position.entry, position.peakHigh, rules);
  if (variant.kind === 'v3') return steppedStop(position.entry, position.peakHigh, variant.trailStep, rules);
  throw new Error(`Unknown paper variant: ${variant?.kind}`);
}

export function initialPosition({ entry, entryTime, variant, rules = PAPER_RULES }) {
  if (!variant) throw new Error('paper variant is required');
  return {
    variant,
    entry,
    entryTime,
    activeStop: rules.initialStop,
    peakHigh: entry,
    troughLow: entry,
    trailActivated: false,
    stopHistory: [{ effectiveFrom: entryTime, stop: rules.initialStop, reason: 'initial' }],
    lastProcessed: null,
    exit: null,
  };
}

export function processCompletedBar(position, candle, rules = PAPER_RULES) {
  if (position.exit || candle.timestamp === position.lastProcessed) return position;
  const next = { ...position, stopHistory: [...position.stopHistory], lastProcessed: candle.timestamp };

  // Stop-first convention for one-minute OHLC. Only the stop already active
  // before this candle can execute inside it. If touched, the trade ends and
  // the candle's unknowable post-stop high/low is not credited.
  if (candle.low <= next.activeStop) {
    const fill = candle.open <= next.activeStop ? candle.open : next.activeStop;
    next.troughLow = Math.min(next.troughLow, fill);
    next.exit = {
      price: fill,
      time: candle.timestamp,
      result: next.trailActivated ? 'TRAIL_STOP' : 'INITIAL_STOP',
    };
    return next;
  }

  // A surviving completed candle contributes its full excursion. Any raised
  // V2 or V3 stop calculated from it becomes executable only on the next bar.
  next.peakHigh = Math.max(next.peakHigh, candle.high);
  next.troughLow = Math.min(next.troughLow, candle.low);
  const proposed = proposedStop(next, next.variant, rules);
  if (proposed > next.activeStop) {
    next.trailActivated = true;
    next.activeStop = proposed;
    next.stopHistory.push({
      effectiveFrom: null,
      stop: proposed,
      reason: next.variant.kind === 'v3' ? 'stepped-trailing' : 'continuous-trailing',
      sourceBar: candle.timestamp,
      sourcePeak: next.peakHigh,
      trailStep: next.variant.trailStep ?? null,
    });
  }
  return next;
}

export function sessionExit(position, candle) {
  if (position.exit) return position;
  return { ...position, exit: { price: candle.close, time: candle.timestamp, result: 'SESSION_EXIT' } };
}
