import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function momentumIntegrityIssues(result) {
  const issues = [];
  const d = result?.baselineDiagnostics ?? {};
  for (const field of ['missingDays', 'boundaryDays', 'ambiguousDays', 'rateLimitRetries']) {
    const value = Number(d[field] ?? 0);
    if (value !== 0) issues.push(`${field}=${value}`);
  }

  const expectedTrades = Number(d.scoredTrades ?? 0);
  const variants = result?.variants ?? {};
  for (const gap of ['5', '10', '15', '20']) {
    const rows = variants?.[gap]?.trades;
    if (!Array.isArray(rows)) {
      issues.push(`trail ${gap}: trades missing`);
      continue;
    }
    if (rows.length !== expectedTrades) {
      issues.push(`trail ${gap}: ${rows.length} trades != baseline ${expectedTrades}`);
    }
  }
  return issues;
}

export function isCompleteMomentumResult(result) {
  return momentumIntegrityIssues(result).length === 0;
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node research/momentum-result-integrity.mjs <result.json>');
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  const issues = momentumIntegrityIssues(result);
  if (issues.length) {
    console.error(`Incomplete momentum research artifact: ${issues.join(', ')}`);
    process.exit(1);
  }
  console.log('Momentum research artifact is complete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
