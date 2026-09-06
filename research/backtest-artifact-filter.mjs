import fs from 'node:fs';
import { applyRollingIvFilter, ROLLING_IV_RULES } from './rolling-regime-filter.mjs';
import { diagnoseStrategyArtifact } from './artifact-strategy-diagnostics.mjs';

export function backtestRollingIvFilter(document, rules = ROLLING_IV_RULES) {
  const classified = applyRollingIvFilter(document?.results, rules);
  const acceptedResults = classified.filter((row) => row.regime?.status === 'REGIME_OPEN');
  const counts = classified.reduce((summary, row) => {
    const status = row.regime?.status ?? 'UNKNOWN';
    summary[status] = (summary[status] ?? 0) + 1;
    return summary;
  }, {});
  return {
    schemaVersion: 1,
    strategy: `${document?.strategy ?? 'unknown'}-rolling-iv-filter`,
    evidenceClass: 'POST_HOC_DISCOVERY_DIAGNOSTIC',
    warning: 'The base discovery sample was already viewed. This result may reject the filter, but cannot validate or promote it.',
    rules,
    counts,
    normalized: diagnoseStrategyArtifact({ strategy: document?.strategy, results: acceptedResults }, 'normalized'),
    stress0_5: diagnoseStrategyArtifact({ strategy: document?.strategy, results: acceptedResults }, 'stress0_5'),
    stress1_0: diagnoseStrategyArtifact({ strategy: document?.strategy, results: acceptedResults }, 'stress1_0'),
  };
}

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) throw new Error('Usage: node research/backtest-artifact-filter.mjs <consolidated.json> [output.json]');
  const report = backtestRollingIvFilter(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) fs.writeFileSync(outputPath, json);
  else process.stdout.write(json);
}

if (process.argv[1]?.endsWith('backtest-artifact-filter.mjs')) main();
