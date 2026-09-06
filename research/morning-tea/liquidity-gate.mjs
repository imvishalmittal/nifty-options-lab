// Frozen before symbol-level P&L was inspected. These are the first six names
// in the original fixed universe and form an execution-quality hypothesis,
// not a claim that historical bid/ask spreads are available in candle data.
export const MORNING_TEA_LIQUIDITY_GATE = Object.freeze({
  symbols: Object.freeze(['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'INFY', 'TCS']),
});

export function applyMorningTeaLiquidityGate(results, rules = MORNING_TEA_LIQUIDITY_GATE) {
  const allowed = new Set(rules.symbols);
  return (results ?? []).map((result) => {
    if (result?.status !== 'TRADE') return { ...result, liquidityGate: { status: result?.status ?? 'DATA_MISSING' } };
    const symbol = result?.signal?.symbol;
    if (!symbol) return { ...result, liquidityGate: { status: 'DATA_MISSING' } };
    return { ...result, liquidityGate: { status: allowed.has(symbol) ? 'LIQUIDITY_OPEN' : 'LIQUIDITY_SKIPPED', symbol } };
  });
}
