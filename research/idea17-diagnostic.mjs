import fs from 'node:fs';

const API='https://api.groww.in/v1';
const CAPITAL=60000;
const FROZEN_DECISIVE_THRESHOLD_PCT=0.5; // frozen before any Idea 17 run; not tuned on 2026
let last=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function get(t,e,p,sp=1500){
  const w=Math.max(0,sp-(Date.now()-last)); if(w) await sleep(w);
  const u=new URL(API+e); for(const [k,v] of Object.entries(p)) u.searchParams.set(k,String(v));
  for(let a=0;a<9;a++){
    last=Date.now();
    const r=await fetch(u,{headers:{Accept:'application/json',Authorization:`Bearer ${t}`,'X-API-VERSION':'1.0'}});
    const b=await r.json().catch(()=>({}));
    if(r.ok&&b.status!=='FAILURE') return b.payload??b;
    if((r.status===429||r.status>=500)&&a<8){await sleep(Math.min(5000*2**a,60000));continue}
    throw Error(`Groww ${e} failed ${r.status}: ${b?.message||JSON.stringify(b)}`);
  }
  throw Error('Groww retries exhausted');
}
function normalize(rows){
  return (rows??[]).map(x=>{
    const ts=x.timestamp??x.time??x.startTime??x.start_time;
    return {timestamp:typeof ts==='number'?new Date(ts*1000).toISOString():String(ts),open:+(x.open??x.o),high:+(x.high??x.h),low:+(x.low??x.l),close:+(x.close??x.c)};
  }).filter(x=>x.timestamp&&Number.isFinite(x.open)&&Number.isFinite(x.close)).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
}
function split(start,end){
  const out=[]; let d=new Date(start+'T00:00:00Z'), z=new Date(end+'T00:00:00Z');
  while(d<=z){const e=new Date(Math.min(z.getTime(),d.getTime()+27*86400000));out.push({start:d.toISOString().slice(0,10),end:e.toISOString().slice(0,10)});d=new Date(e.getTime()+86400000)}
  return out;
}
async function dailyCandles(token,start,end,spacing){
  const all=[];
  for(const c of split(start,end)){
    const p=await get(token,'/historical/candles',{exchange:'NSE',segment:'CASH',groww_symbol:'NSE-NIFTY',start_time:c.start+' 09:15:00',end_time:c.end+' 15:29:00',candle_interval:'1day'},spacing);
    all.push(...normalize(p.candles??[]));
  }
  return all;
}
function stats(rows, field='money'){
  const v=rows.map(x=>x[field]).filter(Number.isFinite), pos=v.filter(x=>x>0), neg=v.filter(x=>x<0);
  const gp=pos.reduce((a,b)=>a+b,0), gl=Math.abs(neg.reduce((a,b)=>a+b,0));
  let eq=0,peak=0,dd=0; for(const x of v){eq+=x;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}
  return {trades:v.length,winners:pos.length,winRatePct:v.length?pos.length/v.length*100:null,totalPnl:v.reduce((a,b)=>a+b,0),avgPnl:v.length?v.reduce((a,b)=>a+b,0)/v.length:null,profitFactor:gl?gp/gl:(gp?Infinity:null),maxDrawdownRupees:dd};
}
function reversalStats(rows){
  const stops=rows.filter(x=>x.stopOut);
  const reversed=stops.filter(x=>x.underlyingDirectionIntactAtOptionStop===false);
  const intact=stops.filter(x=>x.underlyingDirectionIntactAtOptionStop===true);
  return {stopOuts:stops.length,reversalDrivenStopOuts:reversed.length,underlyingIntactStopOuts:intact.length,stopOutReversalRatePct:stops.length?reversed.length/stops.length*100:null,reversalDrivenStopRatePct:rows.length?reversed.length/rows.length*100:null};
}
function classify(daily, date){
  const prior=daily.filter(x=>x.timestamp.slice(0,10)<date).at(-1);
  if(!prior) return {bias:'DATA_MISSING',magnitudePct:null,priorDate:null};
  const magnitude=(prior.close/prior.open-1)*100;
  const bias=magnitude>0?'UP':magnitude<0?'DOWN':'FLAT';
  const decisive=Math.abs(magnitude)>=FROZEN_DECISIVE_THRESHOLD_PCT ? bias : 'FLAT';
  return {bias,decisiveBias:decisive,magnitudePct:magnitude,priorDate:prior.timestamp.slice(0,10)};
}
export async function run({token,baselinePath,startDate='2026-01-01',endDate='2026-09-19',spacingMs=1500,out='idea17-2026-diagnostic.json'}){
  last=0;
  const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
  const daily=await dailyCandles(token,'2025-12-01',endDate,spacingMs);
  const byDate=new Map();
  for(const d of daily) byDate.set(d.timestamp.slice(0,10),d);
  const trades=baseline.trades??[];
  const counts={};
  for(const t of trades) counts[t.date]=(counts[t.date]??0)+1;
  const multiTradeDates=Object.entries(counts).filter(([,n])=>n>1).map(([date,n])=>({date,trades:n}));
  const enriched=trades.map(t=>{
    const c=classify(daily,t.date);
    return {...t,dailyBias:c.bias,decisiveDailyBias:c.decisiveBias,dailyBiasMagnitudePct:c.magnitudePct,priorDailyDate:c.priorDate,
      biasAgreement:c.bias===t.side.replace('CE','UP').replace('PE','DOWN'),
      decisiveAgreement:c.decisiveBias===t.side.replace('CE','UP').replace('PE','DOWN')};
  });
  const base=enriched;
  const idea14=enriched.filter(t=>t.biasAgreement);
  const idea17=enriched.filter(t=>t.decisiveAgreement);
  const excluded14=enriched.filter(t=>!t.biasAgreement);
  const excluded17=enriched.filter(t=>!t.decisiveAgreement);
  const scenarios={baseline:base,idea14_direction_only:idea14,idea17_idea14_plus_decisive_threshold:idea17};
  const result={
    schemaVersion:1,
    study:'Idea 17 diagnostic: daily-bias direction filter versus decisive daily-bias threshold',
    period:{startDate,endDate},
    frozenSpec:{
      dailyBias:'prior completed NIFTY trading day close versus open; UP if close>open, DOWN if close<open, FLAT if equal.',
      decisiveThresholdPct:FROZEN_DECISIVE_THRESHOLD_PCT,
      decisiveBias:`UP/DOWN only when absolute prior-day open-to-close return >= ${FROZEN_DECISIVE_THRESHOLD_PCT}%; otherwise FLAT.`,
      entryGate:'trade direction must agree with the selected daily bias; FLAT or disagreement means no trade.',
      lookahead:'none; only prior completed day is used.',
      source:'retrospective filter on the frozen Idea 10A baseline trade set; Idea 10A signal/confirmation/exit mechanics are unchanged.'
    },
    dataIntegrity:{
      baselineTrades:trades.length,
      multiTradeDates,
      multiTradeDateCount:multiTradeDates.length,
      dailyRows:daily.length,
      missingPriorBiasTrades:enriched.filter(t=>t.dailyBias==='DATA_MISSING').length
    },
    scenarios:Object.fromEntries(Object.entries(scenarios).map(([name,rows])=>[name,{...stats(rows),...reversalStats(rows),ceTrades:rows.filter(x=>x.side==='CE').length,peTrades:rows.filter(x=>x.side==='PE').length}])),
    exclusions:{
      idea14:{trades:excluded14.length,...stats(excluded14),pnlBySide:{CE:stats(excluded14.filter(x=>x.side==='CE')).totalPnl,PE:stats(excluded14.filter(x=>x.side==='PE')).totalPnl}},
      idea17:{trades:excluded17.length,...stats(excluded17),pnlBySide:{CE:stats(excluded17.filter(x=>x.side==='CE')).totalPnl,PE:stats(excluded17.filter(x=>x.side==='PE')).totalPnl}}
    },
    biasDistribution:{
      UP:enriched.filter(x=>x.dailyBias==='UP').length,
      DOWN:enriched.filter(x=>x.dailyBias==='DOWN').length,
      FLAT:enriched.filter(x=>x.dailyBias==='FLAT').length,
      decisiveUP:enriched.filter(x=>x.decisiveDailyBias==='UP').length,
      decisiveDOWN:enriched.filter(x=>x.decisiveDailyBias==='DOWN').length,
      decisiveFLAT:enriched.filter(x=>x.decisiveDailyBias==='FLAT').length
    },
    trades:enriched
  };
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({period:result.period,frozenThresholdPct:FROZEN_DECISIVE_THRESHOLD_PCT,dataIntegrity:result.dataIntegrity,scenarios:result.scenarios,exclusions:result.exclusions,biasDistribution:result.biasDistribution},null,2));
}
const a=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const[k,...v]=x.slice(2).split('=');return[k,v.join('=')]}));
if(process.argv[1]?.endsWith('idea17-diagnostic.mjs')) run({token:process.env.GROWW_ACCESS_TOKEN,baselinePath:a.baseline,startDate:a.start,endDate:a.end,spacingMs:+(process.env.GROWW_REQUEST_SPACING_MS||1500),out:a.out||'idea17-2026-diagnostic.json'}).catch(e=>{console.error(e.stack||e);process.exit(1)});

// CI trigger: rerun after shared baseline JSON writer fix.
