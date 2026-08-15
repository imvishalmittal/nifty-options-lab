// Groww NSE equity-option charges used for the 2026 validation path.
// Rates are configurable so older periods can use historically correct schedules.
export const GROWW_OPTION_RATES_2026 = Object.freeze({
  brokeragePerOrder: 20,
  stampDutyBuyRate: 0.00003,       // 0.003% on buy premium turnover
  exchangeRate: 0.0003503,        // NSE 0.03503% on premium turnover, buy + sell
  sebiRate: 0.000001,              // 0.0001% buy + sell
  ipftRate: 0.000005,              // 0.0005% buy + sell
  sttSellRate: 0.0015,             // 0.15% option premium sell, effective 2026-04-01
  gstRate: 0.18,
});

export function calculateLongOptionRoundTripCosts({
  entryPremium,
  exitPremium,
  lotSize,
  rates = GROWW_OPTION_RATES_2026,
  slippagePointsPerLeg = 0,
}) {
  if (!(entryPremium >= 0) || !(exitPremium >= 0)) throw new Error('entryPremium and exitPremium must be non-negative');
  if (!(lotSize > 0)) throw new Error('lotSize must be positive');
  if (!(slippagePointsPerLeg >= 0)) throw new Error('slippagePointsPerLeg must be non-negative');

  // For a long option, adverse slippage raises the buy and lowers the sell.
  const effectiveEntry = entryPremium + slippagePointsPerLeg;
  const effectiveExit = Math.max(0, exitPremium - slippagePointsPerLeg);
  const buyTurnover = effectiveEntry * lotSize;
  const sellTurnover = effectiveExit * lotSize;
  const totalTurnover = buyTurnover + sellTurnover;

  const brokerage = rates.brokeragePerOrder * 2;
  const exchange = totalTurnover * rates.exchangeRate;
  const sebi = totalTurnover * rates.sebiRate;
  const ipft = totalTurnover * rates.ipftRate;
  const stampDuty = buyTurnover * rates.stampDutyBuyRate;
  const stt = sellTurnover * rates.sttSellRate;
  const gstBase = brokerage + exchange + sebi + ipft;
  const gst = gstBase * rates.gstRate;
  const charges = brokerage + exchange + sebi + ipft + stampDuty + stt + gst;

  const grossPnl = (effectiveExit - effectiveEntry) * lotSize;
  const netPnl = grossPnl - charges;

  return {
    lotSize,
    slippagePointsPerLeg,
    effectiveEntry,
    effectiveExit,
    buyTurnover,
    sellTurnover,
    grossPnl,
    charges: {
      brokerage,
      exchange,
      sebi,
      ipft,
      stampDuty,
      stt,
      gst,
      total: charges,
    },
    netPnl,
    netPnlPerUnit: netPnl / lotSize,
  };
}
