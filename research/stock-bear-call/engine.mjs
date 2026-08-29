import { calculateOptionRoundTripCosts } from '../groww-option-costs.mjs';

export const BEAR_CALL_STRATEGY = 'williams-r-large-cap-bear-call';

export const BEAR_CALL_RULES = Object.freeze({
  barMinutes: 120,
  williamsPeriod: 140,
  overboughtThreshold: -20,
  emaFast: 5,
  emaMiddle: 15,
  emaSlow: 50,
  minimumShortDelta: 0.20,
  maximumShortDelta: 0.25,
  targetShortDelta: 0.225,
  hedgeStrikeSteps: 2,
  maximumEntryVix: 20,
  minimumEntryDte: 1,
});

export const VIDEO_STOCK_UNIVERSE = Object.freeze([
  'SBIN', 'RELIANCE', 'TCS', 'INFY', 'WIPRO',
  'CIPLA', 'DRREDDY', 'SUNPHARMA', 'BAJAJ-AUTO', 'ASIANPAINT',
]);

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function callPrice({ spot, strike, years, rate, volatility }) {
  if (!(years > 0) || !(volatility > 0)) return Math.max(0, spot - strike);
  const root = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + volatility ** 2 / 2) * years) / (volatility * root);
  const d2 = d1 - volatility * root;
  return spot * normalCdf(d1) - strike * Math.exp(-rate * years) * normalCdf(d2);
}

export function reconstructCallDelta({ premium, spot, strike, daysToExpiry, rate = 0.06 }) {
  if (![premium, spot, strike, daysToExpiry].every(Number.isFinite)
    || premium <= 0 || spot <= 0 || strike <= 0 || daysToExpiry <= 0) return null;
  const years = daysToExpiry / 365;
  const intrinsic = Math.max(0, spot - strike * Math.exp(-rate * years));
  if (premium < intrinsic - 0.01 || premium >= spot) return null;
  let low = 0.01;
  let high = 5;
  for (let index = 0; index < 80; index += 1) {
    const middle = (low + high) / 2;
    if (callPrice({ spot, strike, years, rate, volatility: middle }) < premium) low = middle;
    else high = middle;
  }
  const volatility = (low + high) / 2;
  const d1 = (Math.log(spot / strike) + (rate + volatility ** 2 / 2) * years)
    / (volatility * Math.sqrt(years));
  return { delta: normalCdf(d1), impliedVolatility: volatility, rate };
}

export function parseStockOptionContract(input) {
  const symbol = String(input?.symbol ?? input?.groww_symbol ?? input);
  const match = symbol.match(/^NSE-(.+)-(\d{2}[A-Za-z]{3}\d{2})-(\d+(?:\.\d+)?)-(CE|PE)$/);
  if (!match) return null;
  return {
    symbol,
    underlying: match[1],
    expiryCode: match[2],
    strike: Number(match[3]),
    optionType: match[4],
    lotSize: Number(input?.lot_size ?? input?.lotSize ?? input?.contract_lot_size ?? 0) || null,
    raw: input,
  };
}

function timeParts(timestamp) {
  const match = String(timestamp).match(/T(\d\d):(\d\d)/);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

function marketMinute(timestamp) {
  const time = timeParts(timestamp);
  return time ? (time.hour * 60 + time.minute) - (9 * 60 + 15) : null;
}

export function aggregateTwoHourBars(candles, barMinutes = 120) {
  const groups = new Map();
  for (const candle of [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const minute = marketMinute(candle.timestamp);
    if (minute == null || minute < 0 || minute >= 360) continue;
    const bucket = Math.floor(minute / barMinutes);
    if (bucket >= 3) continue; // Ignore the incomplete 15:15-15:30 fragment.
    const key = `${candle.timestamp.slice(0, 10)}:${bucket}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candle);
  }
  return [...groups.values()].filter((rows) => rows.length === barMinutes).map((rows) => ({
    timestamp: rows[0].timestamp,
    completedAt: rows.at(-1).timestamp,
    open: rows[0].open,
    high: Math.max(...rows.map((row) => row.high)),
    low: Math.min(...rows.map((row) => row.low)),
    close: rows.at(-1).close,
    minutes: rows.length,
  })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function ema(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period) return output;
  let value = values.slice(0, period).reduce((sum, row) => sum + row, 0) / period;
  output[period - 1] = value;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    value = values[index] * multiplier + value * (1 - multiplier);
    output[index] = value;
  }
  return output;
}

export function enrichBearCallIndicators(bars, rules = BEAR_CALL_RULES) {
  const closes = bars.map((bar) => bar.close);
  const ema5 = ema(closes, rules.emaFast);
  const ema15 = ema(closes, rules.emaMiddle);
  const ema50 = ema(closes, rules.emaSlow);
  return bars.map((bar, index) => {
    const window = bars.slice(Math.max(0, index - rules.williamsPeriod + 1), index + 1);
    let williamsR = null;
    if (window.length === rules.williamsPeriod) {
      const high = Math.max(...window.map((row) => row.high));
      const low = Math.min(...window.map((row) => row.low));
      williamsR = high === low ? -50 : -100 * ((high - bar.close) / (high - low));
    }
    return { ...bar, williamsR, ema5: ema5[index], ema15: ema15[index], ema50: ema50[index] };
  });
}

export function detectBearCallSignals(candles, rules = BEAR_CALL_RULES) {
  const bars = enrichBearCallIndicators(aggregateTwoHourBars(candles, rules.barMinutes), rules);
  const signals = [];
  for (let index = 1; index < bars.length; index += 1) {
    const previous = bars[index - 1];
    const current = bars[index];
    if (![previous.williamsR, current.williamsR, current.ema5, current.ema15, current.ema50].every(Number.isFinite)) continue;
    const crossedDown = previous.williamsR > rules.overboughtThreshold
      && current.williamsR <= rules.overboughtThreshold;
    const bearishAlignment = current.ema5 < current.ema15 && current.ema15 < current.ema50;
    if (crossedDown && bearishAlignment) signals.push({
      strategy: BEAR_CALL_STRATEGY,
      signalTimestamp: current.completedAt,
      evidence: current,
    });
  }
  return { bars, signals };
}

export function firstBearCallExitSignal(enrichedBars, afterTimestamp) {
  return enrichedBars.find((bar) => bar.completedAt > afterTimestamp
    && Number.isFinite(bar.ema5) && Number.isFinite(bar.ema50)
    && bar.ema5 > bar.ema50) ?? null;
}

export function selectDeltaBearCall(candidates, rules = BEAR_CALL_RULES) {
  const eligible = candidates.filter((candidate) => candidate.optionType === 'CE'
    && candidate.delta >= rules.minimumShortDelta
    && candidate.delta <= rules.maximumShortDelta
    && candidate.entryPremium > 0);
  const shortCall = eligible.sort((a, b) => {
    const deltaDifference = Math.abs(a.delta - rules.targetShortDelta) - Math.abs(b.delta - rules.targetShortDelta);
    return deltaDifference || a.strike - b.strike;
  })[0] ?? null;
  if (!shortCall) return null;
  const strikes = [...new Set(candidates.filter((row) => row.optionType === 'CE').map((row) => row.strike))].sort((a, b) => a - b);
  const shortIndex = strikes.indexOf(shortCall.strike);
  const longStrike = strikes[shortIndex + rules.hedgeStrikeSteps];
  const longCall = candidates.find((row) => row.optionType === 'CE' && row.strike === longStrike && row.entryPremium > 0) ?? null;
  return longCall ? { shortCall, longCall, width: longCall.strike - shortCall.strike } : null;
}

export function evaluateBearCallPosition({ selection, exitQuotes, lotSize, tradeDate, slippagePointsPerLeg = 0 }) {
  const entryCredit = selection.shortCall.entryPremium - selection.longCall.entryPremium;
  const exitDebit = exitQuotes.shortCall - exitQuotes.longCall;
  if (!(entryCredit > 0) || !(entryCredit < selection.width)) {
    return { status: 'NO_TRADE', reason: 'Spread credit outside executable defined-risk band', entryCredit };
  }
  const shortCosts = calculateOptionRoundTripCosts({
    entryPremium: selection.shortCall.entryPremium,
    exitPremium: exitQuotes.shortCall,
    lotSize,
    tradeDate,
    slippagePointsPerLeg,
    side: 'SHORT',
  });
  const longCosts = calculateOptionRoundTripCosts({
    entryPremium: selection.longCall.entryPremium,
    exitPremium: exitQuotes.longCall,
    lotSize,
    tradeDate,
    slippagePointsPerLeg,
    side: 'LONG',
  });
  return {
    status: 'TRADE',
    entryCredit,
    exitDebit,
    width: selection.width,
    maximumLossPoints: selection.width - entryCredit,
    grossPnlRupees: (entryCredit - exitDebit) * lotSize,
    netPnlRupees: shortCosts.netPnl + longCosts.netPnl,
    chargesRupees: shortCosts.charges.total + longCosts.charges.total,
    slippagePointsPerLeg,
    legs: { shortCall: shortCosts, longCall: longCosts },
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

export function summarizeBearCallResults(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const scenario = (name) => {
    const values = trades.map((row) => row.costs?.[name]?.netPnlRupees).filter(Number.isFinite);
    if (values.length !== trades.length) return null;
    const gains = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const losses = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
    return {
      totalNetPnlRupees: values.reduce((sum, value) => sum + value, 0),
      expectancyRupees: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      winRate: values.length ? values.filter((value) => value > 0).length / values.length : null,
      profitFactor: losses ? gains / losses : (gains ? Number.MAX_SAFE_INTEGER : null),
      maximumDrawdownRupees: maximumDrawdown(values),
    };
  };
  return {
    universeSize: new Set(results.map((row) => row.underlying).filter(Boolean)).size,
    signals: results.filter((row) => row.signal).length,
    trades: trades.length,
    dataMissing: results.filter((row) => row.status === 'DATA_MISSING').length,
    vixRejected: results.filter((row) => row.status === 'NO_TRADE' && row.reason === 'India VIX entry gate').length,
    winners: trades.filter((row) => row.costs?.normalized?.netPnlRupees > 0).length,
    normalized: scenario('normalized'),
    stress0_5: scenario('stress0_5'),
    stress1_0: scenario('stress1_0'),
  };
}
