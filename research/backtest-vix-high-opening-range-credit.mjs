import fs from 'node:fs';
import { backtestOpeningRangeCredit } from './groww-opening-range-credit-backtest.mjs';
import { summarizeScenario } from './remaining-option-selling-engine.mjs';
import { fetchIndiaVixDaily } from './backtest-vix-low-nifty-180.mjs';
import { classifyVolRegimeForSession, VOL_REGIME_RULES } from './vol-regime-filter.mjs';

const VIX_HIGH_RULES = Object.freeze({ ...VOL_REGIME_RULES, direction: 'AT_OR_ABOVE' });

function parseDateUtc(date) {
  return new Date(`${date}T00:00:00Z`);
}

function formatDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function plusDays(date, days) {
  const value = parseDateUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return formatDateUtc(value);
}

function summarize(results) {
  const trades = results.filter((row) => row.status === 'TRADE');
  const scenario = (name) => summarizeScenario(trades.map((row) => row.costs[name].netPnl));
  return {
    sessions: results.length,
    signals: results.filter((row) => row.signal?.status === 'SIGNAL').length,
    trades: trades.length,
    dataMissing: results.filter((row) => row.status === 'DATA_MISSING').length,
    noTrade: results.filter((row) => row.status === 'NO_TRADE').length,
    vixFiltered: results.filter((row) => row.status === 'VIX_FILTERED').length,
    targets: trades.filter((row) => row.exitReason === 'TARGET').length,
    stops: trades.filter((row) => row.exitReason === 'STOP').length,
    timeExits: trades.filter((row) => row.exitReason === 'TIME').length,
    normalized: scenario('normalized'),
    stress0_5: scenario('stress0_5'),
    stress1_0: scenario('stress1_0'),
  };
}

export function applyHighVixOpeningRangeFilter(document, vixRows, rules = VIX_HIGH_RULES) {
  const filtered = document.results.map((row) => {
    const vixRegime = classifyVolRegimeForSession({ sessionDate: row.date, vixRows, rules });
    if (vixRegime.status !== 'REGIME_OPEN') return { ...row, originalStatus: row.status, status: 'VIX_FILTERED', vixRegime };
    return { ...row, vixRegime };
  });
  const regimeCounts = {};
  for (const row of filtered) regimeCounts[row.vixRegime.status] = (regimeCounts[row.vixRegime.status] ?? 0) + 1;
  return {
    ...document,
    strategy: 'C3-vix-high-opening-range-atm-credit-spread',
    rules: { ...document.rules, vixRegime: rules },
    vixInstrument: { exchange: 'NSE', segment: 'CASH', growwSymbol: 'NSE-INDIAVIX' },
    vixRegimeCounts: regimeCounts,
    results: filtered,
    summary: summarize(filtered),
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => {
    const [key, ...rest] = value.slice(2).split('=');
    return [key, rest.join('=')];
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token || !args.start || !args.end) throw new Error('GROWW_ACCESS_TOKEN, --start and --end are required');
  const source = await backtestOpeningRangeCredit({ token, startDate: args.start, endDate: args.end });
  const vixRows = await fetchIndiaVixDaily({
    token,
    startDate: plusDays(args.start, -500),
    endDate: args.end,
  });
  const result = applyHighVixOpeningRangeFilter(source, vixRows);
  fs.writeFileSync(args.out ?? 'vix-high-opening-range-credit.json', `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('backtest-vix-high-opening-range-credit.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
