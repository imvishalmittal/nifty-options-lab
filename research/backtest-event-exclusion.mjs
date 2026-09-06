import fs from 'node:fs';
import { applyEventExclusion } from './event-exclusion-filter.mjs';
import { diagnoseStrategyArtifact } from './artifact-strategy-diagnostics.mjs';

export function backtestEventExclusion(document, calendar) {
  const classified = applyEventExclusion(document?.results, calendar?.events);
  const accepted = classified.filter((row) => row.eventFilter?.status === 'EVENT_OPEN');
  const skipped = classified.filter((row) => row.eventFilter?.status === 'EVENT_SKIPPED');
  return {
    schemaVersion: 1,
    strategy: `${document?.strategy ?? 'unknown'}-macro-event-exclusion`,
    evidenceClass: 'POST_HOC_DISCOVERY_DIAGNOSTIC',
    warning: 'The base sample was already viewed. This may reject the exclusion rule, but cannot validate or promote it.',
    calendarSources: calendar?.sources ?? [],
    counts: { retainedTrades: accepted.length, eventSkippedTrades: skipped.length },
    skippedEvents: skipped.map((row) => ({ date: row.date, exitDate: row.exitTimestamp?.slice(0, 10), events: row.eventFilter.matchedEvents })),
    normalized: diagnoseStrategyArtifact({ strategy: document?.strategy, results: accepted }, 'normalized'),
    stress0_5: diagnoseStrategyArtifact({ strategy: document?.strategy, results: accepted }, 'stress0_5'),
    stress1_0: diagnoseStrategyArtifact({ strategy: document?.strategy, results: accepted }, 'stress1_0'),
  };
}

function main() {
  const [, , inputPath, calendarPath, outputPath] = process.argv;
  if (!inputPath || !calendarPath) throw new Error('Usage: node research/backtest-event-exclusion.mjs <consolidated.json> <calendar.json> [output.json]');
  const report = backtestEventExclusion(JSON.parse(fs.readFileSync(inputPath, 'utf8')), JSON.parse(fs.readFileSync(calendarPath, 'utf8')));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) fs.writeFileSync(outputPath, json);
  else process.stdout.write(json);
}

if (process.argv[1]?.endsWith('backtest-event-exclusion.mjs')) main();
