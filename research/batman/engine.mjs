import { calculateOptionRoundTripCosts } from '../groww-option-costs.mjs';
import { parseNiftyOptionContract } from '../nifty-180-premium-strategy.mjs';

export const BATMAN_STRATEGY = 'defined-risk-weekly-batman';
export const BATMAN_RULES = Object.freeze({
  entryTime: '15:15',
  exitTime: '15:15',
  minimumDte: 6,
  maximumDte: 6,
  innerDistancePct: 0.01,
  bodyDistancePct: 0.02,
  outerDistancePct: 0.03,
});

export const BATMAN_LEGS = Object.freeze([
  ['innerCall', 'CE', 'LONG', 1], ['bodyCall', 'CE', 'SHORT', 2], ['outerCall', 'CE', 'LONG', 1],
  ['innerPut', 'PE', 'LONG', 1], ['bodyPut', 'PE', 'SHORT', 2], ['outerPut', 'PE', 'LONG', 1],
]);

function nearestStrike(strikes, target) {
  return [...strikes].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0] ?? null;
}

export function selectBatmanContracts(contracts, spot, rules = BATMAN_RULES) {
  if (!(spot > 0)) return null;
  const parsed = contracts.map((row) => parseNiftyOptionContract(row.symbol ?? row.groww_symbol ?? row)).filter(Boolean);
  const calls = parsed.filter((row) => row.optionType === 'CE');
  const puts = parsed.filter((row) => row.optionType === 'PE');
  const callStrikes = calls.map((row) => row.strike);
  const putStrikes = puts.map((row) => row.strike);
  const targets = {
    innerCall: spot * (1 + rules.innerDistancePct), bodyCall: spot * (1 + rules.bodyDistancePct), outerCall: spot * (1 + rules.outerDistancePct),
    innerPut: spot * (1 - rules.innerDistancePct), bodyPut: spot * (1 - rules.bodyDistancePct), outerPut: spot * (1 - rules.outerDistancePct),
  };
  const selected = {};
  for (const [name, optionType, side, quantity] of BATMAN_LEGS) {
    const pool = optionType === 'CE' ? calls : puts;
    const strike = nearestStrike(optionType === 'CE' ? callStrikes : putStrikes, targets[name]);
    const contract = pool.find((row) => row.strike === strike);
    if (!contract) return null;
    selected[name] = { ...contract, side, quantity, target: targets[name] };
  }
  if (!(selected.innerCall.strike < selected.bodyCall.strike && selected.bodyCall.strike < selected.outerCall.strike
    && selected.innerPut.strike > selected.bodyPut.strike && selected.bodyPut.strike > selected.outerPut.strike)) return null;
  return selected;
}

export function evaluateBatmanPosition({ selection, entryQuotes, exitQuotes, lotSize, tradeDate, slippagePointsPerLeg = 0 }) {
  const legs = {};
  for (const [name, , side, quantity] of BATMAN_LEGS) {
    if (!(entryQuotes[name] > 0) || !(exitQuotes[name] >= 0)) return { status: 'DATA_MISSING', reason: `${name} quote unavailable` };
    legs[name] = calculateOptionRoundTripCosts({
      entryPremium: entryQuotes[name], exitPremium: exitQuotes[name], lotSize: lotSize * quantity,
      tradeDate, slippagePointsPerLeg, side,
    });
  }
  const grossPnlRupees = Object.values(legs).reduce((sum, row) => sum + row.grossPnl, 0);
  const chargesRupees = Object.values(legs).reduce((sum, row) => sum + row.charges.total, 0);
  return { status: 'TRADE', grossPnlRupees, chargesRupees, netPnlRupees: grossPnlRupees - chargesRupees, legs };
}

function maximumDrawdown(values) {
  let equity = 0; let peak = 0; let drawdown = 0;
  for (const value of values) { equity += value; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); }
  return drawdown;
}

export function summarizeBatmanResults(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const scenario = (name) => {
    const values = trades.map((row) => row.costs?.[name]?.netPnlRupees).filter(Number.isFinite);
    const wins = values.filter((value) => value > 0); const losses = values.filter((value) => value < 0);
    const profit = wins.reduce((sum, value) => sum + value, 0); const loss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
    return { totalNetPnlRupees: values.reduce((sum, value) => sum + value, 0), expectancyRupees: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, winRate: values.length ? wins.length / values.length : null, profitFactor: loss ? profit / loss : null, maximumDrawdownRupees: maximumDrawdown(values) };
  };
  return { sessions: results.length, trades: trades.length, dataMissing: results.filter((row) => row.status === 'DATA_MISSING').length, normalized: scenario('normalized'), stress0_5: scenario('stress0_5'), stress1_0: scenario('stress1_0') };
}
