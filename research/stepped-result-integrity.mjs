import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function steppedIntegrityIssues(result) {
  const issues = [];
  const d = result?.baselineDiagnostics ?? {};
  for (const field of ['missingDays', 'boundaryDays', 'ambiguousDays', 'rateLimitRetries']) {
    const value = Number(d[field] ?? 0);
    if (value !== 0) issues.push(`${field}=${value}`);
  }

  const expectedTrades = Number(d.scoredTrades ?? 0);
  for (const step of ['5', '10']) {
    const rows = result?.variants?.[step]?.trades;
    if (!Array.isArray(rows)) {
      issues.push(`step ${step}: trades missing`);
      continue;
    }
    if (rows.length !== expectedTrades) issues.push(`step ${step}: ${rows.length} trades != baseline ${expectedTrades}`);
  }
  return issues;
}

export function isCompleteSteppedResult(result) {
  return steppedIntegrityIssues(result).length === 0;
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node research/stepped-result-integrity.mjs <result.json>');
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  const issues = steppedIntegrityIssues(result);
  if (issues.length) {
    console.error(`Incomplete stepped research artifact: ${issues.join(', ')}`);
    process.exit(1);
  }
  console.log('Stepped research artifact is complete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
