const DEFAULTS = Object.freeze({
  dailyDropPct: -1,
  maxThirtyDayReturnPct: -2.5,
  minVolume: 500_000,
  targetReturnPct: 7,
});

function finite(value) {
  return Number.isFinite(Number(value));
}

function sessionIndex(sessions, date) {
  return sessions.indexOf(date);
}

export function eligibleCandidate(candidate, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  if (!candidate.category || String(candidate.category).startsWith('UNCLASSIFIED:')) return false;
  if (!finite(candidate.entryPrice) || Number(candidate.entryPrice) <= 0) return false;
  if (!finite(candidate.dayReturnPct) || Number(candidate.dayReturnPct) > cfg.dailyDropPct) return false;
  if (!finite(candidate.thirtyDayReturnPct)) return false;
  if (Number(candidate.thirtyDayReturnPct) > cfg.maxThirtyDayReturnPct) return false;
  if (!finite(candidate.volumeToEntry) || Number(candidate.volumeToEntry) <= cfg.minVolume) return false;
  return true;
}

export function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const monthly = Number(a.thirtyDayReturnPct) - Number(b.thirtyDayReturnPct);
    if (monthly) return monthly;
    const daily = Number(a.dayReturnPct) - Number(b.dayReturnPct);
    if (daily) return daily;
    const liquidity = Number(b.volumeToEntry) - Number(a.volumeToEntry);
    if (liquidity) return liquidity;
    return String(a.symbol).localeCompare(String(b.symbol));
  });
}

export function selectDailyTrade({ date, candidates, priorSessionDate, priorPurchase }, options = {}) {
  const eligible = rankCandidates(candidates.filter((candidate) => eligibleCandidate(candidate, options)));
  const excluded = [];
  for (const candidate of eligible) {
    const consecutiveSameCategory = Boolean(
      priorPurchase
      && priorPurchase.date === priorSessionDate
      && priorPurchase.category === candidate.category,
    );
    if (consecutiveSameCategory) {
      excluded.push({ symbol: candidate.symbol, reason: 'CONSECUTIVE_CATEGORY', category: candidate.category });
      continue;
    }
    return { date, selected: candidate, eligible, excluded, status: 'SELECTED' };
  }
  return {
    date,
    selected: null,
    eligible,
    excluded,
    status: eligible.length ? 'CATEGORY_BLOCKED' : 'NO_QUALIFIER',
  };
}

function holdingPath(trade, marketBySymbol, sessions) {
  const market = marketBySymbol.get(trade.symbol);
  if (!market) return [];
  const start = sessionIndex(sessions, trade.date);
  if (start < 0) return [];
  const path = [];
  for (let i = start; i < sessions.length; i++) {
    const date = sessions[i];
    const day = market.get(date);
    if (!day) continue;
    path.push({ date, sessionOffset: i - start, ...day });
  }
  return path;
}

export function scoreTrade(trade, marketBySymbol, sessions, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const entry = Number(trade.entryPrice);
  const targetPrice = entry * (1 + cfg.targetReturnPct / 100);
  const path = holdingPath(trade, marketBySymbol, sessions);
  let maxPrice = entry;
  let minPrice = entry;
  let exit = null;
  const horizonReturns = {};
  const horizons = options.horizons ?? [10, 20, 40, 60];

  for (const day of path) {
    const high = Number(day.sessionOffset === 0 ? day.highAfterEntry : day.high);
    const low = Number(day.sessionOffset === 0 ? day.lowAfterEntry : day.low);
    if (Number.isFinite(high)) maxPrice = Math.max(maxPrice, high);
    if (Number.isFinite(low)) minPrice = Math.min(minPrice, low);
    if (!exit && Number.isFinite(high) && high >= targetPrice) {
      exit = { date: day.date, sessionOffset: day.sessionOffset, price: targetPrice };
    }
    if (horizons.includes(day.sessionOffset) && finite(day.markPrice)) {
      horizonReturns[day.sessionOffset] = (Number(day.markPrice) / entry - 1) * 100;
    }
    if (exit) break;
  }

  const last = path.at(-1) ?? null;
  const markPrice = finite(last?.markPrice) ? Number(last.markPrice) : entry;
  const grossReturnPct = exit ? cfg.targetReturnPct : (markPrice / entry - 1) * 100;
  return {
    ...trade,
    targetPrice,
    status: exit ? 'TARGET' : 'OPEN',
    exitDate: exit?.date ?? null,
    sessionsToTarget: exit?.sessionOffset ?? null,
    exitPrice: exit?.price ?? null,
    markDate: last?.date ?? trade.date,
    markPrice,
    grossReturnPct,
    mfePct: (maxPrice / entry - 1) * 100,
    maePct: (minPrice / entry - 1) * 100,
    horizonReturns,
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export function summarizeCapitalUse(trades, sessions, executionHaircutsPct = [0, 0.25, 0.5]) {
  const occupancy = sessions.map((date) => ({
    date,
    activeSlots: trades.filter((trade) => (
      trade.date <= date && (trade.exitDate === null || trade.exitDate >= date)
    )).length,
  }));
  const peakActiveSlots = occupancy.length ? Math.max(...occupancy.map((day) => day.activeSlots)) : 0;
  const peakDates = occupancy
    .filter((day) => day.activeSlots === peakActiveSlots && peakActiveSlots > 0)
    .map((day) => day.date);
  const totalMarkedProfitUnits = trades.reduce((sum, trade) => sum + trade.grossReturnPct / 100, 0);
  const normalized = Object.fromEntries(executionHaircutsPct.map((haircut) => {
    const profitUnits = trades.reduce((sum, trade) => sum + (trade.grossReturnPct - haircut) / 100, 0);
    return [haircut, peakActiveSlots ? (profitUnits / peakActiveSlots) * 100 : null];
  }));
  return {
    definition: 'Each trade uses one equal-notional capital slot; a slot remains occupied through its target day, and open trades remain occupied through the final session.',
    peakActiveSlots,
    peakDates,
    averageActiveSlots: occupancy.length
      ? occupancy.reduce((sum, day) => sum + day.activeSlots, 0) / occupancy.length
      : 0,
    occupiedSlotSessions: occupancy.reduce((sum, day) => sum + day.activeSlots, 0),
    finalOpenSlots: trades.filter((trade) => trade.status === 'OPEN').length,
    totalMarkedProfitUnits,
    capitalNormalizedMarkedReturnPct: peakActiveSlots ? (totalMarkedProfitUnits / peakActiveSlots) * 100 : null,
    capitalNormalizedAfterExecutionHaircutPct: normalized,
  };
}

export function summarizeAnnualizedReturn(
  trades,
  sessions,
  capitalUse,
  executionHaircutsPct = [0, 0.25, 0.5],
) {
  const firstTradeDate = trades.length
    ? trades.map((trade) => trade.date).sort()[0]
    : null;
  const endDate = sessions.at(-1) ?? null;
  const elapsedDays = firstTradeDate && endDate
    ? (new Date(`${endDate}T00:00:00Z`) - new Date(`${firstTradeDate}T00:00:00Z`)) / 86_400_000
    : 0;
  const initialCapitalUnits = Number(capitalUse?.peakActiveSlots ?? 0);
  const scenarios = Object.fromEntries(executionHaircutsPct.map((haircut) => {
    const profitUnits = trades.reduce(
      (sum, trade) => sum + (Number(trade.grossReturnPct) - haircut) / 100,
      0,
    );
    const endingCapitalUnits = initialCapitalUnits + profitUnits;
    const totalReturnPct = initialCapitalUnits > 0
      ? (endingCapitalUnits / initialCapitalUnits - 1) * 100
      : null;
    const xirrPct = initialCapitalUnits > 0 && endingCapitalUnits > 0 && elapsedDays > 0
      ? ((endingCapitalUnits / initialCapitalUnits) ** (365 / elapsedDays) - 1) * 100
      : null;
    return [haircut, { profitUnits, endingCapitalUnits, totalReturnPct, xirrPct }];
  }));
  return {
    definition: 'Portfolio XIRR treats the peak number of equal-notional slots as capital funded on the first purchase date and the marked portfolio value as one terminal cash flow on the final session.',
    firstTradeDate,
    endDate,
    elapsedDays,
    initialCapitalUnits,
    scenarios,
  };
}

export function summarizeTrades(trades, executionHaircutsPct = [0, 0.25, 0.5], horizons = [10, 20, 40, 60]) {
  const closed = trades.filter((trade) => trade.status === 'TARGET');
  const open = trades.filter((trade) => trade.status === 'OPEN');
  const durations = closed.map((trade) => trade.sessionsToTarget);
  const targetByHorizon = Object.fromEntries(horizons.map((horizon) => {
    const mature = trades.filter((trade) => {
      const observed = trade.horizonReturns[horizon];
      return observed !== undefined || (trade.status === 'TARGET' && trade.sessionsToTarget <= horizon);
    });
    const hits = mature.filter((trade) => trade.status === 'TARGET' && trade.sessionsToTarget <= horizon).length;
    return [horizon, { matureTrades: mature.length, targetHits: hits, hitRate: mature.length ? hits / mature.length : null }];
  }));
  const costSensitivity = Object.fromEntries(executionHaircutsPct.map((haircut) => [
    haircut,
    trades.length
      ? trades.reduce((sum, trade) => sum + trade.grossReturnPct - haircut, 0) / trades.length
      : null,
  ]));
  return {
    trades: trades.length,
    targets: closed.length,
    open: open.length,
    observedTargetRate: trades.length ? closed.length / trades.length : null,
    medianSessionsToTarget: percentile(durations, 0.5),
    p90SessionsToTarget: percentile(durations, 0.9),
    worstOpenReturnPct: open.length ? Math.min(...open.map((trade) => trade.grossReturnPct)) : null,
    worstMaePct: trades.length ? Math.min(...trades.map((trade) => trade.maePct)) : null,
    averageMarkedReturnPct: trades.length
      ? trades.reduce((sum, trade) => sum + trade.grossReturnPct, 0) / trades.length
      : null,
    targetByHorizon,
    averageReturnAfterExecutionHaircutPct: costSensitivity,
  };
}

export function replayStrategy({ sessions, candidatesByDate, marketBySymbol }, options = {}) {
  const selections = [];
  const rawTrades = [];
  let priorPurchase = null;
  for (let i = 0; i < sessions.length; i++) {
    const date = sessions[i];
    const decision = selectDailyTrade({
      date,
      candidates: candidatesByDate.get(date) ?? [],
      priorSessionDate: i > 0 ? sessions[i - 1] : null,
      priorPurchase,
    }, options);
    selections.push(decision);
    if (decision.selected) {
      const trade = { date, ...decision.selected };
      rawTrades.push(trade);
      priorPurchase = { date, category: trade.category };
    }
  }
  const trades = rawTrades.map((trade) => scoreTrade(trade, marketBySymbol, sessions, options));
  const executionHaircutsPct = options.executionHaircutsPct ?? [0, 0.25, 0.5];
  const horizons = options.horizons ?? [10, 20, 40, 60];
  const capitalUse = summarizeCapitalUse(trades, sessions, executionHaircutsPct);
  return {
    selections,
    trades,
    summary: summarizeTrades(trades, executionHaircutsPct, horizons),
    capitalUse,
    annualizedReturn: summarizeAnnualizedReturn(trades, sessions, capitalUse, executionHaircutsPct),
  };
}

export const STRATEGY_DEFAULTS = DEFAULTS;
