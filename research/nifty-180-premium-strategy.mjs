export const PREMIUM_RULES = Object.freeze({
  referencePremium: 180,
  stopPremium: 160,
  targetPremium: 220,
  signalStart: '09:30',
  forcedExit: '09:45',
});

export function parseNiftyOptionContract(symbol) {
  const m = String(symbol).match(/^NSE-NIFTY-(\d{2}[A-Za-z]{3}\d{2})-(\d+(?:\.\d+)?)-(CE|PE)$/);
  if (!m) return null;
  return { symbol, expiryCode: m[1], strike: Number(m[2]), optionType: m[3] };
}

export function nearestExpiry(expiries, sessionDate) {
  const eligible = [...expiries].filter((d) => d >= sessionDate).sort();
  return eligible[0] ?? null;
}

export function itmContracts(contracts, spot, optionType) {
  return contracts.map(parseNiftyOptionContract).filter(Boolean).filter((c) => {
    if (c.optionType !== optionType) return false;
    return optionType === 'CE' ? c.strike < spot : c.strike > spot;
  }).sort((a, b) => optionType === 'CE' ? b.strike - a.strike : a.strike - b.strike);
}

export function chooseClosestPremium(candidates, premiumBySymbol, referencePremium = PREMIUM_RULES.referencePremium) {
  const available = candidates.map((c) => ({ ...c, premium: premiumBySymbol[c.symbol] }))
    .filter((c) => Number.isFinite(c.premium));
  if (!available.length) return null;
  return available.sort((a, b) => {
    const da = Math.abs(a.premium - referencePremium);
    const db = Math.abs(b.premium - referencePremium);
    if (da !== db) return da - db;
    return b.premium - a.premium;
  })[0];
}

function timeOf(timestamp) {
  const m = String(timestamp).match(/T(\d{2}:\d{2})/);
  if (!m) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return m[1];
}

// Research-only signal definition for the first-close study. Once the
// contract has been selected by closest 09:25 premium, a prior <=180 close is
// NOT required. The first completed 1-minute candle in the signal window that
// closes above 180 is the confirmation candle.
function firstConfirmation(candles, start = PREMIUM_RULES.signalStart, level = PREMIUM_RULES.referencePremium, forcedExit = PREMIUM_RULES.forcedExit) {
  for (const c of candles) {
    const t = timeOf(c.timestamp);
    if (t < start || t >= forcedExit) continue;
    if (c.close > level) return c;
  }
  return null;
}

function findIndexByTimestamp(candles, timestamp) {
  return candles.findIndex((c) => c.timestamp === timestamp);
}

function evaluatePosition(candles, signal, rules = PREMIUM_RULES) {
  const signalIndex = findIndexByTimestamp(candles, signal.timestamp);
  if (signalIndex < 0 || signalIndex + 1 >= candles.length) return null;

  if (signal.close >= rules.targetPremium) {
    return {
      rejected: true,
      reason: 'Confirmation completed at or above the fixed target',
      signalClose: signal.close,
    };
  }

  // A candle timestamp marks the START of that one-minute interval. A 09:44
  // signal is known only at 09:45 and therefore leaves no holding interval
  // before the mandatory 09:45 exit. Reject any next-bar entry at/after 09:45.
  const entryBar = candles[signalIndex + 1];
  if (timeOf(entryBar.timestamp) >= rules.forcedExit) return null;
  const entry = entryBar.open;

  if (!(entry > rules.stopPremium && entry < rules.targetPremium)) {
    return {
      rejected: true,
      reason: 'Executable entry is outside the fixed stop/target band',
      entry,
      entryTime: entryBar.timestamp,
    };
  }

  // Process only bars that begin before the forced-exit clock. If a 09:45 bar
  // exists, its OPEN is the executable 09:45 time exit; its high/low/close are
  // after the deadline and must not influence the outcome.
  for (let i = signalIndex + 1; i < candles.length; i++) {
    const c = candles[i];
    const t = timeOf(c.timestamp);
    if (t >= rules.forcedExit) break;
    const stopHit = c.low <= rules.stopPremium;
    const targetHit = c.high >= rules.targetPremium;
    if (stopHit && targetHit) return { entry, entryTime: entryBar.timestamp, exit: rules.stopPremium, exitTime: c.timestamp, result: 'STOP', ambiguousBar: true };
    if (stopHit) return { entry, entryTime: entryBar.timestamp, exit: rules.stopPremium, exitTime: c.timestamp, result: 'STOP', ambiguousBar: false };
    if (targetHit) return { entry, entryTime: entryBar.timestamp, exit: rules.targetPremium, exitTime: c.timestamp, result: 'TARGET', ambiguousBar: false };
  }

  const forcedBar = candles.find((c) => timeOf(c.timestamp) === rules.forcedExit);
  if (forcedBar) {
    return { entry, entryTime: entryBar.timestamp, exit: forcedBar.open, exitTime: forcedBar.timestamp, result: 'TIME', ambiguousBar: false };
  }

  const eligible = candles.filter((c) => timeOf(c.timestamp) < rules.forcedExit);
  const last = eligible.at(-1);
  return last ? { entry, entryTime: entryBar.timestamp, exit: last.close, exitTime: last.timestamp, result: 'TIME', ambiguousBar: false } : null;
}

export function evaluatePremiumDay({ call, put, callCandles, putCandles, rules = PREMIUM_RULES }) {
  const callSignal = firstConfirmation(callCandles, rules.signalStart, rules.referencePremium, rules.forcedExit);
  const putSignal = firstConfirmation(putCandles, rules.signalStart, rules.referencePremium, rules.forcedExit);
  if (!callSignal && !putSignal) return { status: 'NO_TRADE', reason: 'No completed 1-minute close above reference premium in signal window' };
  if (callSignal && putSignal && callSignal.timestamp === putSignal.timestamp) {
    return { status: 'AMBIGUOUS', reason: 'CE and PE first closed above reference premium in the same minute' };
  }

  const side = !putSignal || (callSignal && callSignal.timestamp < putSignal.timestamp) ? 'CE' : 'PE';
  const signal = side === 'CE' ? callSignal : putSignal;
  const candles = side === 'CE' ? callCandles : putCandles;
  const contract = side === 'CE' ? call : put;
  const position = evaluatePosition(candles, signal, rules);
  if (!position) return { status: 'NO_TRADE', side, contract, signalTime: signal.timestamp, signalClose: signal.close, reason: 'No executable holding interval after confirmation' };
  if (position.rejected) {
    return {
      status: 'NO_TRADE',
      side,
      contract,
      signalTime: signal.timestamp,
      signalClose: signal.close,
      ...position,
    };
  }

  return {
    status: 'TRADE', side, contract,
    signalTime: signal.timestamp,
    signalClose: signal.close,
    ...position,
    pnlPerUnit: position.exit - position.entry,
  };
}
