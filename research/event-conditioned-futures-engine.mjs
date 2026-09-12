import { futuresRoundTripCosts, selectFrontContract } from './positional-futures-engine.mjs';
import { niftyLotSizeForExpiry } from './opportunity/opportunity-engine.mjs';
import { robustnessReport } from './performance-statistics.mjs';

export const EVENT_FUTURES_RULES = Object.freeze({
  context: 'Latest completed S&P 500 and Nasdaq sessions whose calendar date precedes the NIFTY session',
  long: 'Both US indices closed at least +0.5% versus their prior closes',
  short: 'Both US indices closed at most -0.5% versus their prior closes',
  entry: 'One actual NIFTY futures lot at that India session open',
  exit: 'Same contract at that India session settlement; no overnight India position',
  contract: 'Nearest actual NIFTY FUTIDX contract with at least seven calendar days remaining',
  costs: 'Date-sensitive charges and 0.5/1/2 futures points adverse slippage per side',
});

function returns(rows) {
  return rows.map((row, index) => ({ ...row, returnPct: index ? (row.close / rows[index - 1].close - 1) * 100 : null }));
}

export function alignUsContext(sp500, nasdaq, indiaDates) {
  const sp = returns(sp500); const nqByDate = new Map(returns(nasdaq).map((row) => [row.date, row.returnPct]));
  let cursor = 0;
  return new Map(indiaDates.flatMap((indiaDate) => {
    while (cursor + 1 < sp.length && sp[cursor + 1].date < indiaDate) cursor += 1;
    const row = sp[cursor];
    return row?.date < indiaDate && Number.isFinite(row.returnPct) && Number.isFinite(nqByDate.get(row.date))
      ? [[indiaDate, { usDate: row.date, sp500ReturnPct: row.returnPct, nasdaqReturnPct: nqByDate.get(row.date) }]] : [];
  }));
}

export function eventDirection(context) {
  if (context.sp500ReturnPct >= 0.5 && context.nasdaqReturnPct >= 0.5) return 'LONG';
  if (context.sp500ReturnPct <= -0.5 && context.nasdaqReturnPct <= -0.5) return 'SHORT';
  return null;
}

export function backtestEventConditionedFutures(rows, contexts, { startDate = '2016-01-01', endDate = '2022-12-31' } = {}) {
  const scenarios = [0.5, 1, 2]; const trades = []; let eligibleSessions = 0; let missingSessions = 0;
  for (const row of rows.filter((item) => item.date >= startDate && item.date <= endDate).sort((a, b) => a.date.localeCompare(b.date))) {
    const context = contexts.get(row.date); if (!context) { missingSessions += 1; continue; }
    const direction = eventDirection(context); if (!direction) continue;
    eligibleSessions += 1; const contract = selectFrontContract(row.contracts ?? [], row.date);
    if (!contract) { missingSessions += 1; continue; }
    const lotSize = niftyLotSizeForExpiry(contract.expiry); const multiplier = direction === 'LONG' ? 1 : -1;
    const pnl = Object.fromEntries(scenarios.map((scenario) => {
      const costs = futuresRoundTripCosts({ entryPrice: direction === 'LONG' ? contract.open : contract.settle, exitPrice: direction === 'LONG' ? contract.settle : contract.open, lotSize, tradeDate: row.date, slippagePointsPerSide: scenario });
      return [String(scenario), (contract.settle - contract.open) * multiplier * lotSize - costs.total - scenario * 2 * lotSize];
    }));
    trades.push({ date: row.date, ...context, direction, expiry: contract.expiry, entryPrice: contract.open, exitPrice: contract.settle, lotSize, pnl });
  }
  return { schemaVersion: 1, study: 'P5 US-close-conditioned NIFTY futures', period: { startDate, endDate }, rules: EVENT_FUTURES_RULES, coverage: { eligibleSessions, missingSessions, missingRate: eligibleSessions ? missingSessions / eligibleSessions : null }, summary: Object.fromEntries(scenarios.map((scenario) => [String(scenario), robustnessReport(trades, { value: (trade) => trade.pnl[String(scenario)], cluster: (trade) => trade.date.slice(0, 7) })])), trades };
}
