export const STRATEGIES = Object.freeze([
  'late-breakout-retest',
  'vwap-trend-pullback',
  'failed-opening-range-break',
  'afternoon-compression-breakout',
]);

export const DOCUMENTED_IRREGULAR_SESSIONS = Object.freeze({
  '2020-11-14': 'Muhurat trading session',
  '2021-02-24': 'NSE technical outage and extended session',
  '2021-11-04': 'Muhurat trading session',
  '2022-10-24': 'Muhurat trading session',
  '2023-11-12': 'Muhurat trading session',
  '2024-01-20': 'NSE special live trading session',
  '2024-03-02': 'NSE special live trading session',
  '2024-05-18': 'NSE special live trading session',
  '2024-11-01': 'Muhurat trading session',
});

export function expiryYearsForSessionDates(dates) {
  const years = new Set();
  for (const date of dates) {
    const year = Number(String(date).slice(0, 4));
    if (Number.isInteger(year)) {
      years.add(year);
      years.add(year + 1);
    }
  }
  return [...years].sort((a, b) => a - b);
}

export function classifyShortSession(date, candleCount, minimumCandles = 300) {
  if (candleCount >= minimumCandles) return null;
  const documentedReason = DOCUMENTED_IRREGULAR_SESSIONS[date];
  if (documentedReason) {
    return {
      status: 'EXCLUDED_SESSION',
      reason: `${documentedReason}; ${candleCount} underlying one-minute candles`,
    };
  }
  return { status: 'DATA_MISSING', reason: `Only ${candleCount} underlying one-minute candles` };
}

export const DEFAULT_RULES = Object.freeze({
  openingRangeStart: '09:15',
  openingRangeEnd: '09:45',
  forcedExit: '15:20',
  referencePremium: 180,
  maxCandidates: 24,
  entryPremiumMin: 80,
  entryPremiumMax: 300,
  stopPoints: 20,
  targetPoints: 40,
  breakoutBufferPoints: 2,
  retestTolerancePoints: 3,
  vwapTolerancePoints: 4,
  minimumAdx: 20,
  maximumReversalAdx: 25,
  maximumCompressionRatio: 0.65,
});

function timeOf(timestamp) {
  const match = String(timestamp).match(/T(\d{2}:\d{2})/);
  if (!match) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return match[1];
}

function ema(values, period) {
  const alpha = 2 / (period + 1);
  const output = [];
  let value = null;
  for (const current of values) {
    value = value == null ? current : alpha * current + (1 - alpha) * value;
    output.push(value);
  }
  return output;
}

function adx(candles, period = 14) {
  const tr = Array(candles.length).fill(null);
  const plusDm = Array(candles.length).fill(0);
  const minusDm = Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    tr[i] = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );
    const up = current.high - previous.high;
    const down = previous.low - current.low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }

  const dx = Array(candles.length).fill(null);
  let smoothedTr = 0;
  let smoothedPlus = 0;
  let smoothedMinus = 0;
  for (let i = 1; i < candles.length; i += 1) {
    if (i <= period) {
      smoothedTr += tr[i] ?? 0;
      smoothedPlus += plusDm[i];
      smoothedMinus += minusDm[i];
      if (i < period) continue;
    } else {
      smoothedTr = smoothedTr - smoothedTr / period + (tr[i] ?? 0);
      smoothedPlus = smoothedPlus - smoothedPlus / period + plusDm[i];
      smoothedMinus = smoothedMinus - smoothedMinus / period + minusDm[i];
    }
    if (!(smoothedTr > 0)) continue;
    const plusDi = 100 * smoothedPlus / smoothedTr;
    const minusDi = 100 * smoothedMinus / smoothedTr;
    const denominator = plusDi + minusDi;
    dx[i] = denominator > 0 ? 100 * Math.abs(plusDi - minusDi) / denominator : 0;
  }

  const output = Array(candles.length).fill(null);
  let sum = 0;
  let count = 0;
  let previousAdx = null;
  for (let i = period; i < candles.length; i += 1) {
    if (!Number.isFinite(dx[i])) continue;
    if (count < period) {
      sum += dx[i];
      count += 1;
      if (count === period) {
        previousAdx = sum / period;
        output[i] = previousAdx;
      }
    } else {
      previousAdx = ((previousAdx * (period - 1)) + dx[i]) / period;
      output[i] = previousAdx;
    }
  }
  return output;
}

export function enrichIndicators(candles) {
  const close = candles.map((row) => row.close);
  const ema9 = ema(close, 9);
  const ema22 = ema(close, 22);
  const adx14 = adx(candles, 14);
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  let fallbackPriceSum = 0;
  let fallbackCount = 0;
  return candles.map((row, index) => {
    const typical = (row.high + row.low + row.close) / 3;
    const volume = Number(row.volume);
    fallbackPriceSum += typical;
    fallbackCount += 1;
    if (volume > 0) {
      cumulativePriceVolume += typical * volume;
      cumulativeVolume += volume;
    }
    const hasVolume = cumulativeVolume > 0;
    return {
      ...row,
      ema9: ema9[index],
      ema22: ema22[index],
      adx14: adx14[index],
      vwap: hasVolume ? cumulativePriceVolume / cumulativeVolume : fallbackPriceSum / fallbackCount,
      vwapMode: hasVolume ? 'volume' : 'typical-price-fallback',
    };
  });
}

export function openingRange(candles, rules = DEFAULT_RULES) {
  const rows = candles.filter((row) => {
    const time = timeOf(row.timestamp);
    return time >= rules.openingRangeStart && time < rules.openingRangeEnd;
  });
  if (!rows.length) return null;
  return {
    high: Math.max(...rows.map((row) => row.high)),
    low: Math.min(...rows.map((row) => row.low)),
    width: Math.max(...rows.map((row) => row.high)) - Math.min(...rows.map((row) => row.low)),
  };
}

function signal(strategy, direction, row, index, evidence) {
  return {
    strategy,
    direction,
    optionType: direction === 'LONG' ? 'CE' : 'PE',
    signalIndex: index,
    signalTime: row.timestamp,
    signalClose: row.close,
    evidence,
  };
}

function detectLateBreakoutRetest(rows, range, rules) {
  let breakout = null;
  for (let i = 1; i < rows.length - 1; i += 1) {
    const row = rows[i];
    const previous = rows[i - 1];
    const time = timeOf(row.timestamp);
    if (time < '09:45' || time > '11:30') continue;
    const adxRising = Number.isFinite(row.adx14) && Number.isFinite(previous.adx14) && row.adx14 >= rules.minimumAdx && row.adx14 >= previous.adx14;
    if (!breakout && adxRising && row.close > range.high + rules.breakoutBufferPoints && row.ema9 > row.ema22) {
      breakout = { direction: 'LONG', index: i, level: range.high };
      continue;
    }
    if (!breakout && adxRising && row.close < range.low - rules.breakoutBufferPoints && row.ema9 < row.ema22) {
      breakout = { direction: 'SHORT', index: i, level: range.low };
      continue;
    }
    if (!breakout) continue;
    if (i - breakout.index > 10) {
      breakout = null;
      continue;
    }
    const longRetest = breakout.direction === 'LONG'
      && row.low <= breakout.level + rules.retestTolerancePoints
      && row.close > breakout.level
      && row.close > row.open
      && row.ema9 > row.ema22;
    const shortRetest = breakout.direction === 'SHORT'
      && row.high >= breakout.level - rules.retestTolerancePoints
      && row.close < breakout.level
      && row.close < row.open
      && row.ema9 < row.ema22;
    if (longRetest || shortRetest) {
      return signal('late-breakout-retest', breakout.direction, row, i, {
        openingRange: range,
        breakoutTime: rows[breakout.index].timestamp,
        breakoutLevel: breakout.level,
        adx14: row.adx14,
      });
    }
  }
  return null;
}

function detectVwapPullback(rows, range, rules) {
  for (let i = 2; i < rows.length - 1; i += 1) {
    const row = rows[i];
    const previous = rows[i - 1];
    const time = timeOf(row.timestamp);
    if (time < '09:45' || time > '13:30' || !(row.adx14 >= rules.minimumAdx)) continue;
    const longTrend = row.close > row.vwap && row.ema9 > row.ema22 && row.ema9 >= previous.ema9;
    const shortTrend = row.close < row.vwap && row.ema9 < row.ema22 && row.ema9 <= previous.ema9;
    const longTouch = Math.min(previous.low, row.low) <= Math.max(row.vwap, row.ema9) + rules.vwapTolerancePoints;
    const shortTouch = Math.max(previous.high, row.high) >= Math.min(row.vwap, row.ema9) - rules.vwapTolerancePoints;
    if (longTrend && longTouch && previous.close <= previous.ema9 && row.close > row.ema9 && row.close > row.open) {
      return signal('vwap-trend-pullback', 'LONG', row, i, { openingRange: range, vwap: row.vwap, vwapMode: row.vwapMode, adx14: row.adx14 });
    }
    if (shortTrend && shortTouch && previous.close >= previous.ema9 && row.close < row.ema9 && row.close < row.open) {
      return signal('vwap-trend-pullback', 'SHORT', row, i, { openingRange: range, vwap: row.vwap, vwapMode: row.vwapMode, adx14: row.adx14 });
    }
  }
  return null;
}

function detectFailedBreak(rows, range, rules) {
  for (let i = 1; i < rows.length - 1; i += 1) {
    const row = rows[i];
    const previous = rows[i - 1];
    const time = timeOf(row.timestamp);
    if (time < '09:45' || time > '12:30') continue;
    const adxAcceptable = !Number.isFinite(row.adx14)
      || row.adx14 <= rules.maximumReversalAdx
      || (Number.isFinite(previous.adx14) && row.adx14 < previous.adx14);
    if (!adxAcceptable) continue;
    const failedHigh = (row.high > range.high + rules.breakoutBufferPoints || previous.high > range.high + rules.breakoutBufferPoints)
      && row.close < range.high
      && row.close < row.open;
    const failedLow = (row.low < range.low - rules.breakoutBufferPoints || previous.low < range.low - rules.breakoutBufferPoints)
      && row.close > range.low
      && row.close > row.open;
    if (failedHigh) return signal('failed-opening-range-break', 'SHORT', row, i, { openingRange: range, failedLevel: range.high, adx14: row.adx14 });
    if (failedLow) return signal('failed-opening-range-break', 'LONG', row, i, { openingRange: range, failedLevel: range.low, adx14: row.adx14 });
  }
  return null;
}

function detectAfternoonBreakout(rows, range, rules) {
  const compressionRows = rows.filter((row) => {
    const time = timeOf(row.timestamp);
    return time >= '11:00' && time < '13:15';
  });
  if (!compressionRows.length || !(range.width > 0)) return null;
  const compressionHigh = Math.max(...compressionRows.map((row) => row.high));
  const compressionLow = Math.min(...compressionRows.map((row) => row.low));
  const compressionWidth = compressionHigh - compressionLow;
  const ratio = compressionWidth / range.width;
  if (ratio > rules.maximumCompressionRatio) return null;
  for (let i = 1; i < rows.length - 1; i += 1) {
    const row = rows[i];
    const previous = rows[i - 1];
    const time = timeOf(row.timestamp);
    if (time < '13:15' || time > '14:30') continue;
    const adxExpanding = Number.isFinite(row.adx14) && Number.isFinite(previous.adx14)
      && row.adx14 >= rules.minimumAdx && row.adx14 > previous.adx14;
    if (adxExpanding && previous.close <= compressionHigh && row.close > compressionHigh + rules.breakoutBufferPoints && row.ema9 > row.ema22) {
      return signal('afternoon-compression-breakout', 'LONG', row, i, { openingRange: range, compressionHigh, compressionLow, compressionRatio: ratio, adx14: row.adx14 });
    }
    if (adxExpanding && previous.close >= compressionLow && row.close < compressionLow - rules.breakoutBufferPoints && row.ema9 < row.ema22) {
      return signal('afternoon-compression-breakout', 'SHORT', row, i, { openingRange: range, compressionHigh, compressionLow, compressionRatio: ratio, adx14: row.adx14 });
    }
  }
  return null;
}

export function detectOpportunity(candles, strategy, rules = DEFAULT_RULES) {
  if (!STRATEGIES.includes(strategy)) throw new Error(`Unknown strategy: ${strategy}`);
  const rows = enrichIndicators(candles);
  return detectOpportunityFromEnriched(rows, strategy, rules);
}

export function detectOpportunityFromEnriched(rows, strategy, rules = DEFAULT_RULES) {
  if (!STRATEGIES.includes(strategy)) throw new Error(`Unknown strategy: ${strategy}`);
  const range = openingRange(rows, rules);
  if (!range) return { status: 'DATA_MISSING', reason: 'Opening range unavailable' };
  const detector = {
    'late-breakout-retest': detectLateBreakoutRetest,
    'vwap-trend-pullback': detectVwapPullback,
    'failed-opening-range-break': detectFailedBreak,
    'afternoon-compression-breakout': detectAfternoonBreakout,
  }[strategy];
  const found = detector(rows, range, rules);
  return found
    ? { status: 'SIGNAL', ...found }
    : { status: 'NO_SIGNAL', strategy, openingRange: range };
}

export function evaluateOptionPosition(candles, signalTime, rules = DEFAULT_RULES) {
  const signalIndex = candles.findIndex((row) => row.timestamp === signalTime);
  if (signalIndex < 0) return { status: 'DATA_MISSING', reason: 'Option signal candle unavailable' };
  const entryBar = candles[signalIndex + 1];
  if (!entryBar) return { status: 'DATA_MISSING', reason: 'Next-bar entry unavailable' };
  const entryTime = timeOf(entryBar.timestamp);
  if (entryTime >= rules.forcedExit) return { status: 'NO_TRADE', reason: 'Signal leaves no holding interval' };
  const entry = entryBar.open;
  if (entry < rules.entryPremiumMin || entry > rules.entryPremiumMax) {
    return { status: 'NO_TRADE', reason: 'Next-bar premium outside executable band', entry, entryTime: entryBar.timestamp };
  }
  const stop = Math.max(0, entry - rules.stopPoints);
  const target = entry + rules.targetPoints;
  for (let i = signalIndex + 1; i < candles.length; i += 1) {
    const row = candles[i];
    const time = timeOf(row.timestamp);
    if (time >= rules.forcedExit) break;
    const hitStop = row.low <= stop;
    const hitTarget = row.high >= target;
    if (hitStop) {
      return { status: 'TRADE', entry, entryTime: entryBar.timestamp, exit: stop, exitTime: row.timestamp, result: 'STOP', ambiguousBar: hitTarget, pnlPerUnit: stop - entry };
    }
    if (hitTarget) {
      return { status: 'TRADE', entry, entryTime: entryBar.timestamp, exit: target, exitTime: row.timestamp, result: 'TARGET', ambiguousBar: false, pnlPerUnit: target - entry };
    }
  }
  const forced = candles.find((row) => timeOf(row.timestamp) === rules.forcedExit);
  if (forced) {
    return { status: 'TRADE', entry, entryTime: entryBar.timestamp, exit: forced.open, exitTime: forced.timestamp, result: 'TIME', ambiguousBar: false, pnlPerUnit: forced.open - entry };
  }
  const last = candles.filter((row) => timeOf(row.timestamp) < rules.forcedExit).at(-1);
  if (!last) return { status: 'DATA_MISSING', reason: 'No forced-exit or final option candle' };
  return { status: 'TRADE', entry, entryTime: entryBar.timestamp, exit: last.close, exitTime: last.timestamp, result: 'TIME', ambiguousBar: false, pnlPerUnit: last.close - entry };
}

export function timestampTime(timestamp) {
  return timeOf(timestamp);
}

export function niftyLotSizeForExpiry(expiry) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry))) throw new Error('expiry must be YYYY-MM-DD');
  if (expiry < '2021-08-01') return 75;
  if (expiry < '2024-05-02') return 50;
  if (expiry < '2025-01-02') return 25;
  if (expiry < '2026-01-06') return 75;
  return 65;
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

export function summarizeOpportunityResults(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const gross = trades.map((row) => row.pnlPerUnit);
  const wins = gross.filter((value) => value > 0);
  const losses = gross.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const scenario = (name) => {
    const values = trades.map((row) => row.costs?.[name]?.netPnl).filter(Number.isFinite);
    return values.length === trades.length ? {
      totalNetPnlRupees: values.reduce((sum, value) => sum + value, 0),
      maximumDrawdownRupees: maximumDrawdown(values),
    } : null;
  };
  return {
    observedSessions: results.length,
    signals: results.filter((row) => row.signal).length,
    trades: trades.length,
    noSignalSessions: results.filter((row) => row.status === 'NO_SIGNAL').length,
    noTradeSessions: results.filter((row) => row.status === 'NO_TRADE').length,
    excludedSessions: results.filter((row) => row.status === 'EXCLUDED_SESSION').length,
    dataMissingSessions: results.filter((row) => row.status === 'DATA_MISSING').length,
    candidateBoundarySessions: results.filter((row) => row.status === 'CANDIDATE_BOUNDARY').length,
    targets: trades.filter((row) => row.result === 'TARGET').length,
    stops: trades.filter((row) => row.result === 'STOP').length,
    timeExits: trades.filter((row) => row.result === 'TIME').length,
    ambiguousBars: trades.filter((row) => row.ambiguousBar).length,
    winRate: trades.length ? wins.length / trades.length : null,
    totalPnlPerUnitBeforeCosts: gross.reduce((sum, value) => sum + value, 0),
    expectancyPerUnitBeforeCosts: trades.length ? gross.reduce((sum, value) => sum + value, 0) / trades.length : null,
    profitFactorBeforeCosts: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Number.MAX_SAFE_INTEGER : null),
    maximumDrawdownPerUnitBeforeCosts: maximumDrawdown(gross),
    normalizedCosts: scenario('normalized'),
    stress0_5: scenario('stress0_5'),
    stress1_0: scenario('stress1_0'),
  };
}
