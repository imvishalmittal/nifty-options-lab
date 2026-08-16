import fs from 'node:fs';

export function validateNifty180Result(result) {
  const diagnostics = result?.diagnostics ?? {};
  const blockers = [];
  const missingDays = Number(diagnostics.missingDays ?? 0);
  const boundaryDays = Number(diagnostics.boundaryDays ?? 0);
  const ambiguousDays = Number(diagnostics.ambiguousDays ?? 0);

  if (missingDays > 0) blockers.push(`${missingDays} DATA_MISSING session(s)`);
  if (boundaryDays > 0) blockers.push(`${boundaryDays} CANDIDATE_BOUNDARY session(s)`);
  if (ambiguousDays > 0) blockers.push(`${ambiguousDays} AMBIGUOUS session(s)`);

  return {
    valid: blockers.length === 0,
    blockers,
    tradingDates: Number(diagnostics.tradingDates ?? 0),
    scoredTrades: Number(diagnostics.scoredTrades ?? 0),
  };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node research/validate-nifty-180-result.mjs <result.json>');
    process.exit(2);
  }
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  const validation = validateNifty180Result(result);
  process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
  if (!validation.valid) process.exit(1);
}

if (process.argv[1]?.endsWith('validate-nifty-180-result.mjs')) main();
