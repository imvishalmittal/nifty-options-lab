import fs from 'node:fs';

function timeOf(timestamp) {
  return String(timestamp).slice(11, 16);
}

export function validateUnderlyingVariants(document, { maximumTradesPerDate = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(document?.variants) || document.variants.length === 0) errors.push('variants must be non-empty');
  for (const variant of document?.variants ?? []) {
    if (!variant.key) errors.push('variant key is required');
    if (!Array.isArray(variant.result?.trades)) {
      errors.push(`${variant.key}: trades must be an array`);
      continue;
    }
    const symbolDates = new Set();
    const dateCounts = new Map();
    for (const trade of variant.result.trades) {
      const key = `${trade.date}:${trade.symbol}`;
      if (symbolDates.has(key)) errors.push(`${variant.key}: duplicate symbol/date ${key}`);
      symbolDates.add(key);
      dateCounts.set(trade.date, (dateCounts.get(trade.date) ?? 0) + 1);
      const signalTime = trade.signalTime ?? trade.openingTime;
      if (!signalTime || !trade.entryTime || trade.entryTime <= signalTime) errors.push(`${variant.key}: non-causal entry ${key}`);
      if (!trade.exitTime || trade.exitTime < trade.entryTime) errors.push(`${variant.key}: invalid exit ordering ${key}`);
      if (timeOf(trade.exitTime) > '15:10') errors.push(`${variant.key}: exit after continuous-session cutoff ${key}`);
      if (!(trade.quantity > 0) || !(trade.riskPoints > 0)) errors.push(`${variant.key}: invalid sizing ${key}`);
      for (const scenario of ['normalized', 'stress2bps', 'stress5bps']) {
        if (!Number.isFinite(trade.costs?.[scenario]?.netPnl)) errors.push(`${variant.key}: missing ${scenario} costs ${key}`);
      }
    }
    if (maximumTradesPerDate != null) {
      for (const [date, count] of dateCounts) {
        if (count > maximumTradesPerDate) errors.push(`${variant.key}: ${count} trades exceed daily limit on ${date}`);
      }
    }
    if (variant.result.trades.length === 0) warnings.push(`${variant.key}: no trades`);
  }
  return { valid: errors.length === 0, errors, warnings };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...value] = arg.slice(2).split('=');
    return [key, value.join('=')];
  }));
  if (!args.in) throw new Error('--in is required');
  const report = validateUnderlyingVariants(JSON.parse(fs.readFileSync(args.in, 'utf8')), {
    maximumTradesPerDate: args['max-trades-per-date'] ? Number(args['max-trades-per-date']) : null,
  });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('underlying-result-integrity.mjs')) {
  try { main(); } catch (error) { console.error(error.stack || error.message); process.exit(1); }
}
