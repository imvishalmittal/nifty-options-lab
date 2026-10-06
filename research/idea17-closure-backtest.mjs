import fs from 'node:fs';
import { normalizeCandles, splitDateRange } from './groww-backtest-nifty-180.mjs';

const API='https://api.groww.in/v1';
const THRESHOLD=0.5;
const BOOTSTRAP_N=5000;
const BOOTSTRAP_SEED=20260816;
let last=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(t,e,p,sp=1500){
  const w=Math.max(0,sp-(Date.now()-last)); if(w) await sleep(w);
  const u=new URL(API+e); for(const[k,v]of Object.entries(p))u.searchParams.set(k,String(v));
  for(let a=0;a<9;a++){
    last=Date.now(); const r=await fetch(u,{headers:{Accept:'application/json',Authorization:`Bearer ${t}`,'X-API-VERSION':'1.0'}});
    const b=await r.json().catch(()=>({}));
    if(r.ok&&b.status!=='FAILURE')return b.payload??b;
    if((r.status===429||r.status>=500)&&a<8){await sleep(Math.min(5000*2**a,60000));continue}
    throw Error(`Groww ${e} failed ${r.status}: ${b?.message||JSON.stringify(b)}`);
  } throw Error('Groww retries exhausted');
}
async function candles(t,start,end,sp){
  const z=[]; for(const c of splitDateRange(start,end,28)){
    const p=await get(t,'/historical/candles',{exchange:'NSE',segment:'CASH',groww_symbol:'NSE-NIFTY',start_time:c.startDate+' 09:15:00',end_time:c.endDate+' 15:29:00',candle_interval:'3minute'},sp);
    z.push(...normalizeCandles(p.candles??[]));
  } return z.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
}
function aggregate(rows){const m=new Map();for(const r of rows){const d=r.timestamp.slice(0,10);let x=m.get(d);if(!x)x={date:d,open:r.open,high:r.high,low:r.low,close:r.close};else{x.high=Math.max(x.high,r.high);x.low=Math.min(x.low,r.low);x.close=r.close}m.set(d,x)}return[...m.values()].sort((a,b)=>a.date.localeCompare(b.date))}
function classify(daily,date){const p=daily.filter(x=>x.date<date).at(-1);if(!p)return null;const mag=(p.close/p.open-1)*100;const bias=mag>0?'UP':mag<0?'DOWN':'FLAT';return{bias,decisive:Math.abs(mag)>=THRESHOLD?bias:'FLAT',magnitudePct:mag,priorDate:p.date}}
function stats(rows,key='current'){const v=rows.map(x=>x.money?.[key]).filter(Number.isFinite),pos=v.filter(x=>x>0),neg=v.filter(x=>x<0),gp=pos.reduce((a,b)=>a+b,0),gl=Math.abs(neg.reduce((a,b)=>a+b,0));let eq=0,peak=0,dd=0;for(const x of v){eq+=x;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}return{trades:v.length,winners:pos.length,winRatePct:v.length?pos.length/v.length*100:null,totalPnl:v.reduce((a,b)=>a+b,0),avgPnl:v.length?v.reduce((a,b)=>a+b,0)/v.length:null,profitFactor:gl?gp/gl:(gp?Infinity:null),maxDrawdownRupees:dd}}
function clusteredBootstrap(rows,key='current',N=BOOTSTRAP_N){
  const groups={}; for(const t of rows){const v=t.money?.[key];if(Number.isFinite(v))(groups[t.date.slice(0,7)]??=[]).push(v)}
  const months=Object.values(groups); if(!months.length)return{samples:N,clusters:0,mean:null,lower95:null,upper95:null,seed:BOOTSTRAP_SEED};
  let seed=BOOTSTRAP_SEED,r=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const sums=[]; for(let i=0;i<N;i++){let s=0;for(let j=0;j<months.length;j++){const q=months[Math.floor(r()*months.length)];for(const v of q)s+=v}sums.push(s)}
  sums.sort((a,b)=>a-b); const mean=rows.map(t=>t.money?.[key]).filter(Number.isFinite).reduce((a,b)=>a+b,0);
  return{samples:N,clusters:months.length,mean,lower95:sums[Math.floor(N*.025)],upper95:sums[Math.floor(N*.975)],seed:BOOTSTRAP_SEED};
}
function monthly(rows){const out={};for(const t of rows){const m=t.date.slice(0,7);out[m]??=[];out[m].push(t)}return Object.fromEntries(Object.entries(out).map(([m,r])=>[m,{...stats(r),pnl:stats(r).totalPnl}]))}
function annual(rows){const out={};for(const t of rows){const y=t.date.slice(0,4);out[y]??=[];out[y].push(t)}return Object.fromEntries(Object.entries(out).map(([y,r])=>[y,{...stats(r),pnl:stats(r).totalPnl}]))}
function tradeKey(t,i){return [t.date,t.side,t.entryTime??t.entryTimestamp??t.entry??'',t.exitTime??t.exitTimestamp??t.exit??'',i].join('|')}
function forensic(rows){
  const winners=rows.map((t,i)=>({i,key:tradeKey(t,i),pnl:t.money?.current,date:t.date,side:t.side})).filter(x=>x.pnl>0).sort((a,b)=>b.pnl-a.pnl);
  const removals=[
    {name:'none',indices:[]},
    {name:'removeLargestWinner',indices:winners.slice(0,1).map(x=>x.i)},
    {name:'removeLargest3Winners',indices:winners.slice(0,3).map(x=>x.i)}
  ];
  const out={winnerRanking:winners.slice(0,10),scenarios:{}};
  for(const rm of removals){
    const drop=new Set(rm.indices),kept=rows.filter((_,i)=>!drop.has(i));
    out.scenarios[rm.name]={
      removed:winners.filter(x=>drop.has(x.i)),
      current:stats(kept,'current'),
      stress0_5:stats(kept,'stress0_5'),
      stress1_0:stats(kept,'stress1_0'),
      clusteredBootstrap:{
        current:clusteredBootstrap(kept,'current'),
        stress0_5:clusteredBootstrap(kept,'stress0_5'),
        stress1_0:clusteredBootstrap(kept,'stress1_0')
      },
      autoReject:{
        currentNetNonPositive:stats(kept,'current').totalPnl<=0,
        currentPfNotAbove1:!(stats(kept,'current').profitFactor>1),
        bootstrapLbNonPositive:clusteredBootstrap(kept,'current').lower95<=0,
        triggered:stats(kept,'current').totalPnl<=0 || !(stats(kept,'current').profitFactor>1) || clusteredBootstrap(kept,'current').lower95<=0
      }
    }
  }
  const months=monthly(rows),years=annual(rows),net=stats(rows).totalPnl;
  out.concentration={
    totalPnl:net,
    topMonth:Object.entries(months).sort((a,b)=>b[1].pnl-a[1].pnl)[0]??null,
    topMonthSharePct:(Object.values(months).length?Math.max(...Object.values(months).map(x=>x.pnl))/net*100:null),
    topYear:Object.entries(years).sort((a,b)=>b[1].pnl-a[1].pnl)[0]??null,
    positiveMonths:Object.values(months).filter(x=>x.pnl>0).length,
    totalMonths:Object.keys(months).length
  };
  return out;
}
export async function run({token,baselinePath,startDate,endDate,spacingMs=1500,out}){
  last=0;
  const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
  const trades=baseline.trades??[];
  const ps=startDate==='2020-01-01'?'2019-12-01':(()=>{const d=new Date(startDate+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-35);return d.toISOString().slice(0,10)})();
  const intraday=await candles(token,ps,endDate,spacingMs),daily=aggregate(intraday);
  const enriched=trades.map(t=>{const c=classify(daily,t.date);if(!c)throw Error(`Missing prior bias for ${t.date}`);const side=t.side==='CE'?'UP':'DOWN';return{...t,dailyBias:c.bias,decisiveDailyBias:c.decisive,dailyBiasMagnitudePct:c.magnitudePct,priorDailyDate:c.priorDate,biasAgreement:c.bias===side,decisiveAgreement:c.decisive===side}});
  const selected=enriched.filter(t=>t.decisiveAgreement);
  const scenarios={baseline:enriched,directionOnly:enriched.filter(t=>t.biasAgreement),idea17:selected};
  const result={schemaVersion:2,period:{startDate,endDate},frozenSpec:{bias:'prior completed NIFTY trading day O→C',decisiveThresholdPct:THRESHOLD,gate:'trade direction must agree with decisive prior-day bias; FLAT/disagreement excluded',lookahead:'none'},dataIntegrity:{baselineTrades:trades.length,selectedTrades:selected.length,dailyRows:daily.length,missingPriorBiasTrades:0,reconciliation:(enriched.length===trades.length?'PASS':'FAIL')},scenarios:{},annual:{},monthly:{},bootstrap:{},stress:{},forensic:null,trades:enriched};
  for(const[k,r]of Object.entries(scenarios)){result.scenarios[k]={...stats(r),stopOuts:r.filter(x=>x.stopOut).length,reversalDrivenStopOuts:r.filter(x=>x.underlyingDirectionIntactAtOptionStop===false).length,ceTrades:r.filter(x=>x.side==='CE').length,peTrades:r.filter(x=>x.side==='PE').length};result.bootstrap[k]=clusteredBootstrap(r);result.stress[k]={stress0_5:stats(r,'stress0_5'),stress1_0:stats(r,'stress1_0')}}
  result.annual=annual(selected); result.monthly=monthly(selected); result.forensic=forensic(selected);
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({period:result.period,dataIntegrity:result.dataIntegrity,scenario:result.scenarios.idea17,forensic:result.forensic},null,2));
}
const a=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const[k,...v]=x.slice(2).split('=');return[k,v.join('=')]}));
if(process.argv[1]?.endsWith('idea17-closure-backtest.mjs'))run({token:process.env.GROWW_ACCESS_TOKEN,baselinePath:a.baseline,startDate:a.start,endDate:a.end,spacingMs:+(process.env.GROWW_REQUEST_SPACING_MS||1500),out:a.out||'idea17-closure.json'}).catch(e=>{console.error(e.stack||e);process.exit(1)});
