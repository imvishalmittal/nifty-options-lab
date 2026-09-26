import fs from 'node:fs';
function bucket(time){
  if(time>='09:15'&&time<'09:45') return '09:15-09:45';
  if(time>='09:45'&&time<'11:00') return '09:45-11:00';
  if(time>='11:00'&&time<'13:00') return '11:00-13:00';
  if(time>='13:00'&&time<'15:00') return '13:00-15:00';
  return 'OUTSIDE';
}
function stats(rows, scenario){
  const pnl=rows.map(t=>t.money?.[scenario]).filter(Number.isFinite);
  const wins=pnl.filter(x=>x>0), losses=pnl.filter(x=>x<0);
  let eq=0,peak=0,dd=0;
  for(const x of pnl){eq+=x;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}
  const gp=wins.reduce((a,b)=>a+b,0), gl=-losses.reduce((a,b)=>a+b,0);
  return {trades:pnl.length,winners:wins.length,winRatePct:pnl.length?100*wins.length/pnl.length:null,totalPnl:pnl.reduce((a,b)=>a+b,0),profitFactor:gl?gp/gl:(gp?Infinity:null),maxDrawdown:dd};
}
const [,,input,output]=process.argv;
if(!input||!output) throw new Error('usage: node idea19-discovery-screen.mjs baseline.json output.json');
const d=JSON.parse(fs.readFileSync(input,'utf8')); const buckets={};
for(const t of d.trades??[]){const b=bucket(t.signalTime.slice(11,16));if(b!=='OUTSIDE')(buckets[b]??=[]).push(t)}
const scenarios=['current','stress0_5','stress1_0'];
const report={schemaVersion:1,study:'Idea 19 discovery-only time-of-day screen',period:d.period,baselineTrades:d.tradeCount,selectionProtocol:'All four pre-frozen diagnostic buckets are screened on 2020-01-01 through 2024-12-31 only. No 2025 validation or 2026 holdout result is used for bucket selection. Candidate selection, if any, occurs only after discovery review.',buckets:{}};
for(const [b,rows] of Object.entries(buckets)) report.buckets[b]=Object.fromEntries(scenarios.map(s=>[s,stats(rows,s)]));
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2));
