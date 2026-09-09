import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function compact(source, phase) {
  const keys = Object.keys(source.variants ?? {});
  return keys.flatMap((key) => (source.variants?.[key]?.trades ?? []).map((trade) => ({
    phase, key, date: trade.date, side: trade.side, contract: trade.contract?.symbol ?? null,
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
  strategies: Array.from(new Set([...Object.keys(discovery.variants ?? {}), ...Object.keys(validation.variants ?? {})])).sort(),
  phases: {
    DISCOVERY: { period: discovery.period, verdict: 'REJECTED' },
    VALIDATION: { period: validation.period, verdict: 'REJECTED' },
  },
  trades: [...compact(discovery, 'DISCOVERY'), ...compact(validation, 'VALIDATION')],
};
fs.writeFileSync(args.out, `${JSON.stringify(output)}\n`);
