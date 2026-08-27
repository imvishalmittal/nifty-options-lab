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

export function inspectResult(result) {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });
  const rules = result.rules ?? {};
  const trades = result.trades ?? [];
  const selections = result.selections ?? [];
  const tradeDates = new Set(trades.map((trade) => trade.date));

  check('schema_version', result.schemaVersion === 1, result.schemaVersion);
  check('frozen_period', result.period?.startDate === '2026-05-28' && result.period?.endDate === '2026-08-27', result.period);
  check('session_count_plausible', result.period?.sessions >= 55 && result.period?.sessions <= 70, result.period?.sessions);
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

  const successful = result.dataQuality?.successfulSymbols ?? 0;
  const universe = result.universe?.instruments ?? 0;
  const coverageRatio = universe ? successful / universe : 0;
  check('provider_coverage_at_least_90pct', coverageRatio >= 0.9, { successful, universe, coverageRatio });

  return { status: checks.every((item) => item.pass) ? 'PASS' : 'FAIL', checks };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.in || 'etf-dip-recovery-result.json';
  const output = args.out || 'etf-dip-recovery-integrity.json';
  const integrity = inspectResult(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, JSON.stringify(integrity, null, 2));
  process.stdout.write(JSON.stringify(integrity, null, 2));
  if (integrity.status !== 'PASS') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
