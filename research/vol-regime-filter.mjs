export const VOL_REGIME_RULES = Object.freeze({
  lookbackTradingDays: 252,
  percentileThreshold: 50,
  direction: 'AT_OR_BELOW',
});

export function percentileRank(value, series) {
  if (!Number.isFinite(value) || !Array.isArray(series) || !series.length) return null;
  if (series.some((entry) => !Number.isFinite(entry))) return null;
  return (series.filter((entry) => entry <= value).length / series.length) * 100;
}

export function classifyVolRegime({ vixReferenceClose, vixHistory, rules = VOL_REGIME_RULES } = {}) {
  if (!Array.isArray(vixHistory) || vixHistory.length !== rules.lookbackTradingDays) {
    return { status: 'INSUFFICIENT_HISTORY' };
  }
  const percentile = percentileRank(vixReferenceClose, vixHistory);
  if (percentile == null) return { status: 'DATA_MISSING' };
  const passes = rules.direction === 'AT_OR_BELOW'
    ? percentile <= rules.percentileThreshold
    : percentile >= rules.percentileThreshold;
  return { status: passes ? 'REGIME_OPEN' : 'REGIME_SKIPPED', percentile };
}

export function classifyVolRegimeForSession({
  sessionDate,
  expectedReferenceDate,
  vixRows,
  rules = VOL_REGIME_RULES,
} = {}) {
  if (!sessionDate || !Array.isArray(vixRows)) return { status: 'INSUFFICIENT_HISTORY' };
  const seen = new Set();
  const sorted = [];
  for (const row of vixRows) {
    if (!row || typeof row.date !== 'string' || !Number.isFinite(row.close)) continue;
    if (seen.has(row.date)) return { status: 'DATA_INVALID', reason: `Duplicate VIX date: ${row.date}` };
    seen.add(row.date);
    sorted.push({ date: row.date, close: row.close });
  }
  sorted.sort((a, b) => a.date.localeCompare(b.date));
  const priorRows = sorted.filter((row) => row.date < sessionDate);
  if (!priorRows.length) return { status: 'INSUFFICIENT_HISTORY' };
  const reference = priorRows.at(-1);
  if (expectedReferenceDate && reference.date !== expectedReferenceDate) {
    return { status: 'DATA_MISSING', reason: `Expected VIX reference ${expectedReferenceDate}, found ${reference.date}` };
  }
  const history = priorRows.slice(-rules.lookbackTradingDays);
  const classification = classifyVolRegime({ vixReferenceClose: reference.close, vixHistory: history.map((row) => row.close), rules });
  return { ...classification, referenceDate: reference.date, referenceClose: reference.close };
}
