import fs from 'node:fs';
import { diagnoseStrategyArtifact } from '../artifact-strategy-diagnostics.mjs';
import { applyMorningTeaLiquidityGate, MORNING_TEA_LIQUIDITY_GATE } from './liquidity-gate.mjs';

export function backtestMorningTeaLiquidityGate(document, rules = MORNING_TEA_LIQUIDITY_GATE) {
  const classified = applyMorningTeaLiquidityGate(document?.results, rules);
  const accepted = classified.filter((row) => row.liquidityGate?.status === 'LIQUIDITY_OPEN');
  const diagnostic = (scenario) => diagnoseStrategyArtifact({ strategy: document?.strategy, results: accepted }, scenario);
  return {
    schemaVersion: 1,
    strategy: `${document?.strategy ?? 'morning-tea'}-six-name-liquidity-gate`,
    evidenceClass: 'POST_HOC_PERIOD_DIAGNOSTIC',
    warning: 'Historical candles contain no bid/ask spread. This fixed-name gate is only a liquidity proxy and cannot prove achievable fills.',
    rules,
    counts: { retainedTrades: accepted.length, skippedTrades: classified.filter((row) => row.liquidityGate?.status === 'LIQUIDITY_SKIPPED').length },
    normalized: diagnostic('normalized'),
    stress0_1: diagnostic('stress0_1'),
    stress0_25: diagnostic('stress0_25'),
    stress0_5: diagnostic('stress0_5'),
    stress1_0: diagnostic('stress1_0'),
  };
}

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) throw new Error('Usage: node research/morning-tea/backtest-liquidity-gate.mjs <result.json> [output.json]');
  const report = backtestMorningTeaLiquidityGate(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) fs.writeFileSync(outputPath, json);
  else process.stdout.write(json);
}

if (process.argv[1]?.endsWith('backtest-liquidity-gate.mjs')) main();
