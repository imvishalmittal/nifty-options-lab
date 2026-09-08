export const PROFIT_ONLY_RULES = Object.freeze({
  optionMoneynessPoints: 200,
  openingEnd: '09:29',
  entryStart: '09:30',
  entryCutoff: '11:30',
  sessionExit: '15:15',
  retestTolerancePoints: 2,
  regimeSmaSessions: 50,
  financingTriggerPoints: 10,
});

function timeOf(row) { return row.timestamp.slice(11, 16); }
function dateOf(row) { return row.timestamp.slice(0, 10); }

export function openingRange(rows, rules = PROFIT_ONLY_RULES) {
  const opening = rows.filter((row) => timeOf(row) >= '09:15' && timeOf(row) <= rules.openingEnd);
  if (!opening.length) return null;
  return { high: Math.max(...opening.map((row) => row.high)), low: Math.min(...opening.map((row) => row.low)) };
}

function firstBreak(rows, high, low, rules) {
  return rows.find((row) => timeOf(row) >= rules.entryStart && timeOf(row) < rules.entryCutoff
    && (row.close > high || row.close < low)) ?? null;
}

export function openingRangeSignal(rows, rules = PROFIT_ONLY_RULES) {
  const range = openingRange(rows, rules);
  if (!range) return null;
  const signal = firstBreak(rows, range.high, range.low, rules);
  return signal ? { strategy: 'ORB15', direction: signal.close > range.high ? 'UP' : 'DOWN', signal, ...range } : null;
}

export function retestSignal(rows, rules = PROFIT_ONLY_RULES) {
  const range = openingRange(rows, rules);
  if (!range) return null;
  const breakout = firstBreak(rows, range.high, range.low, rules);
  if (!breakout) return null;
  const direction = breakout.close > range.high ? 'UP' : 'DOWN';
  const after = rows.filter((row) => row.timestamp > breakout.timestamp && timeOf(row) < rules.entryCutoff);
  const signal = after.find((row) => direction === 'UP'
    ? row.low <= range.high + rules.retestTolerancePoints && row.close > range.high
    : row.high >= range.low - rules.retestTolerancePoints && row.close < range.low);
  return signal ? { strategy: 'RETEST15', direction, signal, breakoutTime: breakout.timestamp, ...range } : null;
}

export function previousDayBreakSignal(rows, previousSession, rules = PROFIT_ONLY_RULES) {
  if (!previousSession) return null;
  const signal = rows.find((row) => timeOf(row) >= rules.entryStart && timeOf(row) < rules.entryCutoff
    && (row.close > previousSession.high || row.close < previousSession.low));
  return signal ? {
    strategy: 'PREVIOUS_DAY_BREAK', direction: signal.close > previousSession.high ? 'UP' : 'DOWN',
    signal, previousHigh: previousSession.high, previousLow: previousSession.low,
  } : null;
}

export function regimeAlignedSignal(rows, priorDailyCloses, rules = PROFIT_ONLY_RULES) {
  if (priorDailyCloses.length < rules.regimeSmaSessions) return null;
  const sample = priorDailyCloses.slice(-rules.regimeSmaSessions);
  const sma = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const base = openingRangeSignal(rows, rules);
  if (!base) return null;
  const priorClose = priorDailyCloses.at(-1);
  if ((base.direction === 'UP' && priorClose <= sma) || (base.direction === 'DOWN' && priorClose >= sma)) return null;
  return { ...base, strategy: 'REGIME_ORB_DEEP_ITM', regimeSma: sma, priorClose };
}

export function vwapContinuationSignal(rows, rules = PROFIT_ONLY_RULES) {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  for (const row of rows) {
    if (timeOf(row) < rules.entryStart || timeOf(row) >= rules.entryCutoff) continue;
    if (!(row.volume > 0)) continue;
    cumulativePriceVolume += ((row.high + row.low + row.close) / 3) * row.volume;
    cumulativeVolume += row.volume;
    const vwap = cumulativePriceVolume / cumulativeVolume;
    if (row.close > vwap && row.open <= vwap) return { strategy: 'VWAP_CONTINUATION', direction: 'UP', signal: row, vwap };
    if (row.close < vwap && row.open >= vwap) return { strategy: 'VWAP_CONTINUATION', direction: 'DOWN', signal: row, vwap };
  }
  return null;
}

export function selectItmContract(contracts, spot, direction, points = PROFIT_ONLY_RULES.optionMoneynessPoints) {
  const optionType = direction === 'UP' ? 'CE' : 'PE';
  const target = direction === 'UP' ? spot - points : spot + points;
  return contracts.filter((row) => row.optionType === optionType)
    .sort((a, b) => Math.abs(a.strike - target) - Math.abs(b.strike - target) || a.strike - b.strike)[0] ?? null;
}

function stopFill(row, stop) { return row.open <= stop ? row.open : stop; }

export function evaluateImmediateBreakeven(optionRows, signalTimestamp, exitMode = 'IMMEDIATE_BE', rules = PROFIT_ONLY_RULES) {
  const index = optionRows.findIndex((row) => row.timestamp === signalTimestamp);
  if (index < 0 || index + 1 >= optionRows.length) return null;
  const entry = optionRows[index].close;
  const signalLow = optionRows[index].low;
  const trailingStep = exitMode === 'TRAIL_5_AFTER_BE_10' ? 5 : exitMode === 'TRAIL_10_AFTER_BE_10' ? 10 : null;
  let activeStop = exitMode === 'CONFIRM_BE_10' || trailingStep ? signalLow : entry;
  let peak = entry;
  let financed = false;
  let firstExit = null;
  for (let i = index + 1; i < optionRows.length; i += 1) {
    const row = optionRows[i];
    if (timeOf(row) > rules.sessionExit) break;
    if (row.low <= activeStop) {
      const exit = stopFill(row, activeStop);
      return { entry, entryTime: optionRows[index + 1].timestamp, exit, exitTime: row.timestamp,
        result: financed ? 'FINANCED_STOP' : (activeStop > entry ? 'TRAILING_STOP' : activeStop === entry ? 'BREAKEVEN_STOP' : 'INITIAL_STOP'), peak, financed, firstExit,
        pnlPerUnit: financed ? ((firstExit - entry) + (exit - entry)) / 2 : exit - entry };
    }
    peak = Math.max(peak, row.high);
    if (exitMode === 'CONFIRM_BE_10' && activeStop < entry && peak >= entry + 10) activeStop = entry;
    if (trailingStep && peak >= entry + 10) {
      const completedSteps = Math.floor((peak - (entry + 10)) / trailingStep);
      activeStop = Math.max(activeStop, entry + completedSteps * trailingStep);
    }
    if (exitMode === 'FINANCE_HALF_10' && !financed && peak >= entry + rules.financingTriggerPoints) {
      financed = true;
      firstExit = entry + rules.financingTriggerPoints;
    }
  }
  const eligible = optionRows.filter((row) => row.timestamp > signalTimestamp && timeOf(row) <= rules.sessionExit);
  const last = eligible.at(-1);
  if (!last) return null;
  return { entry, entryTime: optionRows[index + 1].timestamp, exit: last.close, exitTime: last.timestamp,
    result: 'SESSION_EXIT', peak, financed, firstExit,
    pnlPerUnit: financed ? ((firstExit - entry) + (last.close - entry)) / 2 : last.close - entry };
}

export function groupSpotSessions(rows) {
  const result = new Map();
  for (const row of rows) {
    const date = dateOf(row);
    if (!result.has(date)) result.set(date, []);
    result.get(date).push(row);
  }
  for (const value of result.values()) value.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return result;
}
