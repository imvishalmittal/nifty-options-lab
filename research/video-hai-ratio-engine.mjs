import { calculateOptionRoundTripCosts } from './groww-option-costs.mjs';
import { parseNiftyOptionContract } from './nifty-180-premium-strategy.mjs';

export const VIDEO_HAI_STRATEGY = 'video-hai-call-ratio-1x3x2';
export const VIDEO_HAI_PUBLICATION_DATE = '2026-01-25';

export const VIDEO_HAI_RULES = Object.freeze({
  decisionTime: '09:44',
  entryTime: '09:45',
  forcedExitTime: '15:15',
  firstLegDistancePoints: 200,
  strikeSpacingPoints: 200,
  strikeShiftPoints: 100,
  maximumFirstLegDistancePoints: 1000,
  capitalAtLot65Rupees: 140000,
  targetCapitalRatio: 0.01,
  stopCapitalRatio: 0.01,
  maximumEntryCreditCapitalRatio: 0.006,
});

export const VIDEO_HAI_LEGS = Object.freeze({
  lowerLong: Object.freeze({ side: 'LONG', lots: 1 }),
  middleShort: Object.freeze({ side: 'SHORT', lots: 3 }),
  upperLong: Object.freeze({ side: 'LONG', lots: 2 }),
});

function parseDate(date) {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function weekday(date) {
  return parseDate(date).getUTCDay();
}

export function fridayForMonday(date) {
  if (weekday(date) !== 1) throw new Error('entry date must be Monday');
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + 4);
  return formatDate(value);
}

export function capitalForLotSize(lotSize, rules = VIDEO_HAI_RULES) {
  if (!(lotSize > 0)) throw new Error('lotSize must be positive');
  return rules.capitalAtLot65Rupees * lotSize / 65;
}

export function roundedUpHundredAnchor(spot) {
  if (!(spot > 0)) throw new Error('spot must be positive');
  return Math.ceil(spot / 100) * 100;
}

function contractAt(parsed, strike) {
  return parsed.find((contract) => contract.optionType === 'CE' && contract.strike === strike) ?? null;
}

export function buildVideoHaiCandidates(contracts, spot, rules = VIDEO_HAI_RULES) {
  const parsed = contracts
    .map((item) => parseNiftyOptionContract(item.symbol ?? item.groww_symbol ?? item))
    .filter(Boolean);
  const anchor = roundedUpHundredAnchor(spot);
  const candidates = [];
  for (
    let distance = rules.firstLegDistancePoints;
    distance <= rules.maximumFirstLegDistancePoints;
    distance += rules.strikeShiftPoints
  ) {
    const lowerStrike = anchor + distance;
    const middleStrike = lowerStrike + rules.strikeSpacingPoints;
    const upperStrike = middleStrike + rules.strikeSpacingPoints;
    const lowerLong = contractAt(parsed, lowerStrike);
    const middleShort = contractAt(parsed, middleStrike);
    const upperLong = contractAt(parsed, upperStrike);
    if (![lowerLong, middleShort, upperLong].every(Boolean)) continue;
    candidates.push({
      anchor,
      distance,
      lowerLong: { ...lowerLong, ...VIDEO_HAI_LEGS.lowerLong },
      middleShort: { ...middleShort, ...VIDEO_HAI_LEGS.middleShort },
      upperLong: { ...upperLong, ...VIDEO_HAI_LEGS.upperLong },
    });
  }
  return candidates;
}

export function packageValuePoints(prices) {
  return prices.lowerLong - (3 * prices.middleShort) + (2 * prices.upperLong);
}

export function entryCreditPoints(prices) {
  return -packageValuePoints(prices);
}

export function expiryPayoffPoints(selection, entryPrices, expirySpot) {
  const intrinsic = (strike) => Math.max(0, expirySpot - strike);
  return entryCreditPoints(entryPrices)
    + intrinsic(selection.lowerLong.strike)
    - (3 * intrinsic(selection.middleShort.strike))
    + (2 * intrinsic(selection.upperLong.strike));
}

export function maximumExpiryLossPoints(selection, entryPrices) {
  const strikes = [selection.lowerLong.strike, selection.middleShort.strike, selection.upperLong.strike];
  const probes = [0, ...strikes, selection.upperLong.strike * 2];
  return Math.max(0, -Math.min(...probes.map((spot) => expiryPayoffPoints(selection, entryPrices, spot))));
}

function candleMap(rows = []) {
  return new Map(rows.map((row) => [row.timestamp, row]));
}

function synchronizedTimestamps(legCandles) {
  const names = Object.keys(VIDEO_HAI_LEGS);
  const sets = names.map((name) => new Set((legCandles[name] ?? []).map((row) => row.timestamp)));
  if (sets.some((set) => set.size === 0)) return [];
  return [...sets[0]].filter((timestamp) => sets.slice(1).every((set) => set.has(timestamp))).sort();
}

function quotesAt(maps, timestamp, field) {
  const output = {};
  for (const name of Object.keys(VIDEO_HAI_LEGS)) {
    const price = maps[name].get(timestamp)?.[field];
    if (!Number.isFinite(price)) return null;
    output[name] = price;
  }
  return output;
}

function timeOf(timestamp) {
  return timestamp.slice(11, 16);
}

function dateOf(timestamp) {
  return timestamp.slice(0, 10);
}

export function selectCandidateFromEntryQuotes(candidates, quoteLookup, lotSize, rules = VIDEO_HAI_RULES) {
  const capital = capitalForLotSize(lotSize, rules);
  for (const selection of candidates) {
    const entryPrices = quoteLookup(selection);
    if (!entryPrices) continue;
    const creditRupees = entryCreditPoints(entryPrices) * lotSize;
    const creditCapitalRatio = creditRupees / capital;
    if (creditCapitalRatio <= rules.maximumEntryCreditCapitalRatio) {
      return { selection, entryPrices, creditRupees, creditCapitalRatio, capital };
    }
  }
  return null;
}

function completedTrade({
  selection,
  entryPrices,
  exitPrices,
  entryTimestamp,
  exitTimestamp,
  thresholdTimestamp,
  result,
  lotSize,
  capital,
}) {
  const entryValue = packageValuePoints(entryPrices);
  const exitValue = packageValuePoints(exitPrices);
  const pnlPoints = exitValue - entryValue;
  return {
    status: 'TRADE',
    selection,
    lotSize,
    capitalRupees: capital,
    entryTime: entryTimestamp,
    exitTime: exitTimestamp,
    thresholdTime: thresholdTimestamp,
    entryPrices,
    exitPrices,
    entryCreditPoints: -entryValue,
    exitValuePoints: exitValue,
    pnlPoints,
    grossPnlRupees: pnlPoints * lotSize,
    maximumExpiryLossPoints: maximumExpiryLossPoints(selection, entryPrices),
    result,
  };
}

export function evaluateVideoHaiPosition({
  selection,
  legCandles,
  entryTimestamp,
  fridayDate,
  lotSize,
  rules = VIDEO_HAI_RULES,
}) {
  const maps = Object.fromEntries(Object.entries(legCandles).map(([name, rows]) => [name, candleMap(rows)]));
  const timestamps = synchronizedTimestamps(legCandles)
    .filter((timestamp) => timestamp >= entryTimestamp && dateOf(timestamp) <= fridayDate);
  const entryPrices = quotesAt(maps, entryTimestamp, 'open');
  if (!entryPrices) return { status: 'DATA_MISSING', reason: 'Synchronized three-leg 09:45 entry quotes unavailable' };
  const capital = capitalForLotSize(lotSize, rules);
  const targetRupees = capital * rules.targetCapitalRatio;
  const stopRupees = capital * rules.stopCapitalRatio;
  const forcedCandidates = timestamps.filter((timestamp) => timeOf(timestamp) === rules.forcedExitTime);
  const forcedTimestamp = forcedCandidates.at(-1) ?? null;
  if (!forcedTimestamp) return { status: 'DATA_MISSING', reason: 'Synchronized three-leg Friday-or-prior 15:15 exit quotes unavailable' };

  for (const timestamp of timestamps) {
    if (timestamp === entryTimestamp) continue;
    if (timestamp === forcedTimestamp) {
      const exitPrices = quotesAt(maps, timestamp, 'open');
      if (!exitPrices) return { status: 'DATA_MISSING', reason: 'Forced-exit prices unavailable' };
      return completedTrade({ selection, entryPrices, exitPrices, entryTimestamp, exitTimestamp: timestamp, thresholdTimestamp: null, result: 'TIME', lotSize, capital });
    }

    // An overnight gap is executable only at the new session's opening quote.
    if (timeOf(timestamp) === '09:15' && dateOf(timestamp) > dateOf(entryTimestamp)) {
      const openPrices = quotesAt(maps, timestamp, 'open');
      if (!openPrices) return { status: 'DATA_MISSING', reason: `Opening gap prices unavailable at ${timestamp}` };
      const openPnl = (packageValuePoints(openPrices) - packageValuePoints(entryPrices)) * lotSize;
      const result = openPnl >= targetRupees ? 'TARGET' : (openPnl <= -stopRupees ? 'STOP' : null);
      if (result) return completedTrade({ selection, entryPrices, exitPrices: openPrices, entryTimestamp, exitTimestamp: timestamp, thresholdTimestamp: timestamp, result, lotSize, capital });
    }

    const closePrices = quotesAt(maps, timestamp, 'close');
    if (!closePrices) return { status: 'DATA_MISSING', reason: `Synchronized close unavailable at ${timestamp}` };
    const closePnl = (packageValuePoints(closePrices) - packageValuePoints(entryPrices)) * lotSize;
    const result = closePnl >= targetRupees ? 'TARGET' : (closePnl <= -stopRupees ? 'STOP' : null);
    if (!result) continue;
    const nextTimestamp = timestamps.find((candidate) => candidate > timestamp);
    if (!nextTimestamp || nextTimestamp > forcedTimestamp) {
      return { status: 'DATA_MISSING', reason: 'Next synchronized fill unavailable after threshold' };
    }
    const exitPrices = quotesAt(maps, nextTimestamp, 'open');
    if (!exitPrices) return { status: 'DATA_MISSING', reason: `Next-bar exit prices unavailable at ${nextTimestamp}` };
    return completedTrade({ selection, entryPrices, exitPrices, entryTimestamp, exitTimestamp: nextTimestamp, thresholdTimestamp: timestamp, result, lotSize, capital });
  }
  return { status: 'DATA_MISSING', reason: 'Position did not reach a valid forced exit' };
}

export function attachVideoHaiCosts(position, { tradeDate = null, slippagePointsPerLeg = 0 }) {
  if (position.status !== 'TRADE') return null;
  const legs = Object.fromEntries(Object.entries(VIDEO_HAI_LEGS).map(([name, leg]) => [name, calculateOptionRoundTripCosts({
    entryPremium: position.entryPrices[name],
    exitPremium: position.exitPrices[name],
    lotSize: position.lotSize * leg.lots,
    // STT is charged on the sell transaction. Long legs sell on exit while
    // the short leg sells on entry, which matters across the 1-Apr-2026 rate
    // change. An explicit tradeDate remains available for deterministic tests.
    tradeDate: tradeDate ?? (leg.side === 'LONG'
      ? position.exitTime.slice(0, 10)
      : position.entryTime.slice(0, 10)),
    slippagePointsPerLeg,
    side: leg.side,
  })]));
  return {
    slippagePointsPerLeg,
    grossPnl: Object.values(legs).reduce((sum, leg) => sum + leg.grossPnl, 0),
    charges: Object.values(legs).reduce((sum, leg) => sum + leg.charges.total, 0),
    netPnl: Object.values(legs).reduce((sum, leg) => sum + leg.netPnl, 0),
    legs,
  };
}

function maximumDrawdown(values) {
  let equity = 0;
  let peak = 0;
  let maximum = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maximum = Math.max(maximum, peak - equity);
  }
  return maximum;
}

function scenarioSummary(trades, name) {
  const values = trades.map((row) => row.costs?.[name]?.netPnl).filter(Number.isFinite);
  if (values.length !== trades.length) return null;
  const wins = values.filter((value) => value > 0);
  const losses = values.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  return {
    totalNetPnlRupees: values.reduce((sum, value) => sum + value, 0),
    expectancyRupees: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    winRate: values.length ? wins.length / values.length : null,
    averageWinRupees: wins.length ? grossProfit / wins.length : null,
    averageLossRupees: losses.length ? -grossLoss / losses.length : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Number.MAX_SAFE_INTEGER : null),
    maximumDrawdownRupees: maximumDrawdown(values),
  };
}

export function summarizeVideoHaiResults(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  return {
    observedMondays: results.length,
    trades: trades.length,
    dataMissingWeeks: results.filter((row) => row.status === 'DATA_MISSING').length,
    noTradeWeeks: results.filter((row) => row.status === 'NO_TRADE').length,
    targets: trades.filter((row) => row.result === 'TARGET').length,
    stops: trades.filter((row) => row.result === 'STOP').length,
    timeExits: trades.filter((row) => row.result === 'TIME').length,
    maximumObservedGrossLossRupees: trades.length ? Math.max(0, ...trades.map((row) => -row.grossPnlRupees)) : null,
    maximumTheoreticalExpiryLossRupees: trades.length ? Math.max(...trades.map((row) => row.maximumExpiryLossPoints * row.lotSize)) : null,
    normalizedCosts: scenarioSummary(trades, 'normalized'),
    stress0_5: scenarioSummary(trades, 'stress0_5'),
    stress1_0: scenarioSummary(trades, 'stress1_0'),
  };
}

export function summarizeVideoHaiEras(results, publicationDate = VIDEO_HAI_PUBLICATION_DATE) {
  return {
    retrospective: summarizeVideoHaiResults(results.filter((row) => row.date <= publicationDate)),
    postPublication: summarizeVideoHaiResults(results.filter((row) => row.date > publicationDate)),
  };
}
