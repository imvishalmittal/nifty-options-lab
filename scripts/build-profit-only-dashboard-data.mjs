import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));
const keys = ['RETEST15_CONFIRM_BE_10', 'PREVIOUS_DAY_BREAK_CONFIRM_BE_10'];
const labels = {
  RETEST15_CONFIRM_BE_10: 'Retest-15 + breakeven after +10',
  PREVIOUS_DAY_BREAK_CONFIRM_BE_10: 'Previous-day break + breakeven after +10',
};

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function compact(source, phase) {
  return keys.flatMap((key) => (source.variants?.[key]?.trades ?? []).map((trade) => ({
    phase, key: key === 'RETEST15_CONFIRM_BE_10' ? 'R' : 'P', date: trade.date, side: trade.side,
    entryPremium: trade.entry, exitPremium: trade.exit, exitReason: trade.result,
    normalNetPnl: Number((trade.money?.current ?? 0).toFixed(2)),
    stress0_5NetPnl: Number((trade.money?.stress0_5 ?? 0).toFixed(2)),
    stress1_0NetPnl: Number((trade.money?.stress1_0 ?? 0).toFixed(2)),
  })));
}

if (!args.discovery || !args.validation || !args.out) {
  throw new Error('Use --discovery=... --validation=... --out=...');
}
const discovery = read(args.discovery);
const validation = read(args.validation);
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  phases: {
    DISCOVERY: { period: discovery.period, verdict: 'PASSED_ECONOMIC_DISCOVERY' },
    VALIDATION: { period: validation.period, verdict: 'STOP_NEW_PAPER_ENTRIES' },
  },
  trades: [...compact(discovery, 'DISCOVERY'), ...compact(validation, 'VALIDATION')],
};
fs.writeFileSync(args.out, `${JSON.stringify(output)}\n`);
