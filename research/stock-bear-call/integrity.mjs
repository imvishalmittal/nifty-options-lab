import fs from 'node:fs';
import { BEAR_CALL_STRATEGY, VIDEO_STOCK_UNIVERSE } from './engine.mjs';

export function validateBearCallResult(document) {
  const errors = [];
  const warnings = [];
  if (document?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (document?.strategy !== BEAR_CALL_STRATEGY) errors.push(`strategy must be ${BEAR_CALL_STRATEGY}`);
  if (document?.source?.videoId !== 'd3X5TNpZ0NM') errors.push('incorrect source video');
  if (document?.period?.startDate !== '2026-06-04') errors.push('post-publication start must remain 2026-06-04');
  if (JSON.stringify(document?.universe) !== JSON.stringify(VIDEO_STOCK_UNIVERSE)) errors.push('video universe changed');
  if (document?.rules?.williamsPeriod !== 140) errors.push('Williams %R period changed');
  if (document?.rules?.overboughtThreshold !== -20) errors.push('Williams %R threshold changed');
  if (document?.rules?.maximumShortDelta !== 0.25) errors.push('maximum short delta changed');
  if (document?.rules?.hedgeStrikeSteps !== 2) errors.push('hedge width assumption changed');
  if (!Array.isArray(document?.results)) errors.push('results must be an array');
  if (!Array.isArray(document?.diagnostics) || document.diagnostics.length !== VIDEO_STOCK_UNIVERSE.length) errors.push('per-stock diagnostics incomplete');
  for (const row of document?.diagnostics ?? []) {
    if (!(row.minuteCandles > 0)) errors.push(`${row.underlying}: underlying candles unavailable`);
    if (!(row.completedTwoHourBars >= 140)) errors.push(`${row.underlying}: Williams warmup incomplete`);
    if (!(row.evaluationBars > 0)) errors.push(`${row.underlying}: evaluation bars unavailable`);
    if (row.jointSignals > row.williamsCrosses || row.jointSignals > row.bearishAlignments) errors.push(`${row.underlying}: diagnostic signal counts inconsistent`);
  }
  for (const [index, row] of (document?.results ?? []).entries()) {
    const label = `${row.underlying ?? 'unknown'} result ${index}`;
    if (!['TRADE', 'NO_TRADE', 'DATA_MISSING'].includes(row.status)) errors.push(`${label}: invalid status`);
    if (row.entryTimestamp && row.entryTimestamp <= row.signal?.signalTimestamp) errors.push(`${label}: non-causal entry`);
    if (row.expiry && row.expiry < row.date) errors.push(`${label}: expired contract`);
    if (row.selection) {
      if (!(row.selection.shortCall?.strike < row.selection.longCall?.strike)) errors.push(`${label}: hedge not above short call`);
      if (row.selection.shortCall?.delta < 0.20 || row.selection.shortCall?.delta > 0.25) errors.push(`${label}: short delta outside frozen band`);
    }
    if (row.status === 'TRADE') {
      if (!(row.exitTimestamp > row.entryTimestamp)) errors.push(`${label}: non-causal exit`);
      if (!(row.lotSize > 0)) errors.push(`${label}: missing lot size`);
      for (const scenario of ['normalized', 'stress0_5', 'stress1_0']) {
        if (row.costs?.[scenario]?.status !== 'TRADE' || !Number.isFinite(row.costs?.[scenario]?.netPnlRupees)) {
          errors.push(`${label}: invalid ${scenario} costs`);
        }
      }
    }
  }
  const missing = (document?.results ?? []).filter((row) => row.status === 'DATA_MISSING').length;
  if (missing) warnings.push(`${missing} signal(s) have missing contract or quote data`);
  if (document?.summary?.trades === 0) warnings.push('No trades executed; replication is inconclusive');
  if ((document?.diagnostics ?? []).reduce((sum, row) => sum + row.jointSignals, 0) === 0) warnings.push('No underlying produced the complete frozen signal');
  if (document?.summary?.trades !== (document?.results ?? []).filter((row) => row.status === 'TRADE').length) errors.push('summary trade count mismatch');
  return { valid: errors.length === 0, errors, warnings };
}

if (process.argv[1]?.endsWith('integrity.mjs')) {
  const input = process.argv.find((arg) => arg.startsWith('--in='))?.slice(5);
  const output = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
  if (!input) throw new Error('--in is required');
  const report = validateBearCallResult(JSON.parse(fs.readFileSync(input, 'utf8')));
  if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}
