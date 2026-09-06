export const ROLLING_IV_RULES = Object.freeze({
  lookbackObservations: 52,
  percentileThreshold: 50,
  direction: 'AT_OR_ABOVE',
});

export function percentileAgainstPrior(value, priorValues) {
  if (!Number.isFinite(value) || !Array.isArray(priorValues) || !priorValues.length) return null;
  if (priorValues.some((entry) => !Number.isFinite(entry))) return null;
  return (priorValues.filter((entry) => entry <= value).length / priorValues.length) * 100;
}

export function classifyRollingRegime(value, priorValues, rules = ROLLING_IV_RULES) {
  if (!Array.isArray(priorValues) || priorValues.length !== rules.lookbackObservations) {
    return { status: 'INSUFFICIENT_HISTORY' };
  }
  const percentile = percentileAgainstPrior(value, priorValues);
  if (percentile == null) return { status: 'DATA_MISSING' };
  const passes = rules.direction === 'AT_OR_ABOVE'
    ? percentile >= rules.percentileThreshold
    : percentile <= rules.percentileThreshold;
  return { status: passes ? 'REGIME_OPEN' : 'REGIME_SKIPPED', percentile };
}

export function applyRollingIvFilter(results, rules = ROLLING_IV_RULES) {
  const ordered = [...(results ?? [])].sort((a, b) => String(a?.date).localeCompare(String(b?.date)));
  const history = [];
  return ordered.map((result) => {
    const callIv = Number(result?.selection?.shortCall?.impliedVolatility);
    const putIv = Number(result?.selection?.shortPut?.impliedVolatility);
    const currentIv = Number.isFinite(callIv) && Number.isFinite(putIv) ? (callIv + putIv) / 2 : null;
    let classification;
    if (result?.status !== 'TRADE') classification = { status: result?.status ?? 'DATA_MISSING' };
    else if (currentIv == null) classification = { status: 'DATA_MISSING' };
    else classification = classifyRollingRegime(currentIv, history.slice(-rules.lookbackObservations), rules);
    if (currentIv != null) history.push(currentIv);
    return { ...result, regime: { ...classification, averageShortIv: currentIv } };
  });
}
