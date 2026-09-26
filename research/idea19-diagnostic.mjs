import fs from 'node:fs';
import { run as runIdea10 } from './groww-idea10-2026-diagnostic.mjs';

function bucket(time){
  if(time>='09:15'&&time<'09:45') return '09:15-09:45';
  if(time>='09:45'&&time<'11:00') return '09:45-11:00';
  if(time>='11:00'&&time<'13:00') return '11:00-13:00';
  if(time>='13:00'&&time<'15:00') return '13:00-15:00';
  return 'OUTSIDE';
}
function stats(rows){
  const pnl=rows.map(t=>t.money.current).filter(Number.isFinite);
  const wins=pnl.filter(x=>x>0);
  const stops=rows.filter(t=>t.stopOut);
  const reversed=stops.filter(t=>t.underlyingDirectionIntactAtOptionStop===false);
  return {trades:pnl.length,winners:wins.length,winRate:pnl.length?wins.length/pnl.length:null,averagePnl:pnl.length?pnl.reduce((a,b)=>a+b,0)/pnl.length:null,totalPnl:pnl.reduce((a,b)=>a+b,0),stopOuts:stops.length,reversedStopShare:stops.length?reversed.length/stops.length:null,intactStopShare:stops.length?stops.filter(t=>t.underlyingDirectionIntactAtOptionStop===true).length/stops.length:null};
}
export async function main({token,startDate,endDate,spacingMs=1500}){
  const base=await runIdea10({token,startDate,endDate,variant:'A',spacingMs});
  const buckets={};
  for(const t of base.trades){const b=bucket(t.signalTime.slice(11,16));if(b!=='OUTSIDE')(buckets[b]??=[]).push(t)}
  return {schemaVersion:1,study:'Idea 19 pure re-analysis of frozen Idea 10 Variant A 2026 trades',period:{startDate,endDate},baseline:{trades:base.tradeCount,stopOuts:base.stopOutCount,netPnl:base.summaries.current.totalNetPnl},fixedBuckets:Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,stats(v)]))};
}
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const[k,...v]=x.slice(2).split('=');return[k,v.join('=')]}));
main({token:process.env.GROWW_ACCESS_TOKEN,startDate:args.start,endDate:args.end,spacingMs:+(process.env.GROWW_REQUEST_SPACING_MS||1500)}).then(r=>{if(args.out)fs.writeFileSync(args.out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2))}).catch(e=>{console.error(e.stack||e);process.exit(1)});
