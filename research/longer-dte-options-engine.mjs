import { addIndicators, desiredDirection } from './positional-futures-engine.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import { niftyLotSizeForExpiry } from './opportunity/opportunity-engine.mjs';
import { robustnessReport } from './performance-statistics.mjs';

const DAY_MS = 86_400_000;
export const LONGER_DTE_RULES = Object.freeze({
  signal: 'Same completed NIFTY SMA100 plus/minus 0.5 ATR20 direction as P1',
  contract: 'Actual listed ATM CE for long or ATM PE for short; expiry must be 20-45 DTE and is closest to 30 DTE',
  entry: 'Next-session option open after a new signal or roll',
  baselineExit: 'Next-session open after underlying direction reverses; roll when seven calendar days remain',
  premiumStopComparison: 'Alternative exits at 35% premium loss using daily open/low, then waits for a new underlying direction',
  size: 'One historical NIFTY option lot',
});

function dte(date, expiry) { return (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS; }

export function selectLongerDteOption(options, { date, spot, direction }) {
  const type = direction === 'LONG' ? 'CE' : 'PE';
  return options.filter((row) => row.optionType === type && dte(date, row.expiry) >= 20 && dte(date, row.expiry) <= 45 && Number.isFinite(row.open))
    .sort((a, b) => Math.abs(dte(date, a.expiry) - 30) - Math.abs(dte(date, b.expiry) - 30) || Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0] ?? null;
}

function closeTrade(position, exitDate, exitPrice, reason, scenario) {
  const costs = calculateLongOptionRoundTripCosts({ entryPremium: position.entryPrice, exitPremium: exitPrice, lotSize: position.lotSize, tradeDate: position.entryDate, slippagePointsPerLeg: scenario });
  return { entryDate: position.entryDate, exitDate, direction: position.direction, optionType: position.optionType, expiry: position.expiry, strike: position.strike, entryPrice: position.entryPrice, exitPrice, exitReason: reason, lotSize: position.lotSize, netPnl: costs.netPnl };
}

export function backtestLongerDteOptions(rawRows, { startDate = '2016-01-01', endDate = '2022-12-31', premiumStop = false } = {}) {
  const rows = addIndicators([...rawRows].sort((a, b) => a.date.localeCompare(b.date)));
  const scenarios = [0, 0.5, 1]; const tradesByScenario = Object.fromEntries(scenarios.map((value) => [String(value), []]));
  let direction = null; let pending = null; let position = null; let stoppedDirection = null; let eligibleSessions = 0; let missingSessions = 0;
  for (const row of rows) {
    if (row.date < startDate) { pending = desiredDirection(row, pending); direction = pending; continue; }
    if (row.date > endDate) break;
    eligibleSessions += 1;
    if (position) {
      const held = (row.options ?? []).find((option) => option.expiry === position.expiry && option.strike === position.strike && option.optionType === position.optionType);
      if (!held) { missingSessions += 1; continue; }
      const reversed = pending && pending !== position.direction;
      const roll = dte(row.date, position.expiry) <= 7;
      const stopPrice = position.entryPrice * 0.65;
      const stopped = premiumStop && (held.open <= stopPrice || held.low <= stopPrice);
      if (reversed || roll || stopped) {
        const exitPrice = stopped ? Math.min(held.open, stopPrice) : held.open;
        for (const scenario of scenarios) tradesByScenario[String(scenario)].push(closeTrade(position, row.date, exitPrice, stopped ? 'PREMIUM_STOP_35' : reversed ? 'UNDERLYING_REVERSAL' : 'ROLL', scenario));
        if (stopped) stoppedDirection = position.direction;
        position = null;
      }
    }
    if (pending && stoppedDirection && pending !== stoppedDirection) stoppedDirection = null;
    if (!position && pending && !stoppedDirection) {
      const selected = selectLongerDteOption(row.options ?? [], { date: row.date, spot: row.index.open, direction: pending });
      if (!selected) { missingSessions += 1; }
      else position = { direction: pending, optionType: selected.optionType, expiry: selected.expiry, strike: selected.strike, entryDate: row.date, entryPrice: selected.open, lotSize: niftyLotSizeForExpiry(selected.expiry) };
    }
    direction = pending; pending = desiredDirection(row, direction);
  }
  const last = rows.filter((row) => row.date >= startDate && row.date <= endDate).at(-1);
  if (position && last) {
    const held = (last.options ?? []).find((option) => option.expiry === position.expiry && option.strike === position.strike && option.optionType === position.optionType);
    if (held) for (const scenario of scenarios) tradesByScenario[String(scenario)].push(closeTrade(position, last.date, held.settle, 'PERIOD_END', scenario));
    else missingSessions += 1;
  }
  return { schemaVersion: 1, study: premiumStop ? 'P6 longer-DTE premium-stop comparator' : 'P2 longer-DTE underlying-invalidation baseline', period: { startDate, endDate }, rules: LONGER_DTE_RULES, coverage: { eligibleSessions, missingSessions, missingRate: eligibleSessions ? missingSessions / eligibleSessions : null }, summary: Object.fromEntries(scenarios.map((scenario) => [String(scenario), robustnessReport(tradesByScenario[String(scenario)], { value: (trade) => trade.netPnl, cluster: (trade) => trade.exitDate.slice(0, 7) })])), trades: tradesByScenario['0'] };
}
