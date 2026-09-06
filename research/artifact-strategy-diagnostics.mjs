import fs from 'node:fs';

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function quantile(sorted, probability) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarizeGroup(rows) {
  const pnls = rows.map((row) => row.pnl).sort((a, b) => a - b);
  const winners = pnls.filter((pnl) => pnl > 0);
  const losers = pnls.filter((pnl) => pnl < 0);
  const grossProfit = winners.reduce((sum, pnl) => sum + pnl, 0);
  const grossLoss = -losers.reduce((sum, pnl) => sum + pnl, 0);
  const averageWinner = winners.length ? grossProfit / winners.length : null;
  const averageLoser = losers.length ? losers.reduce((sum, pnl) => sum + pnl, 0) / losers.length : null;
  return {
    trades: pnls.length,
    winners: winners.length,
    losers: losers.length,
    winRatePct: round(pnls.length ? (winners.length / pnls.length) * 100 : null),
    netPnl: round(pnls.reduce((sum, pnl) => sum + pnl, 0)),
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    profitFactor: round(grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : null, 3),
    averageWinner: round(averageWinner),
    averageLoser: round(averageLoser),
    payoffRatio: round(averageWinner && averageLoser ? averageWinner / Math.abs(averageLoser) : null, 3),
    medianPnl: round(quantile(pnls, 0.5)),
    p05Pnl: round(quantile(pnls, 0.05)),
    p95Pnl: round(quantile(pnls, 0.95)),
    bestTrade: pnls.length ? round(pnls.at(-1)) : null,
    worstTrade: pnls.length ? round(pnls[0]) : null,
  };
}

function tailConcentration(rows, count) {
  const losses = rows.filter((row) => row.pnl < 0).sort((a, b) => a.pnl - b.pnl);
  const grossLoss = -losses.reduce((sum, row) => sum + row.pnl, 0);
  const selected = losses.slice(0, count);
  return {
    requestedCount: count,
    observedCount: selected.length,
    lossSharePct: round(grossLoss ? (-selected.reduce((sum, row) => sum + row.pnl, 0) / grossLoss) * 100 : null),
    trades: selected.map(({ date, pnl, exitReason }) => ({ date, pnl: round(pnl), exitReason })),
  };
}

function groupRows(rows, keyFor) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (key == null) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([key, group]) => [key, summarizeGroup(group)]));
}

function bin(value, boundaries) {
  for (const [label, minimum, maximum] of boundaries) {
    if (value >= minimum && value < maximum) return label;
  }
  return null;
}

export function diagnoseStrategyArtifact(document, scenario = 'normalized') {
  const rows = (document?.results ?? []).flatMap((result) => {
    if (result?.status !== 'TRADE') return [];
    const pnl = finite(result?.costs?.[scenario]?.netPnl);
    if (pnl == null) return [];
    const shortCallIv = finite(result?.selection?.shortCall?.impliedVolatility);
    const shortPutIv = finite(result?.selection?.shortPut?.impliedVolatility);
    return [{
      date: result.date,
      pnl,
      exitReason: result.exitReason ?? result.result ?? 'UNKNOWN',
      entryCredit: finite(result.entryCredit),
      averageShortIv: shortCallIv != null && shortPutIv != null ? (shortCallIv + shortPutIv) / 2 : null,
    }];
  });

  const exitReasons = {};
  for (const row of rows) exitReasons[row.exitReason] = (exitReasons[row.exitReason] ?? 0) + 1;

  const creditBoundaries = [['<5', -Infinity, 5], ['5–10', 5, 10], ['10–15', 10, 15], ['15–25', 15, 25], ['≥25', 25, Infinity]];
  const ivBoundaries = [['<0.10', -Infinity, 0.10], ['0.10–0.15', 0.10, 0.15], ['0.15–0.20', 0.15, 0.20], ['0.20–0.30', 0.20, 0.30], ['≥0.30', 0.30, Infinity]];

  return {
    schemaVersion: 1,
    strategy: document?.strategy ?? null,
    scenario,
    generatedFromTradeRows: rows.length,
    overall: summarizeGroup(rows),
    tailLossConcentration: {
      worst5: tailConcentration(rows, 5),
      worst10: tailConcentration(rows, 10),
    },
    exitReasons,
    byYear: groupRows(rows, (row) => row.date?.slice(0, 4)),
    descriptiveOnly: {
      warning: 'Bins describe the already-viewed sample and are not valid post-hoc entry filters or promotion evidence.',
      byEntryCredit: groupRows(rows.filter((row) => row.entryCredit != null), (row) => bin(row.entryCredit, creditBoundaries)),
      byAverageShortIv: groupRows(rows.filter((row) => row.averageShortIv != null), (row) => bin(row.averageShortIv, ivBoundaries)),
    },
  };
}

function main() {
  const [, , inputPath, outputPath, scenario = 'normalized'] = process.argv;
  if (!inputPath) throw new Error('Usage: node research/artifact-strategy-diagnostics.mjs <consolidated.json> [output.json] [scenario]');
  const report = diagnoseStrategyArtifact(JSON.parse(fs.readFileSync(inputPath, 'utf8')), scenario);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) fs.writeFileSync(outputPath, json);
  else process.stdout.write(json);
}

if (process.argv[1]?.endsWith('artifact-strategy-diagnostics.mjs')) main();
