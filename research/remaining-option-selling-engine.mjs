export const REMAINING_OPTION_SELLING_RULES = Object.freeze({
  breakout: Object.freeze({ rangeEnd: '09:44', lastEntry: '14:45', exit: '15:15', hedgeWidth: 300 }),
  monthly: Object.freeze({ dailyRsiMax: 50, weeklyRsiMax: 50, shortCallDelta: 0.10, shortPutDelta: -0.12, longCallDelta: 0.05, longPutDelta: -0.06, gapLimit: 0.12 }),
  smart: Object.freeze({ shortCallDelta: 0.08, shortPutDelta: -0.08, longCallDelta: 0.03, longPutDelta: -0.03 }),
  lifecycle: Object.freeze({ targetDebitRatio: 0.5, stopDebitRatio: 2 }),
});

export function wilderRsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    gain += Math.max(0, change);
    loss += Math.max(0, -change);
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    averageGain = ((averageGain * (period - 1)) + Math.max(0, change)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(0, -change)) / period;
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - (100 / (1 + (averageGain / averageLoss)));
}

function timeOf(timestamp) { return timestamp.slice(11, 16); }

export function findOpeningRangeBreak(oneMinuteBars, fiveMinuteBars, rules = REMAINING_OPTION_SELLING_RULES.breakout) {
  const rangeBars = oneMinuteBars.filter((bar) => timeOf(bar.timestamp) >= '09:15' && timeOf(bar.timestamp) <= rules.rangeEnd);
  if (rangeBars.length !== 30) return { status: 'DATA_MISSING', reason: 'Opening range must contain exactly 30 one-minute bars' };
  const high = Math.max(...rangeBars.map((bar) => bar.high));
  const low = Math.min(...rangeBars.map((bar) => bar.low));
  const confirmation = fiveMinuteBars
    .filter((bar) => timeOf(bar.timestamp) >= '09:45' && timeOf(bar.timestamp) <= rules.lastEntry)
    .find((bar) => bar.close > high || bar.close < low);
  if (!confirmation) return { status: 'NO_TRADE', high, low };
  return { status: 'SIGNAL', direction: confirmation.close > high ? 'UP' : 'DOWN', high, low, confirmationTimestamp: confirmation.timestamp };
}

function eligibleDeltaContract(contracts, optionType, target, predicate = () => true) {
  return contracts
    .filter((contract) => contract.optionType === optionType && Number.isFinite(contract.delta) && predicate(contract))
    .sort((left, right) => Math.abs(left.delta - target) - Math.abs(right.delta - target) || left.strike - right.strike)[0] ?? null;
}

export function selectIronCondorByDelta(contracts, targets) {
  const shortCall = eligibleDeltaContract(contracts, 'CE', targets.shortCallDelta);
  const shortPut = eligibleDeltaContract(contracts, 'PE', targets.shortPutDelta);
  if (!shortCall || !shortPut) return null;
  const longCall = eligibleDeltaContract(contracts, 'CE', targets.longCallDelta, (row) => row.strike > shortCall.strike);
  const longPut = eligibleDeltaContract(contracts, 'PE', targets.longPutDelta, (row) => row.strike < shortPut.strike);
  if (!longCall || !longPut) return null;
  return { shortCall, shortPut, longCall, longPut };
}

export function selectAtmCreditSpread(contracts, spot, direction, hedgeWidth = 300) {
  const optionType = direction === 'UP' ? 'PE' : direction === 'DOWN' ? 'CE' : null;
  if (!optionType) throw new Error('direction must be UP or DOWN');
  const available = contracts.filter((row) => row.optionType === optionType);
  const short = available.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot) || a.strike - b.strike)[0];
  if (!short) return null;
  const hedgeStrike = short.strike + (direction === 'UP' ? -hedgeWidth : hedgeWidth);
  const long = available.find((row) => row.strike === hedgeStrike);
  return long ? { short, long } : null;
}

export function packageDebit(prices, legs) {
  return legs.reduce((sum, leg) => sum + (leg.side === 'SHORT' ? prices[leg.name] : -prices[leg.name]) * leg.lots, 0) * -1;
}

export function evaluateCreditLifecycle({ entryCredit, observations, targetDebitRatio = 0.5, stopDebitRatio = 2 }) {
  if (!(entryCredit > 0)) return { status: 'NO_TRADE', reason: 'Entry package is not a credit' };
  const target = entryCredit * targetDebitRatio;
  const stop = entryCredit * stopDebitRatio;
  for (let index = 0; index < observations.length; index += 1) {
    const row = observations[index];
    if (row.isFinal) return { status: 'EXIT', reason: 'TIME', timestamp: row.timestamp, debit: row.openDebit };
    if (row.isSessionOpen && row.openDebit >= stop) return { status: 'EXIT', reason: 'STOP', timestamp: row.timestamp, debit: row.openDebit };
    if (row.isSessionOpen && row.openDebit <= target) return { status: 'EXIT', reason: 'TARGET', timestamp: row.timestamp, debit: row.openDebit };
    const stopTouched = row.highDebit >= stop;
    const targetTouched = row.lowDebit <= target;
    if (!stopTouched && !targetTouched) continue;
    const next = observations[index + 1];
    if (!next) return { status: 'DATA_MISSING', reason: 'Next synchronized fill unavailable after threshold' };
    return {
      status: 'EXIT',
      reason: stopTouched ? 'STOP' : 'TARGET',
      timestamp: next.timestamp,
      thresholdTimestamp: row.timestamp,
      debit: next.openDebit,
      ambiguous: stopTouched && targetTouched,
    };
  }
  return { status: 'DATA_MISSING', reason: 'No valid terminal observation' };
}

export function maximumDrawdown(values) {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return drawdown;
}

export function summarizeScenario(values) {
  const wins = values.filter((value) => value > 0);
  const losses = values.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  return {
    samples: values.length,
    winRate: values.length ? wins.length / values.length : null,
    netPnl: values.reduce((sum, value) => sum + value, 0),
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Number.MAX_SAFE_INTEGER : null,
    maximumDrawdown: maximumDrawdown(values),
  };
}
