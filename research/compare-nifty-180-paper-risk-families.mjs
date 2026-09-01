import fs from 'node:fs';
import { summarizeEntryRelativeTrades } from './groww-backtest-nifty-180-entry-relative.mjs';

export const PAPER_RISK_PAIRS = Object.freeze([
  Object.freeze({ name: 'continuous', wide: 'PAPER_160_V2', narrow: 'PAPER_170_V9' }),
  Object.freeze({ name: 'step_5', wide: 'PAPER_160_V3_5', narrow: 'PAPER_170_V10_5' }),
  Object.freeze({ name: 'step_10', wide: 'PAPER_160_V3_10', narrow: 'PAPER_170_V10_10' }),
  Object.freeze({ name: 'fixed_2r', wide: 'PAPER_160_V6', narrow: 'PAPER_170_V11' }),
]);

function monthly(rows, scenario) {
  const values = {};
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    values[month] = (values[month] ?? 0) + Number(row.costs[scenario].netPnl);
  }
  return {
    values,
    profitableMonths: Object.values(values).filter((value) => value > 0).length,
    observedMonths: Object.keys(values).length,
  };
}

function diagnostics(rows) {
  return {
    summary: summarizeEntryRelativeTrades(rows),
    monthly: {
      normalized: monthly(rows, 'normalized'),
      stress0_5: monthly(rows, 'stress0_5'),
      stress1_0: monthly(rows, 'stress1_0'),
    },
  };
}

function sameTrade(left, right) {
  return left.date === right.date
    && left.entry === right.entry
    && left.entryTime === right.entryTime
    && left.signalTime === right.signalTime
    && left.contract?.symbol === right.contract?.symbol;
}

export function comparePaperRiskFamilies(document) {
  if (document?.strategy !== 'nifty-180-entry-relative-risk') throw new Error('Unexpected strategy document');
  const pairs = Object.fromEntries(PAPER_RISK_PAIRS.map((pair) => {
    const wide = document.variants?.[pair.wide]?.trades;
    const narrow = document.variants?.[pair.narrow]?.trades;
    if (!Array.isArray(wide) || !Array.isArray(narrow)) throw new Error(`${pair.name}: missing variant trades`);
    const wideByDate = new Map(wide.map((trade) => [trade.date, trade]));
    const commonWide = narrow.map((trade) => wideByDate.get(trade.date));
    if (commonWide.some((trade) => !trade)) throw new Error(`${pair.name}: narrow cohort is not a subset of wide cohort`);
    for (let index = 0; index < narrow.length; index += 1) {
      if (!sameTrade(commonWide[index], narrow[index])) throw new Error(`${pair.name}: paired entry mismatch on ${narrow[index].date}`);
    }
    const wideCommon = commonWide;
    const wideCommonDiagnostics = diagnostics(wideCommon);
    const narrowCommonDiagnostics = diagnostics(narrow);
    return [pair.name, {
      variants: { wide: pair.wide, narrow: pair.narrow },
      livePolicy: { wide: diagnostics(wide), narrow: diagnostics(narrow) },
      commonEntryCohort: {
        rule: '170 < executable entry < 210; identical date, contract, signal and fill',
        wide: wideCommonDiagnostics,
        narrow: narrowCommonDiagnostics,
        normalizedPnlDifferenceNarrowMinusWide:
          narrowCommonDiagnostics.summary.totalNetPnlRupees - wideCommonDiagnostics.summary.totalNetPnlRupees,
        stress0_5PnlDifferenceNarrowMinusWide:
          narrowCommonDiagnostics.summary.totalNetPnlStress0_5 - wideCommonDiagnostics.summary.totalNetPnlStress0_5,
        stress1_0PnlDifferenceNarrowMinusWide:
          narrowCommonDiagnostics.summary.totalNetPnlStress1_0 - wideCommonDiagnostics.summary.totalNetPnlStress1_0,
      },
    }];
  }));
  return {
    strategy: document.strategy,
    phase: 'diagnostic-2026',
    period: document.period,
    automaticPromotion: false,
    integrity: 'PASS',
    pairs,
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
  if (!args.in || !args.out) throw new Error('--in and --out are required');
  const report = comparePaperRiskFamilies(JSON.parse(fs.readFileSync(args.in, 'utf8')));
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('compare-nifty-180-paper-risk-families.mjs')) main();
