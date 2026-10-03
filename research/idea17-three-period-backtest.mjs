import fs from 'node:fs';
import { run as runBaseline } from './groww-idea10-2026-diagnostic.mjs';
import { run as runIdea17 } from './idea17-diagnostic.mjs';

const periods = [
  { name: 'discovery', start: '2020-01-01', end: '2024-12-31' },
  { name: 'validation', start: '2025-01-01', end: '2025-12-31' },
  { name: 'holdout', start: '2026-01-01', end: '2026-09-19' },
];

function groupedBootstrap(rows, n = 5000) {
  const groups = new Map();
  for (const r of rows) {
    const v = Number(r.money?.current);
    if (!Number.isFinite(v)) continue;
    const m = String(r.date).slice(0, 7);
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(v);
  }
  const keys = [...groups.keys()];
  if (!keys.length) return { samples: n, clusters: 0, mean: null, lower95: null, upper95: null };
  const totals = keys.map(k => groups.get(k).reduce((a,b)=>a+b,0));
  let seed = 20261004;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const samples = [];
  for (let i=0;i<n;i++) {
    let s=0;
    for (let j=0;j<keys.length;j++) s += totals[Math.floor(rand()*totals.length)];
    samples.push(s);
  }
  samples.sort((a,b)=>a-b);
  return { samples:n, clusters:keys.length, mean:totals.reduce((a,b)=>a+b,0)/totals.length, lower95:samples[Math.floor(n*.025)], upper95:samples[Math.floor(n*.975)] };
}
function stats(rows) {
  const v=rows.map(r=>Number(r.money?.current)).filter(Number.isFinite);
  const p=v.filter(x=>x>0), n=v.filter(x=>x<0), gp=p.reduce((a,b)=>a+b,0), gl=Math.abs(n.reduce((a,b)=>a+b,0));
  let eq=0,peak=0,dd=0; for(const x of v){eq+=x;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}
  return { trades:v.length,winners:p.length,winRatePct:v.length?p.length/v.length*100:null,totalPnl:v.reduce((a,b)=>a+b,0),profitFactor:gl?gp/gl:(gp?Infinity:null),maxDrawdownRupees:dd };
}
function stress(rows, field) {
  return stats(rows.map(r=>({money:{current:r.money?.[field]}})));
}
function stability(rows) {
  const years={}, months={};
  for(const r of rows){ const v=Number(r.money?.current); if(!Number.isFinite(v))continue; const y=String(r.date).slice(0,4),m=String(r.date).slice(0,7); (years[y]??=[]).push({money:{current:v}}); (months[m]??=[]).push({money:{current:v}}); }
  return { annual:Object.fromEntries(Object.entries(years).map(([k,v])=>[k,stats(v)])), monthly:Object.fromEntries(Object.entries(months).map(([k,v])=>[k,stats(v)])) };
}
function scenarioRows(baseline, decisive=true) {
  return baseline.trades.filter(t => {
    const sideBias=t.side==='CE'?'UP':'DOWN';
    return decisive ? t.decisiveDailyBias===sideBias : t.dailyBias===sideBias;
  });
}
async function main() {
  const token=process.env.GROWW_ACCESS_TOKEN;
  if(!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const out={schemaVersion:1,study:'Idea 17 proper discovery-validation-holdout backtest',frozenRule:'Idea10A + prior completed NIFTY trading day O-to-C bias + decisive threshold >=0.5%; agreement required; no lookahead.',periods:{}};
  for(const p of periods){
    console.error('RUN',p.name,p.start,p.end);
    const baseline=await runBaseline({token,startDate:p.start,endDate:p.end,variant:'A',spacingMs:+(process.env.GROWW_REQUEST_SPACING_MS||1500)});
    if(!baseline.trades?.length) throw new Error(`${p.name}: no baseline trades`);
    const baselinePath=`idea17-baseline-${p.name}.json`;
    fs.writeFileSync(baselinePath,JSON.stringify(baseline));
    const filtered=await runIdea17({token,baselinePath,startDate:p.start,endDate:p.end,spacingMs:+(process.env.GROWW_REQUEST_SPACING_MS||1500),out:`idea17-${p.name}.json`});
    const rows=scenarioRows(filtered,true);
    out.periods[p.name]={
      period:{startDate:p.start,endDate:p.end},
      baseline:stats(filtered.trades),
      directionOnly:stats(scenarioRows(filtered,false)),
      idea17:stats(rows),
      idea17Stress0_5:stress(rows,'stress0_5'),
      idea17Stress1_0:stress(rows,'stress1_0'),
      bootstrapClusteredMonthly:groupedBootstrap(rows,5000),
      stability:stability(rows),
      integrity:filtered.dataIntegrity,
      biasDistribution:filtered.biasDistribution,
    };
    fs.rmSync(baselinePath,{force:true});
  }
  fs.writeFileSync('idea17-three-period-results.json',JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e.stack||e);process.exit(1)});