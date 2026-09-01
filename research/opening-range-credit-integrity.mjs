import fs from 'node:fs';

export function validateOpeningRangeCredit(document) {
  const errors = [];
  const warnings = [];
  if (document?.strategy !== 'opening-range-atm-credit-spread') errors.push('Incorrect strategy');
  if (document?.period?.startDate !== '2020-01-01' || document?.period?.endDate !== '2024-12-31') errors.push('Discovery period changed');
  if (document?.shardCount !== 60) errors.push('All 60 shards are required');
  if (document?.rules?.hedgeWidth !== 300 || document?.rules?.rangeEnd !== '09:44' || document?.rules?.exit !== '15:15') errors.push('Frozen rules changed');
  for (const [index, row] of (document?.results ?? []).entries()) {
    const label = `${row.date ?? index}`;
    if (!['TRADE', 'NO_TRADE', 'DATA_MISSING'].includes(row.status)) errors.push(`${label}: invalid status`);
    if (row.status !== 'TRADE') continue;
    if (!(row.entryTimestamp > row.signal.confirmationTimestamp)) errors.push(`${label}: non-causal entry`);
    if (!(row.exitTimestamp > row.entryTimestamp)) errors.push(`${label}: non-causal exit`);
    if (Math.abs(row.selection.short.strike - row.selection.long.strike) !== 300) errors.push(`${label}: incorrect hedge width`);
    if (row.signal.direction === 'UP' && row.selection.short.optionType !== 'PE') errors.push(`${label}: wrong upward-break option type`);
    if (row.signal.direction === 'DOWN' && row.selection.short.optionType !== 'CE') errors.push(`${label}: wrong downward-break option type`);
    for (const scenario of ['normalized', 'stress0_5', 'stress1_0']) if (!Number.isFinite(row.costs?.[scenario]?.netPnl)) errors.push(`${label}: invalid ${scenario} P&L`);
  }
  const missing = (document?.results ?? []).filter((row) => row.status === 'DATA_MISSING').length;
  if (missing) warnings.push(`${missing} sessions have missing structural data`);
  return { valid: errors.length === 0, errors, warnings, sessions: document?.results?.length ?? 0, trades: document?.summary?.trades ?? 0, missing };
}

if (process.argv[1]?.endsWith('opening-range-credit-integrity.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const report = validateOpeningRangeCredit(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  fs.writeFileSync(arg('out'), JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}
