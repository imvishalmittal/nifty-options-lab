import { niftyLotSizeForExpiry } from './opportunity/opportunity-engine.mjs';
import { robustnessReport, summarizePerformance } from './performance-statistics.mjs';

export const POSITIONAL_FUTURES_RULES = Object.freeze({
  signal: 'Completed NIFTY cash daily close versus SMA100 plus/minus 0.5 ATR20 hysteresis band',
  execution: 'Enter, reverse, and roll at the next session open; no same-close execution',
  direction: 'Long above the upper band; short below the lower band; otherwise retain the existing direction',
  contract: 'Nearest actual NIFTY FUTIDX contract with at least 7 calendar days to expiry; otherwise next listed expiry',
  sizing: 'Exactly one historical NIFTY futures lot; no pyramiding',
  roll: 'Close the old contract and open the newly selected contract at their same-session opens',
  terminalExit: 'Close the final open segment at the final session settlement price',
  costs: 'Date-sensitive statutory futures charges, ₹20 brokerage per order, and adverse slippage on both entry and exit',
  discovery: '2016-01-01 through 2022-12-31; 2015 is warm-up only',
});

const DAY_MS = 86_400_000;

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function trueRange(row, previous) {
  if (!previous) return row.high - row.low;
  return Math.max(row.high - row.low, Math.abs(row.high - previous.close), Math.abs(row.low - previous.close));
}

export function addIndicators(rows, smaPeriod = 100, atrPeriod = 20) {
  const closes = [];
  const ranges = [];
  return rows.map((row, index) => {
    closes.push(row.index.close);
    ranges.push(trueRange(row.index, rows[index - 1]?.index));
    const sma = closes.length >= smaPeriod ? mean(closes.slice(-smaPeriod)) : null;
    const atr = ranges.length >= atrPeriod ? mean(ranges.slice(-atrPeriod)) : null;
    return { ...row, indicators: { sma, atr } };
  });
}

export function desiredDirection(row, currentDirection = null) {
  const { sma, atr } = row.indicators ?? {};
  if (!Number.isFinite(sma) || !Number.isFinite(atr)) return currentDirection;
  if (row.index.close > sma + 0.5 * atr) return 'LONG';
  if (row.index.close < sma - 0.5 * atr) return 'SHORT';
  return currentDirection;
}

export function selectFrontContract(contracts, date, minimumDays = 7) {
  const usable = contracts.filter((row) => row.expiry >= date && Number.isFinite(row.open) && Number.isFinite(row.settle))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  if (!usable.length) return null;
  return usable.find((row) => (Date.parse(`${row.expiry}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS >= minimumDays)
    ?? usable.at(-1);
}

export function futuresRoundTripCosts({ entryPrice, exitPrice, lotSize, tradeDate, slippagePointsPerSide = 0.5 }) {
  const adjustedEntry = entryPrice + slippagePointsPerSide;
  const adjustedExit = exitPrice - slippagePointsPerSide;
  const buyTurnover = adjustedEntry * lotSize;
  const sellTurnover = adjustedExit * lotSize;
  const totalTurnover = buyTurnover + sellTurnover;
  const brokerage = 40;
  const exchange = totalTurnover * 0.0000183;
  const sebi = totalTurnover * 0.000001;
  const gst = (brokerage + exchange + sebi) * 0.18;
  const stamp = buyTurnover * 0.00002;
  const sttRate = tradeDate < '2024-10-01' ? 0.000125 : 0.0002;
  const stt = sellTurnover * sttRate;
  return { total: brokerage + exchange + sebi + gst + stamp + stt, slippagePointsPerSide };
}

function closeSegment(position, exit, direction, scenario) {
  const multiplier = direction === 'LONG' ? 1 : -1;
  const gross = (exit.price - position.entryPrice) * multiplier * position.lotSize;
  const costs = futuresRoundTripCosts({
    entryPrice: direction === 'LONG' ? position.entryPrice : exit.price,
    exitPrice: direction === 'LONG' ? exit.price : position.entryPrice,
    lotSize: position.lotSize,
    tradeDate: position.entryDate,
    slippagePointsPerSide: scenario,
  });
  return gross - costs.total - scenario * 2 * position.lotSize;
}

export function backtestPositionalFutures(rawRows, { startDate = '2016-01-01', endDate = '2022-12-31' } = {}) {
  const rows = addIndicators([...rawRows].sort((a, b) => a.date.localeCompare(b.date)));
  const scenarios = [0.5, 1, 2];
  const trades = [];
  let position = null;
  let pendingDirection = null;
  let currentDirection = null;
  let eligibleSessions = 0;
  let missingSessions = 0;

  for (const row of rows) {
    const inPeriod = row.date >= startDate && row.date <= endDate;
    const selected = selectFrontContract(row.contracts ?? [], row.date);
    if (inPeriod) eligibleSessions += 1;
    if (inPeriod && !selected) { missingSessions += 1; continue; }

    if (inPeriod && pendingDirection && selected) {
      const needsChange = !position || position.direction !== pendingDirection || position.expiry !== selected.expiry;
      if (position && needsChange) {
        const old = (row.contracts ?? []).find((contract) => contract.expiry === position.expiry);
        if (!old || !Number.isFinite(old.open)) { missingSessions += 1; continue; }
        trades.push({
          entryDate: position.entryDate, exitDate: row.date, direction: position.direction,
          expiry: position.expiry, entryPrice: position.entryPrice, exitPrice: old.open,
          lotSize: position.lotSize, exitReason: position.direction !== pendingDirection ? 'SIGNAL_REVERSAL' : 'ROLL',
          pnl: Object.fromEntries(scenarios.map((scenario) => [String(scenario), closeSegment(position, { price: old.open }, position.direction, scenario)])),
        });
        position = null;
      }
      if (!position) position = {
        direction: pendingDirection, expiry: selected.expiry, entryDate: row.date,
        entryPrice: selected.open, lotSize: niftyLotSizeForExpiry(selected.expiry),
      };
      currentDirection = pendingDirection;
    }

    if (inPeriod) pendingDirection = desiredDirection(row, currentDirection);
  }

  const last = rows.filter((row) => row.date >= startDate && row.date <= endDate).at(-1);
  if (position && last) {
    const contract = (last.contracts ?? []).find((row) => row.expiry === position.expiry);
    if (contract?.settle != null) trades.push({
      entryDate: position.entryDate, exitDate: last.date, direction: position.direction,
      expiry: position.expiry, entryPrice: position.entryPrice, exitPrice: contract.settle,
      lotSize: position.lotSize, exitReason: 'PERIOD_END',
      pnl: Object.fromEntries(scenarios.map((scenario) => [String(scenario), closeSegment(position, { price: contract.settle }, position.direction, scenario)])),
    });
    else missingSessions += 1;
  }

  const summary = Object.fromEntries(scenarios.map((scenario) => {
    const key = String(scenario);
    const report = robustnessReport(trades, { value: (trade) => trade.pnl[key], cluster: (trade) => trade.exitDate.slice(0, 7) });
    return [key, report];
  }));
  return {
    schemaVersion: 1, study: 'P1 low-turnover positional NIFTY futures trend benchmark',
    period: { startDate, endDate }, rules: POSITIONAL_FUTURES_RULES,
    coverage: { eligibleSessions, missingSessions, missingRate: eligibleSessions ? missingSessions / eligibleSessions : null },
    summary, trades,
  };
}

export function annualPerformance(trades, scenario = '0.5') {
  const years = [...new Set(trades.map((trade) => trade.exitDate.slice(0, 4)))];
  return Object.fromEntries(years.map((year) => [year, summarizePerformance(trades.filter((trade) => trade.exitDate.startsWith(year)).map((trade) => trade.pnl[scenario]))]));
}
