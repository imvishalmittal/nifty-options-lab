import fs from 'node:fs';
import { clusterBootstrapMean, summarizePerformance } from '../performance-statistics.mjs';

function byGroup(trades, key, value) {
  const groups = new Map();
  for (const trade of trades) {
    const group = key(trade);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(value(trade));
  }
  return Object.fromEntries([...groups].map(([group, values]) => [group, summarizePerformance(values)]));
}

function contribution(trades, value) {
  const totals = byGroup(trades, (trade) => trade.symbol, value);
  const absolute = Object.values(totals).reduce((sum, row) => sum + Math.abs(row.total), 0);
  const top = Object.entries(totals).sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))[0];
  return absolute > 0 && top ? { symbol: top[0], share: Math.abs(top[1].total) / absolute } : { symbol: null, share: null };
}

export function evaluateUnderlyingDiscovery(document) {
  const primary = document.variants?.find((variant) => variant.primary);
  if (!primary) return { decision: 'RESEARCH_GATE_FAIL', automaticPromotion: false, checks: [{ name: 'primary variant', pass: false }] };
  const trades = primary.result?.trades ?? [];
  const stress2 = summarizePerformance(trades.map((trade) => trade.stress2bpsNetR));
  const stress5 = summarizePerformance(trades.map((trade) => trade.stress5bpsNetR));
  const confidence = clusterBootstrapMean(trades, {
    value: (trade) => trade.stress2bpsNetR,
    cluster: (trade) => trade.date,
    samples: 5000,
    seed: 20260825,
  });
  const years = byGroup(trades, (trade) => trade.date.slice(0, 4), (trade) => trade.stress2bpsNetR);
  const symbols = byGroup(trades, (trade) => trade.symbol, (trade) => trade.stress2bpsNetR);
  const positiveYears = Object.values(years).filter((row) => row.total > 0).length;
  const positiveSymbols = Object.values(symbols).filter((row) => row.total > 0).length;
  const concentration = contribution(trades, (trade) => trade.stress2bpsNetR);
  const checks = [
    { name: 'trades', value: trades.length, threshold: '>= 100', pass: trades.length >= 100 },
    { name: '2bps stress total R', value: stress2.total, threshold: '> 0', pass: stress2.total > 0 },
    { name: '2bps stress profit factor', value: stress2.profitFactor, threshold: '>= 1.15', pass: stress2.profitFactor >= 1.15 },
    { name: '5bps stress total R', value: stress5.total, threshold: '> 0', pass: stress5.total > 0 },
    { name: '5bps stress profit factor', value: stress5.profitFactor, threshold: '>= 1.05', pass: stress5.profitFactor >= 1.05 },
    { name: 'clustered 95% lower mean', value: confidence.lower, threshold: '> 0', pass: confidence.lower > 0 },
    { name: 'positive discovery years', value: positiveYears, threshold: '>= 3 of 5', pass: positiveYears >= 3 },
    { name: 'positive symbols', value: positiveSymbols, threshold: '>= 3', pass: positiveSymbols >= 3 },
    { name: 'top symbol contribution', value: concentration.share, threshold: '<= 50%', pass: concentration.share != null && concentration.share <= 0.5 },
  ];
  return {
    strategy: primary.key,
    phase: 'discovery-2020-2024',
    decision: checks.every((check) => check.pass) ? 'RESEARCH_GATE_PASS' : 'RESEARCH_GATE_FAIL',
    automaticPromotion: false,
    checks,
    diagnostics: { stress2, stress5, confidence, years, symbols, concentration },
  };
}

export function evaluateVwapDiscovery(document) {
  const trades = (document.results ?? []).filter((row) => row.status === 'TRADE');
  const stressYears = byGroup(trades, (trade) => trade.date.slice(0, 4), (trade) => trade.costs?.stress1_0?.netPnl);
  const positiveYears = Object.values(stressYears).filter((row) => row.total > 0).length;
  const checks = [
    { name: 'trades', value: document.summary?.trades, threshold: '>= 100', pass: document.summary?.trades >= 100 },
    { name: 'gross profit factor', value: document.summary?.profitFactorBeforeCosts, threshold: '>= 1.20', pass: document.summary?.profitFactorBeforeCosts >= 1.2 },
    { name: 'normalized net P&L', value: document.summary?.normalizedCosts?.totalNetPnlRupees, threshold: '> 0', pass: document.summary?.normalizedCosts?.totalNetPnlRupees > 0 },
    { name: '0.5-point stress net P&L', value: document.summary?.stress0_5?.totalNetPnlRupees, threshold: '> 0', pass: document.summary?.stress0_5?.totalNetPnlRupees > 0 },
    { name: '1-point stress net P&L', value: document.summary?.stress1_0?.totalNetPnlRupees, threshold: '> 0', pass: document.summary?.stress1_0?.totalNetPnlRupees > 0 },
    { name: 'positive 1-point-stress years', value: positiveYears, threshold: '>= 3 of 5', pass: positiveYears >= 3 },
  ];
  return {
    strategy: document.strategy,
    phase: 'discovery-2020-2024',
    decision: checks.every((check) => check.pass) ? 'RESEARCH_GATE_PASS' : 'RESEARCH_GATE_FAIL',
    automaticPromotion: false,
    checks,
    diagnostics: { stressYears },
  };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...value] = arg.slice(2).split('=');
    return [key, value.join('=')];
  }));
  if (!args.in || !args.type) throw new Error('--in and --type are required');
  const document = JSON.parse(fs.readFileSync(args.in, 'utf8'));
  const report = args.type === 'underlying' ? evaluateUnderlyingDiscovery(document) : evaluateVwapDiscovery(document);
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('research-gates.mjs')) main();
