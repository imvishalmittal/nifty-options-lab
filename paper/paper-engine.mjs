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
  Object.freeze({ id: 'V6', strategy: 'NIFTY ₹180 Fixed 2R V6', strategyVersion: 'V6', kind: 'fixed_target', targetMultiple: 2 }),
  Object.freeze({ id: 'V7', strategy: 'NIFTY ₹180 15-Minute Failure Exit V7', strategyVersion: 'V7', kind: 'v3_time', trailStep: 10, failureBars: 15, minFavorableMove: 10 }),
  Object.freeze({ id: 'V8', strategy: 'NIFTY ₹180 Capped-Risk Stepped Trail V8', strategyVersion: 'V8', kind: 'v3', trailStep: 10, initialRiskPoints: 20 }),
]);

export function timeOf(timestamp) { return String(timestamp).match(/T(\d{2}:\d{2})/)?.[1] ?? null; }
export function parseOption(symbol) {
  const match = String(symbol).match(/^NSE-NIFTY-(\d{2}[A-Za-z]{3}\d{2})-(\d+(?:\.\d+)?)-(CE|PE)$/);
  return match ? { symbol, expiryCode: match[1], strike: Number(match[2]), optionType: match[3] } : null;
}
export function nearestExpiry(expiries, date) { return [...expiries].filter((value) => value >= date).sort()[0] ?? null; }
function gcd(a, b) { let x = Math.abs(Math.round(a)); let y = Math.abs(Math.round(b)); while (y) [x, y] = [y, x % y]; return x; }
function inferredStrikeStep(parsed) {
  const strikes = [...new Set(parsed.map((row) => row.strike).filter(Number.isFinite))].sort((a, b) => a - b);
  const diffs = [];
  for (let i = 1; i < strikes.length; i += 1) { const diff = strikes[i] - strikes[i - 1]; if (diff > 0 && diff <= 500) diffs.push(diff); }
  const step = diffs.reduce((value, diff) => value ? gcd(value, diff) : diff, 0);
  return step >= 25 && step <= 100 ? step : 50;
}
function syntheticItm(expiryCode, spot, optionType, step, max) {
  const epsilon = 1e-9;
  const first = optionType === 'CE' ? Math.floor((spot - epsilon) / step) * step : Math.ceil((spot + epsilon) / step) * step;
  return Array.from({ length: max }, (_, index) => {
    const strike = optionType === 'CE' ? first - index * step : first + index * step;
    return { symbol: `NSE-NIFTY-${expiryCode}-${strike}-${optionType}`, expiryCode, strike, optionType };
  });
}
export function itmContracts(contracts, spot, optionType, max = 8) {
  const parsed = contracts.map(parseOption).filter(Boolean);
  const eligible = parsed.filter((contract) => contract.optionType === optionType && (optionType === 'CE' ? contract.strike < spot : contract.strike > spot))
    .sort((a, b) => optionType === 'CE' ? b.strike - a.strike : a.strike - b.strike);
  const step = inferredStrikeStep(parsed);
  const nearestGap = eligible.length ? Math.abs(eligible[0].strike - spot) : Infinity;
  if (eligible.length && nearestGap <= step * 2) return eligible.slice(0, max);
  const expiryCode = parsed[0]?.expiryCode;
  return expiryCode ? syntheticItm(expiryCode, spot, optionType, step, max) : eligible.slice(0, max);
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
  for (const current of candles) {
    const t = timeOf(current.timestamp);
    if (!t || t < rules.signalStart || t >= rules.signalCutoff) continue;
    if (current.close > rules.referencePremium) return current;
  }
  return null;
}
function selectionPremium(candles) {
  return candles.find((candle) => timeOf(candle.timestamp) === '09:25')?.open ?? null;
}
export function selectSide(callCandles, putCandles, rules = PAPER_RULES) {
  const candidates = [
    { side: 'CE', candles: callCandles, premium: selectionPremium(callCandles) },
    { side: 'PE', candles: putCandles, premium: selectionPremium(putCandles) },
  ].filter((row) => Number.isFinite(row.premium));
  if (!candidates.length) return null;
  const selected = [...candidates].sort((a, b) => {
    const distance = Math.abs(a.premium - rules.referencePremium) - Math.abs(b.premium - rules.referencePremium);
    if (distance !== 0) return distance;
    if (a.premium !== b.premium) return b.premium - a.premium;
    return a.side.localeCompare(b.side);
  })[0];
  const signal = firstSignal(selected.candles, rules);
  return signal ? { side: selected.side, signal } : null;
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
  const initialStop = Number((variant.initialRiskPoints ? Math.max(rules.initialStop, entry - variant.initialRiskPoints) : rules.initialStop).toFixed(2));
  const targetPremium = variant.kind === 'fixed_target' ? Number((entry + variant.targetMultiple * (entry - initialStop)).toFixed(2)) : null;
  return {
    variant, entry, entryTime, initialStop, activeStop: initialStop, targetPremium,
    peakHigh: entry, troughLow: entry, trailActivated: false,
    stopHistory: [{ effectiveFrom: entryTime, stop: initialStop, reason: 'initial' }],
    barsProcessed: 0, pendingTimeExitFrom: null, lastProcessed: null, exit: null,
  };
}
export function proposedStop(position, variant, rules = PAPER_RULES) {
  const floor = position.initialStop ?? rules.initialStop;
  if (variant.kind === 'v2') return position.peakHigh < rules.trailActivation ? floor : Math.max(floor, position.peakHigh - rules.trailGap);
  if (variant.kind === 'v3' || variant.kind === 'v3_time') {
    const steps = Math.floor((Math.max(0, position.peakHigh - position.entry) + 1e-9) / variant.trailStep);
    return steps < 1 ? floor : Math.max(floor, position.entry + steps * variant.trailStep - rules.trailGap);
  }
  if (variant.kind === 'fixed_target') return floor;
  throw new Error(`Unknown paper variant: ${variant?.kind}`);
}
export function processCompletedBar(position, candle, rules = PAPER_RULES) {
  if (position.exit || candle.timestamp === position.lastProcessed) return position;
  const next = { ...position, stopHistory: [...position.stopHistory], lastProcessed: candle.timestamp };
  if (next.pendingTimeExitFrom) {
    next.troughLow = Math.min(next.troughLow, candle.open);
    next.pendingTimeExitFrom = null;
    next.exit = { price: candle.open, time: candle.timestamp, result: 'TIME_FAILURE_EXIT' };
    return next;
  }
  if (candle.low <= next.activeStop) {
    const fill = candle.open <= next.activeStop ? candle.open : next.activeStop;
    next.troughLow = Math.min(next.troughLow, fill);
    next.exit = { price: fill, time: candle.timestamp, result: next.trailActivated ? 'TRAIL_STOP' : 'INITIAL_STOP' };
    return next;
  }
  if (next.variant.kind === 'fixed_target' && candle.high >= next.targetPremium) {
    next.peakHigh = Math.max(next.peakHigh, next.targetPremium);
    next.troughLow = Math.min(next.troughLow, candle.open);
    next.exit = { price: next.targetPremium, time: candle.timestamp, result: 'FIXED_TARGET' };
    return next;
  }
  next.peakHigh = Math.max(next.peakHigh, candle.high);
  next.troughLow = Math.min(next.troughLow, candle.low);
  next.barsProcessed += 1;
  const proposed = proposedStop(next, next.variant, rules);
  if (proposed > next.activeStop) {
    next.trailActivated = true;
    next.activeStop = proposed;
    next.stopHistory.push({ effectiveFrom: null, stop: proposed, reason: next.variant.kind === 'v2' ? 'continuous-trailing' : 'stepped-trailing', sourceBar: candle.timestamp, sourcePeak: next.peakHigh, trailStep: next.variant.trailStep ?? null });
  }
  if (next.variant.kind === 'v3_time' && next.barsProcessed >= next.variant.failureBars
      && next.peakHigh - next.entry < next.variant.minFavorableMove && candle.close <= next.entry) {
    next.pendingTimeExitFrom = candle.timestamp;
  }
  return next;
}
export function sessionExit(position, candle) { return position.exit ? position : { ...position, exit: { price: candle.close, time: candle.timestamp, result: 'SESSION_EXIT' } }; }
