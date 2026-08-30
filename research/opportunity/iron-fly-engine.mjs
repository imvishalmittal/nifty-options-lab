import { calculateOptionRoundTripCosts } from '../groww-option-costs.mjs';
import { parseNiftyOptionContract } from '../nifty-180-premium-strategy.mjs';
import { enrichIndicators, openingRange, timestampTime } from './opportunity-engine.mjs';

export const IRON_FLY_STRATEGY = 'intraday-range-iron-fly';

export const IRON_FLY_RULES = Object.freeze({
  openingRangeStart: '09:15',
  openingRangeEnd: '10:00',
  entryTime: '10:00',
  forcedExit: '15:10',
  maximumAdx: 16,
  maximumOpeningRangePct: 0.0045,
  maximumEmaSpreadPct: 0.001,
  wingWidthPoints: 200,
  minimumCreditPoints: 60,
  profitCaptureRatio: 0.3,
  stopDebitMultiple: 1.4,
});

const LEG_ORDER = Object.freeze(['shortCall', 'longCall', 'shortPut', 'longPut']);

function rowsBefore(rows, time) {
  return rows.filter((row) => timestampTime(row.timestamp) < time);
}

function contractAt(parsed, optionType, strike) {
  return parsed.find((contract) => contract.optionType === optionType && contract.strike === strike) ?? null;
}

export function selectIronFlyContracts(contracts, { spot, range, rules = IRON_FLY_RULES }) {
  if (!(spot > 0) || !range) return null;
  const parsed = contracts.map((item) => parseNiftyOptionContract(item.symbol ?? item.groww_symbol ?? item)).filter(Boolean);
  const callStrikes = new Set(parsed.filter((row) => row.optionType === 'CE').map((row) => row.strike));
  const putStrikes = new Set(parsed.filter((row) => row.optionType === 'PE').map((row) => row.strike));
  const shortStrike = [...callStrikes].filter((strike) => putStrikes.has(strike))
    .sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot) || a - b)[0];
  const shortCall = contractAt(parsed, 'CE', shortStrike);
  const shortPut = contractAt(parsed, 'PE', shortStrike);
  if (!shortCall || !shortPut) return null;
  const longCall = contractAt(parsed, 'CE', shortCall.strike + rules.wingWidthPoints);
  const longPut = contractAt(parsed, 'PE', shortPut.strike - rules.wingWidthPoints);
  if (!longCall || !longPut) return null;
  return {
    shortCall: { ...shortCall, side: 'SHORT' },
    longCall: { ...longCall, side: 'LONG' },
    shortPut: { ...shortPut, side: 'SHORT' },
    longPut: { ...longPut, side: 'LONG' },
    targets: { shortStrike },
  };
}

export function detectIronFlyRegime(candles, rules = IRON_FLY_RULES) {
  const observed = rowsBefore(enrichIndicators(candles), rules.entryTime);
  const decision = observed.at(-1);
  const range = openingRange(observed, rules);
  if (!decision || !range || !Number.isFinite(decision.adx14)) {
    return { status: 'DATA_MISSING', reason: 'Complete opening range and decision indicators unavailable' };
  }
  const rangePct = range.width / decision.close;
  const emaSpreadPct = Math.abs(decision.ema9 - decision.ema22) / decision.close;
  const evidence = {
    decisionTime: decision.timestamp,
    spot: decision.close,
    adx14: decision.adx14,
    openingRange: range,
    openingRangePct: rangePct,
    emaSpreadPct,
  };
  if (decision.adx14 > rules.maximumAdx) return { status: 'NO_SIGNAL', reason: 'ADX above range-regime ceiling', evidence };
  if (rangePct > rules.maximumOpeningRangePct) return { status: 'NO_SIGNAL', reason: 'Opening range too wide', evidence };
  if (emaSpreadPct > rules.maximumEmaSpreadPct) return { status: 'NO_SIGNAL', reason: 'EMA separation indicates directional regime', evidence };
  if (decision.close < range.low || decision.close > range.high) return { status: 'NO_SIGNAL', reason: 'Decision spot outside observed opening range', evidence };
  return { status: 'SIGNAL', strategy: IRON_FLY_STRATEGY, evidence };
}

export function detectIronFlySetup(candles, contracts, rules = IRON_FLY_RULES) {
  const regime = detectIronFlyRegime(candles, rules);
  if (regime.status !== 'SIGNAL') return regime;
  const selection = selectIronFlyContracts(contracts, {
    spot: regime.evidence.spot,
    range: regime.evidence.openingRange,
    rules,
  });
  if (!selection) return { status: 'DATA_MISSING', reason: 'Required equal-width four-leg structure unavailable', evidence: regime.evidence };
  return { ...regime, selection };
}

function quoteMapAt(legCandles, timestamp, priceField) {
  const output = {};
  for (const name of LEG_ORDER) {
    const row = legCandles[name]?.find((item) => item.timestamp === timestamp);
    if (!row || !Number.isFinite(row[priceField])) return null;
    output[name] = row[priceField];
  }
  return output;
}

export function netIronFlyCredit(prices) {
  return prices.shortCall + prices.shortPut - prices.longCall - prices.longPut;
}

function exitFromQuotes({ entryQuotes, exitQuotes, entryTime, exitTime, result, rules, thresholdTime = null }) {
  const entryCredit = netIronFlyCredit(entryQuotes);
  const exitDebit = netIronFlyCredit(exitQuotes);
  return {
    status: 'TRADE',
    entryTime,
    exitTime,
    thresholdTime,
    entryQuotes,
    exitQuotes,
    entryCredit,
    exitDebit,
    maximumLossPoints: rules.wingWidthPoints - entryCredit,
    pnlPerUnit: entryCredit - exitDebit,
    result,
  };
}

export function evaluateIronFlyPosition({ legCandles, entryTimestamp, rules = IRON_FLY_RULES }) {
  const entryQuotes = quoteMapAt(legCandles, entryTimestamp, 'open');
  if (!entryQuotes) return { status: 'DATA_MISSING', reason: 'Synchronized four-leg entry quotes unavailable' };
  const entryCredit = netIronFlyCredit(entryQuotes);
  if (!(entryCredit >= rules.minimumCreditPoints) || !(entryCredit < rules.wingWidthPoints)) {
    return { status: 'NO_TRADE', reason: 'Entry credit outside defined-risk executable band', entryCredit, entryQuotes };
  }
  const timestamps = [...new Set(LEG_ORDER.flatMap((name) => legCandles[name].map((row) => row.timestamp)))]
    .filter((timestamp) => timestamp >= entryTimestamp && timestampTime(timestamp) <= rules.forcedExit)
    .sort();
  const profitDebit = entryCredit * (1 - rules.profitCaptureRatio);
  const stopDebit = entryCredit * rules.stopDebitMultiple;
  for (const timestamp of timestamps) {
    const time = timestampTime(timestamp);
    if (time === rules.forcedExit) {
      const exitQuotes = quoteMapAt(legCandles, timestamp, 'open');
      if (!exitQuotes) return { status: 'DATA_MISSING', reason: 'Synchronized four-leg forced-exit quotes unavailable' };
      return exitFromQuotes({ entryQuotes, exitQuotes, entryTime: entryTimestamp, exitTime: timestamp, result: 'TIME', rules });
    }
    const closeQuotes = quoteMapAt(legCandles, timestamp, 'close');
    if (!closeQuotes) return { status: 'DATA_MISSING', reason: `Four-leg mark unavailable at ${timestamp}` };
    const debit = netIronFlyCredit(closeQuotes);
    const result = debit <= profitDebit ? 'TARGET' : (debit >= stopDebit ? 'STOP' : null);
    if (!result) continue;
    const nextTimestamp = timestamps.find((candidate) => candidate > timestamp);
    if (!nextTimestamp) return { status: 'DATA_MISSING', reason: 'Next-bar exit unavailable after threshold' };
    const exitQuotes = quoteMapAt(legCandles, nextTimestamp, 'open');
    if (!exitQuotes) return { status: 'DATA_MISSING', reason: `Four-leg next-bar exit unavailable at ${nextTimestamp}` };
    return exitFromQuotes({
      entryQuotes,
      exitQuotes,
      entryTime: entryTimestamp,
      exitTime: nextTimestamp,
      thresholdTime: timestamp,
      result,
      rules,
    });
  }
  return { status: 'DATA_MISSING', reason: 'Forced-exit timestamp unavailable' };
}

export function attachIronFlyCosts(position, { lotSize, tradeDate, slippagePointsPerLeg = 0 }) {
  if (position.status !== 'TRADE') return null;
  const sides = { shortCall: 'SHORT', longCall: 'LONG', shortPut: 'SHORT', longPut: 'LONG' };
  const legs = Object.fromEntries(LEG_ORDER.map((name) => [name, calculateOptionRoundTripCosts({
    entryPremium: position.entryQuotes[name],
    exitPremium: position.exitQuotes[name],
    lotSize,
    tradeDate,
    slippagePointsPerLeg,
    side: sides[name],
  })]));
  return {
    slippagePointsPerLeg,
    grossPnl: Object.values(legs).reduce((sum, row) => sum + row.grossPnl, 0),
    charges: Object.values(legs).reduce((sum, row) => sum + row.charges.total, 0),
    netPnl: Object.values(legs).reduce((sum, row) => sum + row.netPnl, 0),
    legs,
  };
}

function maximumDrawdown(values) {
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

export function summarizeIronFlyResults(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const scenario = (name) => {
    const values = trades.map((row) => row.costs?.[name]?.netPnl).filter(Number.isFinite);
    if (values.length !== trades.length) return null;
    const wins = values.filter((value) => value > 0);
    const losses = values.filter((value) => value < 0);
    const profit = wins.reduce((sum, value) => sum + value, 0);
    const loss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
    return {
      totalNetPnlRupees: values.reduce((sum, value) => sum + value, 0),
      expectancyRupees: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      profitFactor: loss > 0 ? profit / loss : (profit > 0 ? Number.MAX_SAFE_INTEGER : null),
      maximumDrawdownRupees: maximumDrawdown(values),
    };
  };
  return {
    observedSessions: results.length,
    signals: results.filter((row) => row.signal).length,
    trades: trades.length,
    noSignalSessions: results.filter((row) => row.status === 'NO_SIGNAL').length,
    noTradeSessions: results.filter((row) => row.status === 'NO_TRADE').length,
    excludedSessions: results.filter((row) => row.status === 'EXCLUDED_SESSION').length,
    dataMissingSessions: results.filter((row) => row.status === 'DATA_MISSING').length,
    targets: trades.filter((row) => row.result === 'TARGET').length,
    stops: trades.filter((row) => row.result === 'STOP').length,
    timeExits: trades.filter((row) => row.result === 'TIME').length,
    normalizedCosts: scenario('normalized'),
    stress0_5: scenario('stress0_5'),
    stress1_0: scenario('stress1_0'),
  };
}
