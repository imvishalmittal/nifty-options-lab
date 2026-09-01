import fs from 'node:fs';

const EXPECTED = Object.freeze({
  'weekly-smart': { strategy: 'weekly-nifty-008-delta-condor', targets: { shortCallDelta: 0.08, shortPutDelta: -0.08, longCallDelta: 0.03, longPutDelta: -0.03 } },
  'monthly-rsi': { strategy: 'monthly-large-cap-rsi-condor', targets: { dailyRsiMax: 50, weeklyRsiMax: 50, shortCallDelta: 0.10, shortPutDelta: -0.12, longCallDelta: 0.05, longPutDelta: -0.06, gapLimit: 0.12 } },
});
const MONTHLY_UNDERLYINGS = new Set(['SBIN', 'RELIANCE', 'TCS', 'INFY', 'WIPRO', 'CIPLA', 'DRREDDY', 'SUNPHARMA', 'BAJAJ-AUTO', 'ASIANPAINT']);

export function validateDeltaCondor(document, mode) {
  const errors = [];
  const warnings = [];
  const expected = EXPECTED[mode];
  if (!expected) errors.push('Unknown mode');
  if (document?.mode !== mode || document?.strategy !== expected?.strategy) errors.push('Strategy or mode mismatch');
  if (document?.period?.startDate !== '2020-01-01' || document?.period?.endDate !== '2024-12-31') errors.push('Discovery period changed');
  if (document?.shardCount !== 60) errors.push('All 60 monthly shards are required');
  if (JSON.stringify(document?.rules?.targets) !== JSON.stringify(expected?.targets)) errors.push('Frozen delta/filter targets changed');
  if (document?.rules?.lifecycle?.targetDebitRatio !== 0.5 || document?.rules?.lifecycle?.stopDebitRatio !== 2) errors.push('Frozen lifecycle changed');
  for (const [index, row] of (document?.results ?? []).entries()) {
    const label = `${row.date ?? index}:${row.underlying ?? 'unknown'}`;
    if (!['TRADE', 'NO_TRADE', 'DATA_MISSING'].includes(row.status)) errors.push(`${label}: invalid status`);
    if (!(row.previousExpiry < row.date && row.date < row.expiry)) errors.push(`${label}: entry is not the causal post-expiry session`);
    if (mode === 'weekly-smart' && row.underlying !== 'NIFTY') errors.push(`${label}: weekly underlying changed`);
    if (mode === 'monthly-rsi' && !MONTHLY_UNDERLYINGS.has(row.underlying)) errors.push(`${label}: monthly watchlist changed`);
    if (row.status !== 'TRADE') continue;
    if (!(row.entryTimestamp?.startsWith(row.date) && row.entryTimestamp.slice(11, 16) === '09:45')) errors.push(`${label}: entry timestamp changed`);
    if (!(row.exitTimestamp > row.entryTimestamp && row.exitTimestamp.slice(0, 10) < row.expiry)) errors.push(`${label}: non-causal or post-expiry exit`);
    const { shortCall, shortPut, longCall, longPut } = row.selection;
    if (!(longCall.strike > shortCall.strike && longPut.strike < shortPut.strike)) errors.push(`${label}: hedges are not farther OTM`);
    if (!(shortCall.optionType === 'CE' && longCall.optionType === 'CE' && shortPut.optionType === 'PE' && longPut.optionType === 'PE')) errors.push(`${label}: option types invalid`);
    if (![shortCall.delta, shortPut.delta, longCall.delta, longPut.delta].every(Number.isFinite)) errors.push(`${label}: reconstructed deltas missing`);
    if (mode === 'monthly-rsi' && !(row.filters?.dailyRsi < 50 && row.filters?.weeklyRsi < 50 && row.filters?.gap <= 0.12)) errors.push(`${label}: monthly RSI/discontinuity evidence invalid`);
    if (!(row.entryCredit > 0)) errors.push(`${label}: entry is not a credit`);
    if (!(row.lotSize > 0)) errors.push(`${label}: historical lot size missing`);
    for (const scenario of ['normalized', 'stress0_5', 'stress1_0']) if (!Number.isFinite(row.costs?.[scenario]?.netPnl)) errors.push(`${label}: invalid ${scenario} P&L`);
  }
  const missing = (document?.results ?? []).filter((row) => row.status === 'DATA_MISSING').length;
  if (missing) warnings.push(`${missing} scheduled observations have missing structural data`);
  return { valid: errors.length === 0, errors, warnings, observations: document?.results?.length ?? 0, trades: document?.summary?.trades ?? 0, missing };
}

if (process.argv[1]?.endsWith('delta-condor-integrity.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const report = validateDeltaCondor(JSON.parse(fs.readFileSync(arg('in'), 'utf8')), arg('mode'));
  fs.writeFileSync(arg('out'), JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}
