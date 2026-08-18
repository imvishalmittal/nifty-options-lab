export const PAPER_RULES = Object.freeze({
  referencePremium: 180,
  initialStop: 160,
  trailActivation: 220,
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

export function timeOf(timestamp) { return String(timestamp).match(/T(\d{2}:\d{2})/)?.[1] ?? null; }
export function parseOption(symbol) {
  const match = String(symbol).match(/^NSE-NIFTY-(\d{2}[A-Za-z]{3}\d{2})-(\d+(?:\.\d+)?)-(CE|PE)$/);
  return match ? { symbol, expiryCode: match[1], strike: Number(match[2]), optionType: match[3] } : null;
}
export function nearestExpiry(expiries, date) { return [...expiries].filter((value) => value >= date).sort()[0] ?? null; }
export function itmContracts(contracts, spot, optionType, max = 8) {
  return contracts.map(parseOption).filter(Boolean).filter((contract) => contract.optionType === optionType && (optionType === 'CE' ? contract.strike < spot : contract.strike > spot))
    .sort((a, b) => optionType === 'CE' ? b.strike - a.strike : a.strike - b.strike).slice(0, max);
}
export function chooseClosestPremium(rows, reference = PAPER_RULES.referencePremium) {
  const usable = rows.filter((row) => Number.isFinite(row.premium));
  if (!usable.length) return null;
  return [...usable].sort((a, b) => Math.abs(a.premium - reference) - Math.abs(b.premium - reference) || b.premium - a.premium)[0];
}
export function premiumBracket(rows, reference = PAPER_RULES.referencePremium) {
  const usable = rows.filter((row) => Number.isFinite(row.premium));
  const below = usable.filter((row) => row.premium <= reference);
  const above = usable.filter((row) => row.premium >= reference);
  return {
    bracketed: below.length > 0 && above.length > 0,
    below: below.length ? [...below].sort((a, b) => b.premium - a.premium)[0] : null,
    above: above.length ? [...above].sort((a, b) => a.premium - b.premium)[0] : null,
  };
}
export function firstSignal(candles, rules = PAPER_RULES) {
  for (let i = 1; i < candles.length; i++) {
    const previous = candles[i - 1], current = candles[i], t = timeOf(current.timestamp);
    if (!t || t < rules.signalStart || t >= rules.signalCutoff) continue;
    if (previous.close <= rules.referencePremium && current.close > rules.referencePremium) return current;
  }
  return null;
}
export function selectSide(callCandles, putCandles, rules = PAPER_RULES) {
  const callSignal = firstSignal(callCandles, rules), putSignal = firstSignal(putCandles, rules);
  if (!callSignal && !putSignal) return null;
  if (callSignal && putSignal && callSignal.timestamp === putSignal.timestamp) return { ambiguous: true };
  return !putSignal || (callSignal && callSignal.timestamp < putSignal.timestamp) ? { side: 'CE', signal: callSignal } : { side: 'PE', signal: putSignal };
}
export function nextBarEntry(candles, signal, rules = PAPER_RULES) {
  const index = candles.findIndex((bar) => bar.timestamp === signal.timestamp);
  if (index < 0 || index + 1 >= candles.length) return null;
  const entryBar = candles[index + 1];
  if (timeOf(entryBar.timestamp) >= rules.signalCutoff) return null;
  const entry = entryBar.open;
  if (!(entry > rules.initialStop && entry < rules.trailActivation)) return { rejected: true, entry, entryBar };
  return { entry, entryBar };
}
export function lotsAffordable(entryPremium, rules = PAPER_RULES) { return entryPremium > 0 ? Math.floor(rules.capital / (entryPremium * rules.lotSize)) : 0; }
export function initialPosition({ entry, entryTime, variant, rules = PAPER_RULES }) {
  if (!variant) throw new Error('paper variant is required');
  return { variant, entry, entryTime, activeStop: rules.initialStop, peakHigh: entry, troughLow: entry, trailActivated: false, stopHistory: [{ effectiveFrom: entryTime, stop: rules.initialStop, reason: 'initial' }], lastProcessed: null, exit: null };
}
export function proposedStop(position, variant, rules = PAPER_RULES) {
  if (variant.kind === 'v2') return position.peakHigh < rules.trailActivation ? rules.initialStop : Math.max(rules.initialStop, position.peakHigh - rules.trailGap);
  if (variant.kind === 'v3') {
    const steps = Math.floor((Math.max(0, position.peakHigh - position.entry) + 1e-9) / variant.trailStep);
    return steps < 1 ? rules.initialStop : Math.max(rules.initialStop, position.entry + steps * variant.trailStep - rules.trailGap);
  }
  throw new Error(`Unknown paper variant: ${variant?.kind}`);
}
export function processCompletedBar(position, candle, rules = PAPER_RULES) {
  if (position.exit || candle.timestamp === position.lastProcessed) return position;
  const next = { ...position, stopHistory: [...position.stopHistory], lastProcessed: candle.timestamp };
  if (candle.low <= next.activeStop) {
    const fill = candle.open <= next.activeStop ? candle.open : next.activeStop;
    next.troughLow = Math.min(next.troughLow, fill);
    next.exit = { price: fill, time: candle.timestamp, result: next.trailActivated ? 'TRAIL_STOP' : 'INITIAL_STOP' };
    return next;
  }
  next.peakHigh = Math.max(next.peakHigh, candle.high);
  next.troughLow = Math.min(next.troughLow, candle.low);
  const proposed = proposedStop(next, next.variant, rules);
  if (proposed > next.activeStop) {
    next.trailActivated = true;
    next.activeStop = proposed;
    next.stopHistory.push({ effectiveFrom: null, stop: proposed, reason: next.variant.kind === 'v3' ? 'stepped-trailing' : 'continuous-trailing', sourceBar: candle.timestamp, sourcePeak: next.peakHigh, trailStep: next.variant.trailStep ?? null });
  }
  return next;
}
export function sessionExit(position, candle) { return position.exit ? position : { ...position, exit: { price: candle.close, time: candle.timestamp, result: 'SESSION_EXIT' } }; }
