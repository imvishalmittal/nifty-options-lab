import fs from 'node:fs';
import { evaluateRiskCapGates } from './profit-only-risk-cap-gates.mjs';

export const DISCOVERY_PASSED_RISK_CAP_CANDIDATES = Object.freeze([
  ['RETEST15_CONFIRM_BE_10', 'combined'],
  ['RETEST15_CONFIRM_BE_10', 'PE'],
  ['RETEST15_CONFIRM_BE_10_CAP_5', 'combined'],
  ['RETEST15_CONFIRM_BE_10_CAP_5', 'CE'],
  ['RETEST15_CONFIRM_BE_10_CAP_10', 'combined'],
  ['RETEST15_CONFIRM_BE_10_CAP_10', 'PE'],
  ['RETEST15_CONFIRM_BE_10_CAP_15', 'combined'],
  ['RETEST15_CONFIRM_BE_10_CAP_15', 'PE'],
  ['PREVIOUS_DAY_BREAK_CONFIRM_BE_10', 'combined'],
  ['PREVIOUS_DAY_BREAK_CONFIRM_BE_10', 'CE'],
  ['PREVIOUS_DAY_BREAK_CONFIRM_BE_10', 'PE'],
  ['PREVIOUS_DAY_BREAK_CONFIRM_BE_10_CAP_10', 'combined'],
  ['PREVIOUS_DAY_BREAK_CONFIRM_BE_10_CAP_10', 'PE'],
  ['PREVIOUS_DAY_BREAK_CONFIRM_BE_10_CAP_15', 'CE'],
]);

export function evaluateRiskCapValidationGates(result) {
  const evaluated = evaluateRiskCapGates(result);
  const candidates = DISCOVERY_PASSED_RISK_CAP_CANDIDATES.map(([key, side]) => ({
    key,
    side,
    ...evaluated.variants[key][side],
  }));
  const passedCandidates = candidates.filter((candidate) => candidate.passed).map(({ key, side }) => ({ key, side }));
  return {
    schemaVersion: 1,
    study: 'Profit-only maximum initial-risk caps — untouched validation',
    discoveryCandidateCount: candidates.length,
    candidates,
    passedCandidates,
    passed: passedCandidates.length > 0,
    decision: passedCandidates.length ? 'REVIEW_VALIDATED_CANDIDATES' : 'REJECT_AT_VALIDATION',
  };
}

if (process.argv[1]?.endsWith('profit-only-risk-cap-validation-gates.mjs')) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const gate = evaluateRiskCapValidationGates(JSON.parse(fs.readFileSync(arg('in'), 'utf8')));
  if (arg('out')) fs.writeFileSync(arg('out'), `${JSON.stringify(gate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
  if (arg('enforce') === 'true' && !gate.passed) process.exitCode = 1;
}
