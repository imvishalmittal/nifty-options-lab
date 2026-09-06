import { calculateLongOptionRoundTripCosts } from '../research/groww-option-costs.mjs';

export function paperOptionCosts(entry, exit, units, tradeDate) {
  const result = calculateLongOptionRoundTripCosts({
    entryPremium: entry,
    exitPremium: exit,
    lotSize: units,
    tradeDate,
  });
  return {
    gross: result.grossPnl,
    charges: result.charges.total,
    net: result.netPnl,
  };
}
