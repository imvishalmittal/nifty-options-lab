// Groww NSE equity-option charges used for historical validation.
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

export const GROWW_OPTION_RATES_PRE_APRIL_2026 = Object.freeze({
  ...GROWW_OPTION_RATES_2026,
  sttSellRate: 0.0010,             // 0.10% option premium sell from 2024-10-01 through 2026-03-31
});

export const GROWW_OPTION_RATES_PRE_OCTOBER_2024 = Object.freeze({
  ...GROWW_OPTION_RATES_2026,
  sttSellRate: 0.000625,           // 0.0625% option premium sell through 2024-09-30
});

export function growwOptionRatesForTradeDate(tradeDate = null) {
  if (tradeDate == null) return GROWW_OPTION_RATES_2026;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tradeDate))) throw new Error('tradeDate must be YYYY-MM-DD');
  const date = String(tradeDate);
  if (date < '2024-10-01') return GROWW_OPTION_RATES_PRE_OCTOBER_2024;
  if (date < '2026-04-01') return GROWW_OPTION_RATES_PRE_APRIL_2026;
  return GROWW_OPTION_RATES_2026;
}

export function calculateLongOptionRoundTripCosts({
  entryPremium,
  exitPremium,
  lotSize,
  tradeDate = null,
  rates = null,
  slippagePointsPerLeg = 0,
}) {
  if (!(entryPremium >= 0) || !(exitPremium >= 0)) throw new Error('entryPremium and exitPremium must be non-negative');
  if (!(lotSize > 0)) throw new Error('lotSize must be positive');
  if (!(slippagePointsPerLeg >= 0)) throw new Error('slippagePointsPerLeg must be non-negative');
  const appliedRates = rates ?? growwOptionRatesForTradeDate(tradeDate);

  // For a long option, adverse slippage raises the buy and lowers the sell.
  const effectiveEntry = entryPremium + slippagePointsPerLeg;
  const effectiveExit = Math.max(0, exitPremium - slippagePointsPerLeg);
  const buyTurnover = effectiveEntry * lotSize;
  const sellTurnover = effectiveExit * lotSize;
  const totalTurnover = buyTurnover + sellTurnover;

  const brokerage = appliedRates.brokeragePerOrder * 2;
  const exchange = totalTurnover * appliedRates.exchangeRate;
  const sebi = totalTurnover * appliedRates.sebiRate;
  const ipft = totalTurnover * appliedRates.ipftRate;
  const stampDuty = buyTurnover * appliedRates.stampDutyBuyRate;
  const stt = sellTurnover * appliedRates.sttSellRate;
  const gstBase = brokerage + exchange + sebi + ipft;
  const gst = gstBase * appliedRates.gstRate;
  const charges = brokerage + exchange + sebi + ipft + stampDuty + stt + gst;

  const grossPnl = (effectiveExit - effectiveEntry) * lotSize;
  const netPnl = grossPnl - charges;

  return {
    lotSize,
    tradeDate,
    sttSellRate: appliedRates.sttSellRate,
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
