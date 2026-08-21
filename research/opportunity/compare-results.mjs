import fs from 'node:fs';
import path from 'node:path';
import { STRATEGIES } from './opportunity-engine.mjs';
import { validateOpportunityResult } from './result-integrity.mjs';

function findConsolidated(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...findConsolidated(target));
    else if (entry.name === 'consolidated.json') output.push(target);
  }
  return output;
}

function metrics(document) {
  const trades = document.results.filter((row) => row.status === 'TRADE');
  const stressed = trades.map((row) => row.costs?.stress1_0?.netPnl).filter(Number.isFinite);
  const normalized = trades.map((row) => row.costs?.normalized?.netPnl).filter(Number.isFinite);
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const expectancy = (values) => values.length ? sum(values) / values.length : null;
  return {
    strategy: document.strategy,
    period: document.period,
    sessions: document.summary.observedSessions,
    trades: trades.length,
    tradeFrequency: document.summary.observedSessions ? trades.length / document.summary.observedSessions : null,
    winRate: document.summary.winRate,
    profitFactorBeforeCosts: document.summary.profitFactorBeforeCosts,
    expectancyPerUnitBeforeCosts: document.summary.expectancyPerUnitBeforeCosts,
    normalizedNetPnlRupees: normalized.length === trades.length ? sum(normalized) : null,
    normalizedExpectancyRupees: normalized.length === trades.length ? expectancy(normalized) : null,
    stress1NetPnlRupees: stressed.length === trades.length ? sum(stressed) : null,
    stress1ExpectancyRupees: stressed.length === trades.length ? expectancy(stressed) : null,
    maximumDrawdownRupeesStress1: document.summary.stress1_0?.maximumDrawdownRupees ?? null,
  };
}

export function compareDocuments(documents) {
  if (documents.length !== STRATEGIES.length) throw new Error(`Expected ${STRATEGIES.length} consolidated strategy documents`);
  const byStrategy = new Map(documents.map((document) => [document.strategy, document]));
  for (const strategy of STRATEGIES) if (!byStrategy.has(strategy)) throw new Error(`Missing strategy: ${strategy}`);
  const periods = new Set(documents.map((document) => `${document.period.startDate}:${document.period.endDate}`));
  if (periods.size !== 1) throw new Error('Strategy periods do not match; comparison would be biased');
  for (const document of documents) {
    const report = validateOpportunityResult(document);
    if (!report.valid) throw new Error(`${document.strategy} failed integrity: ${report.errors.join('; ')}`);
  }
  const table = documents.map(metrics);
  for (const row of table) {
    row.passesResearchGate = row.trades >= 30
      && row.profitFactorBeforeCosts >= 1.2
      && row.stress1NetPnlRupees > 0
      && row.stress1ExpectancyRupees > 0;
    row.gateReasons = [
      row.trades < 30 ? 'fewer than 30 trades' : null,
      !(row.profitFactorBeforeCosts >= 1.2) ? 'gross profit factor below 1.2' : null,
      !(row.stress1NetPnlRupees > 0) ? 'not profitable at 1-point slippage per leg' : null,
    ].filter(Boolean);
  }
  table.sort((a, b) => {
    if (a.passesResearchGate !== b.passesResearchGate) return a.passesResearchGate ? -1 : 1;
    return (b.stress1ExpectancyRupees ?? -Infinity) - (a.stress1ExpectancyRupees ?? -Infinity);
  });
  return {
    schemaVersion: 1,
    researchOnly: true,
    period: documents[0].period,
    rankingBasis: 'Gate on sample size, gross profit factor and 1-point-per-leg slippage; rank by stressed net expectancy.',
    promotionDecision: 'NONE_AUTOMATIC',
    strategies: table,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...value] = arg.slice(2).split('=');
    return [key, value.join('=')];
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir || !args.out) throw new Error('--dir and --out are required');
  const documents = findConsolidated(args.dir).map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  const comparison = compareDocuments(documents);
  fs.writeFileSync(args.out, JSON.stringify(comparison, null, 2));
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('compare-results.mjs')) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}
