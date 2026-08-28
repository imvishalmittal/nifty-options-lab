import fs from 'node:fs';

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, ...rest] = item.slice(2).split('=');
    args[key] = rest.join('=');
  }
  return args;
}

function approximately(a, b, tolerance = 1e-8) {
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= tolerance;
}

export function inspectResult(result, expected = {}) {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });
  const rules = result.rules ?? {};
  const trades = result.trades ?? [];
  const selections = result.selections ?? [];
  const tradeDates = new Set(trades.map((trade) => trade.date));

  const expectedStartDate = expected.startDate ?? '2026-05-28';
  const expectedEndDate = expected.endDate ?? '2026-08-27';
  const calendarDays = Math.round((new Date(`${expectedEndDate}T00:00:00Z`) - new Date(`${expectedStartDate}T00:00:00Z`)) / 86_400_000) + 1;
  const minSessions = expected.minSessions ?? Math.floor(calendarDays * 0.55);
  const maxSessions = expected.maxSessions ?? Math.ceil(calendarDays * 0.8);

  check('schema_version', result.schemaVersion === 1, result.schemaVersion);
  check('expected_period', result.period?.startDate === expectedStartDate && result.period?.endDate === expectedEndDate, result.period);
  check('session_count_plausible', result.period?.sessions >= minSessions && result.period?.sessions <= maxSessions, { sessions: result.period?.sessions, minSessions, maxSessions });
  check('daily_drop_rule', rules.dailyDropPct === -1, rules.dailyDropPct);
  check('thirty_session_at_or_below_minus_2_5', rules.maxThirtyDayReturnPct === -2.5 && rules.minThirtyDayReturnPct === undefined, { ceiling: rules.maxThirtyDayReturnPct });
  check('volume_rule', rules.minVolume === 500_000, rules.minVolume);
  check('target_only_exit', rules.targetReturnPct === 7 && String(rules.exit).includes('no stop'), rules.exit);
  check('one_trade_per_day', tradeDates.size === trades.length, { trades: trades.length, distinctDates: tradeDates.size });
  check('summary_counts', result.summary?.trades === trades.length && result.summary?.targets + result.summary?.open === trades.length, result.summary);

  const invalidSignals = trades.filter((trade) => !(
    trade.dayReturnPct <= -1
    && trade.thirtyDayReturnPct <= -2.5
    && trade.volumeToEntry > 500_000
  ));
  check('all_trades_pass_signal', invalidSignals.length === 0, invalidSignals.map((trade) => trade.date));

  const unclassifiedSelections = trades.filter((trade) => String(trade.category).startsWith('UNCLASSIFIED:'));
  check('selected_categories_classified', unclassifiedSelections.length === 0, unclassifiedSelections.map((trade) => trade.symbol));

  const invalidTargets = trades.filter((trade) => trade.status === 'TARGET' && !(
    approximately(trade.targetPrice, trade.entryPrice * 1.07)
    && approximately(trade.exitPrice, trade.targetPrice)
    && trade.exitDate >= trade.date
    && trade.sessionsToTarget >= 0
  ));
  check('target_accounting', invalidTargets.length === 0, invalidTargets.map((trade) => trade.date));

  const invalidOpen = trades.filter((trade) => trade.status === 'OPEN' && (trade.exitDate !== null || trade.exitPrice !== null || trade.sessionsToTarget !== null));
  check('open_positions_not_relabelled', invalidOpen.length === 0, invalidOpen.map((trade) => trade.date));

  const selectedDates = new Set(selections.filter((item) => item.status === 'SELECTED').map((item) => item.date));
  check('selection_trade_equality', selectedDates.size === trades.length && trades.every((trade) => selectedDates.has(trade.date)), { selections: selectedDates.size, trades: trades.length });

  const consecutiveCategoryViolations = [];
  for (let index = 1; index < selections.length; index++) {
    const previous = selections[index - 1];
    const current = selections[index];
    if (previous?.selected && current?.selected && previous.selected.category === current.selected.category) {
      consecutiveCategoryViolations.push({ previousDate: previous.date, date: current.date, category: current.selected.category });
    }
  }
  check('no_consecutive_session_same_category', consecutiveCategoryViolations.length === 0, consecutiveCategoryViolations);

  const successful = result.dataQuality?.successfulSymbols ?? 0;
  const universe = result.universe?.instruments ?? 0;
  const coverageRatio = universe ? successful / universe : 0;
  check('provider_coverage_at_least_90pct', coverageRatio >= 0.9, { successful, universe, coverageRatio });

  if (expected.requireCapitalUse) {
    const capitalUse = result.capitalUse ?? {};
    check('capital_use_reported', Number.isInteger(capitalUse.peakActiveSlots)
      && capitalUse.peakActiveSlots >= capitalUse.finalOpenSlots
      && capitalUse.finalOpenSlots === result.summary?.open,
    capitalUse);
  }

  if (Array.isArray(result.targetSweep)) {
    const expectedTargets = [7, 8, 10, 12, 15, 20];
    check('target_sweep_complete',
      result.targetSweep.length === expectedTargets.length
        && expectedTargets.every((target, index) => result.targetSweep[index]?.targetReturnPct === target),
      result.targetSweep.map((scenario) => scenario.targetReturnPct));
    const baselineCohort = trades.map((trade) => `${trade.date}:${trade.symbol}`);
    const scenarioFailures = [];
    for (const scenario of result.targetSweep) {
      const scenarioTrades = scenario.trades ?? [];
      const target = Number(scenario.targetReturnPct);
      const cohort = scenarioTrades.map((trade) => `${trade.date}:${trade.symbol}`);
      const accountingOk = scenarioTrades.every((trade) => (
        approximately(trade.targetPrice, trade.entryPrice * (1 + target / 100))
        && (trade.status !== 'TARGET' || approximately(trade.exitPrice, trade.targetPrice))
      ));
      const countsOk = scenario.summary?.trades === scenarioTrades.length
        && scenario.summary?.targets + scenario.summary?.open === scenarioTrades.length;
      const capitalOk = scenario.capitalUse?.peakActiveSlots === scenario.annualizedReturn?.initialCapitalUnits;
      const xirr = scenario.annualizedReturn?.scenarios?.[0]?.xirrPct;
      if (JSON.stringify(cohort) !== JSON.stringify(baselineCohort)
        || !accountingOk || !countsOk || !capitalOk || !Number.isFinite(Number(xirr))) {
        scenarioFailures.push({ target, accountingOk, countsOk, capitalOk, xirr });
      }
    }
    check('target_sweep_integrity', scenarioFailures.length === 0, scenarioFailures);
  }

  return { status: checks.every((item) => item.pass) ? 'PASS' : 'FAIL', checks };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.in || 'etf-dip-recovery-result.json';
  const output = args.out || 'etf-dip-recovery-integrity.json';
  const integrity = inspectResult(JSON.parse(fs.readFileSync(input, 'utf8')), {
    startDate: args.start,
    endDate: args.end,
    minSessions: args['min-sessions'] === undefined ? undefined : Number(args['min-sessions']),
    maxSessions: args['max-sessions'] === undefined ? undefined : Number(args['max-sessions']),
    requireCapitalUse: args['require-capital'] === 'true',
  });
  fs.writeFileSync(output, JSON.stringify(integrity, null, 2));
  process.stdout.write(JSON.stringify(integrity, null, 2));
  if (integrity.status !== 'PASS') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
