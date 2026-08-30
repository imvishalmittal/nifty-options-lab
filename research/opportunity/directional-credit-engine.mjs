import { calculateOptionRoundTripCosts } from '../groww-option-costs.mjs';
import { parseNiftyOptionContract } from '../nifty-180-premium-strategy.mjs';
import { openingRange, timestampTime } from './opportunity-engine.mjs';

export const DIRECTIONAL_CREDIT_STRATEGY = 'intraday-directional-credit-spread';
export const DIRECTIONAL_CREDIT_RULES = Object.freeze({
  openingRangeStart: '09:15', openingRangeEnd: '09:45', entryTime: '10:00', forcedExit: '15:10',
  minimumAdx: 25, shortDistancePct: 0.005, wingWidthPoints: 200, minimumCreditPoints: 5,
  profitCaptureRatio: 0.5, stopDebitMultiple: 2,
});

const LEG_ORDER = Object.freeze(['shortOption', 'longOption']);

function ema(values, period) {
  const alpha = 2 / (period + 1); let value = null;
  return values.map((current) => { value = value == null ? current : alpha * current + (1 - alpha) * value; return value; });
}

export function enrichDirectionalIndicators(candles, period = 14) {
  const ema9 = ema(candles.map((row) => row.close), 9);
  const ema22 = ema(candles.map((row) => row.close), 22);
  const tr = Array(candles.length).fill(null), plusDm = Array(candles.length).fill(0), minusDm = Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i += 1) {
    const row = candles[i], previous = candles[i - 1];
    tr[i] = Math.max(row.high - row.low, Math.abs(row.high - previous.close), Math.abs(row.low - previous.close));
    const up = row.high - previous.high, down = previous.low - row.low;
    plusDm[i] = up > down && up > 0 ? up : 0; minusDm[i] = down > up && down > 0 ? down : 0;
  }
  const plusDi = Array(candles.length).fill(null), minusDi = Array(candles.length).fill(null), dx = Array(candles.length).fill(null);
  let smoothTr = 0, smoothPlus = 0, smoothMinus = 0;
  for (let i = 1; i < candles.length; i += 1) {
    if (i <= period) {
      smoothTr += tr[i] ?? 0; smoothPlus += plusDm[i]; smoothMinus += minusDm[i];
      if (i < period) continue;
    } else {
      smoothTr = smoothTr - smoothTr / period + (tr[i] ?? 0);
      smoothPlus = smoothPlus - smoothPlus / period + plusDm[i];
      smoothMinus = smoothMinus - smoothMinus / period + minusDm[i];
    }
    if (!(smoothTr > 0)) continue;
    plusDi[i] = 100 * smoothPlus / smoothTr; minusDi[i] = 100 * smoothMinus / smoothTr;
    const denominator = plusDi[i] + minusDi[i];
    dx[i] = denominator > 0 ? 100 * Math.abs(plusDi[i] - minusDi[i]) / denominator : 0;
  }
  const adx14 = Array(candles.length).fill(null); let sum = 0, count = 0, previousAdx = null;
  for (let i = period; i < candles.length; i += 1) {
    if (!Number.isFinite(dx[i])) continue;
    if (count < period) {
      sum += dx[i]; count += 1;
      if (count === period) { previousAdx = sum / period; adx14[i] = previousAdx; }
    } else { previousAdx = ((previousAdx * (period - 1)) + dx[i]) / period; adx14[i] = previousAdx; }
  }
  return candles.map((row, i) => ({ ...row, ema9: ema9[i], ema22: ema22[i], plusDi: plusDi[i], minusDi: minusDi[i], adx14: adx14[i] }));
}

export function detectDirectionalCreditRegime(candles, rules = DIRECTIONAL_CREDIT_RULES) {
  const observed = enrichDirectionalIndicators(candles).filter((row) => timestampTime(row.timestamp) < rules.entryTime);
  const decision = observed.at(-1), range = openingRange(observed, rules);
  if (!decision || !range || ![decision.adx14, decision.plusDi, decision.minusDi].every(Number.isFinite)) {
    return { status: 'DATA_MISSING', reason: 'Complete opening-range and DMI decision indicators unavailable' };
  }
  const evidence = { decisionTime: decision.timestamp, spot: decision.close, adx14: decision.adx14, plusDi: decision.plusDi, minusDi: decision.minusDi, ema9: decision.ema9, ema22: decision.ema22, openingRange: range };
  if (decision.adx14 < rules.minimumAdx) return { status: 'NO_SIGNAL', reason: 'ADX below directional floor', evidence };
  if (decision.close > range.high && decision.ema9 > decision.ema22 && decision.plusDi > decision.minusDi) return { status: 'SIGNAL', strategy: DIRECTIONAL_CREDIT_STRATEGY, direction: 'BULLISH', evidence };
  if (decision.close < range.low && decision.ema9 < decision.ema22 && decision.minusDi > decision.plusDi) return { status: 'SIGNAL', strategy: DIRECTIONAL_CREDIT_STRATEGY, direction: 'BEARISH', evidence };
  return { status: 'NO_SIGNAL', reason: 'Price, EMA, and DI direction are not jointly aligned', evidence };
}

function contractAt(parsed, type, strike) { return parsed.find((row) => row.optionType === type && row.strike === strike) ?? null; }

export function selectDirectionalCreditContracts(contracts, { spot, direction, rules = DIRECTIONAL_CREDIT_RULES }) {
  if (!(spot > 0) || !['BULLISH', 'BEARISH'].includes(direction)) return null;
  const parsed = contracts.map((item) => parseNiftyOptionContract(item.symbol ?? item.groww_symbol ?? item)).filter(Boolean);
  const optionType = direction === 'BULLISH' ? 'PE' : 'CE';
  const target = spot * (direction === 'BULLISH' ? 1 - rules.shortDistancePct : 1 + rules.shortDistancePct);
  const eligible = parsed.filter((row) => row.optionType === optionType && (direction === 'BULLISH' ? row.strike <= target : row.strike >= target));
  const shortOption = eligible.sort((a, b) => direction === 'BULLISH' ? b.strike - a.strike : a.strike - b.strike)[0] ?? null;
  if (!shortOption) return null;
  const longStrike = shortOption.strike + (direction === 'BULLISH' ? -rules.wingWidthPoints : rules.wingWidthPoints);
  const longOption = contractAt(parsed, optionType, longStrike);
  if (!longOption) return null;
  return { direction, optionType, target, shortOption: { ...shortOption, side: 'SHORT' }, longOption: { ...longOption, side: 'LONG' } };
}

function quotesAt(legCandles, timestamp, field) {
  const output = {};
  for (const name of LEG_ORDER) { const row = legCandles[name]?.find((item) => item.timestamp === timestamp); if (!row || !Number.isFinite(row[field])) return null; output[name] = row[field]; }
  return output;
}
export function netSpreadCredit(prices) { return prices.shortOption - prices.longOption; }

function completed({ entryQuotes, exitQuotes, entryTime, exitTime, result, rules, thresholdTime = null }) {
  const entryCredit = netSpreadCredit(entryQuotes), exitDebit = netSpreadCredit(exitQuotes);
  return { status: 'TRADE', entryTime, exitTime, thresholdTime, entryQuotes, exitQuotes, entryCredit, exitDebit, maximumLossPoints: rules.wingWidthPoints - entryCredit, pnlPerUnit: entryCredit - exitDebit, result };
}

export function evaluateDirectionalCreditPosition({ legCandles, entryTimestamp, rules = DIRECTIONAL_CREDIT_RULES }) {
  const entryQuotes = quotesAt(legCandles, entryTimestamp, 'open');
  if (!entryQuotes) return { status: 'DATA_MISSING', reason: 'Synchronized two-leg entry quotes unavailable' };
  const entryCredit = netSpreadCredit(entryQuotes);
  if (!(entryCredit >= rules.minimumCreditPoints) || !(entryCredit < rules.wingWidthPoints)) return { status: 'NO_TRADE', reason: 'Entry credit outside defined-risk executable band', entryCredit, entryQuotes };
  const timestamps = [...new Set(LEG_ORDER.flatMap((name) => legCandles[name].map((row) => row.timestamp)))].filter((timestamp) => timestamp >= entryTimestamp && timestampTime(timestamp) <= rules.forcedExit).sort();
  const targetDebit = entryCredit * (1 - rules.profitCaptureRatio), stopDebit = entryCredit * rules.stopDebitMultiple;
  for (const timestamp of timestamps) {
    if (timestampTime(timestamp) === rules.forcedExit) { const exitQuotes = quotesAt(legCandles, timestamp, 'open'); return exitQuotes ? completed({ entryQuotes, exitQuotes, entryTime: entryTimestamp, exitTime: timestamp, result: 'TIME', rules }) : { status: 'DATA_MISSING', reason: 'Synchronized forced-exit quotes unavailable' }; }
    const closeQuotes = quotesAt(legCandles, timestamp, 'close');
    if (!closeQuotes) return { status: 'DATA_MISSING', reason: `Two-leg mark unavailable at ${timestamp}` };
    const debit = netSpreadCredit(closeQuotes), result = debit <= targetDebit ? 'TARGET' : (debit >= stopDebit ? 'STOP' : null);
    if (!result) continue;
    const nextTimestamp = timestamps.find((candidate) => candidate > timestamp), exitQuotes = nextTimestamp ? quotesAt(legCandles, nextTimestamp, 'open') : null;
    if (!exitQuotes) return { status: 'DATA_MISSING', reason: 'Next synchronized fill unavailable after threshold' };
    return completed({ entryQuotes, exitQuotes, entryTime: entryTimestamp, exitTime: nextTimestamp, thresholdTime: timestamp, result, rules });
  }
  return { status: 'DATA_MISSING', reason: 'Forced-exit timestamp unavailable' };
}

export function attachDirectionalCreditCosts(position, { lotSize, tradeDate, slippagePointsPerLeg = 0 }) {
  if (position.status !== 'TRADE') return null;
  const legs = {
    shortOption: calculateOptionRoundTripCosts({ entryPremium: position.entryQuotes.shortOption, exitPremium: position.exitQuotes.shortOption, lotSize, tradeDate, slippagePointsPerLeg, side: 'SHORT' }),
    longOption: calculateOptionRoundTripCosts({ entryPremium: position.entryQuotes.longOption, exitPremium: position.exitQuotes.longOption, lotSize, tradeDate, slippagePointsPerLeg, side: 'LONG' }),
  };
  return { slippagePointsPerLeg, grossPnl: Object.values(legs).reduce((sum, row) => sum + row.grossPnl, 0), charges: Object.values(legs).reduce((sum, row) => sum + row.charges.total, 0), netPnl: Object.values(legs).reduce((sum, row) => sum + row.netPnl, 0), legs };
}

function maximumDrawdown(values) { let equity = 0, peak = 0, drawdown = 0; for (const value of values) { equity += value; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); } return drawdown; }
export function summarizeDirectionalCreditResults(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const scenario = (name) => { const values = trades.map((row) => row.costs?.[name]?.netPnl).filter(Number.isFinite); if (values.length !== trades.length) return null; const wins = values.filter((x) => x > 0), losses = values.filter((x) => x < 0), profit = wins.reduce((a, b) => a + b, 0), loss = Math.abs(losses.reduce((a, b) => a + b, 0)); return { totalNetPnlRupees: values.reduce((a, b) => a + b, 0), expectancyRupees: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, profitFactor: loss > 0 ? profit / loss : (profit > 0 ? Number.MAX_SAFE_INTEGER : null), maximumDrawdownRupees: maximumDrawdown(values) }; };
  return { observedSessions: results.length, signals: results.filter((row) => row.signal).length, trades: trades.length, noSignalSessions: results.filter((row) => row.status === 'NO_SIGNAL').length, noTradeSessions: results.filter((row) => row.status === 'NO_TRADE').length, excludedSessions: results.filter((row) => row.status === 'EXCLUDED_SESSION').length, dataMissingSessions: results.filter((row) => row.status === 'DATA_MISSING').length, targets: trades.filter((row) => row.result === 'TARGET').length, stops: trades.filter((row) => row.result === 'STOP').length, timeExits: trades.filter((row) => row.result === 'TIME').length, normalizedCosts: scenario('normalized'), stress0_5: scenario('stress0_5'), stress1_0: scenario('stress1_0') };
}
