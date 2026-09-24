import fs from 'node:fs';
import { normalizeCandles, splitDateRange } from './groww-backtest-nifty-180.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import { indexLotSizeForExpiry, parseIndexOptionContract } from './multi-index-credit-engine.mjs';

const API='https://api.groww.in/v1', CAPITAL=60000, VARIANTS={
  IDEA13_H1:{fast:9,slow:21,holdBars:1},
  IDEA13_H2:{fast:9,slow:21,holdBars:2},
  IDEA14_BIAS:{fast:9,slow:21,holdBars:0},
  IDEA15_FIXED10:{fast:9,slow:21,thresholdMode:'FIXED_POINTS',threshold:10},
  IDEA15_WIDTH25:{fast:9,slow:21,thresholdMode:'BAND_WIDTH_PCT',threshold:0.25}
};
let lastRequestAt=0; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(token,endpoint,params,spacingMs){const wait=Math.max(0,spacingMs-(Date.now()-lastRequestAt));if(wait)await sleep(wait);const u=new URL(API+endpoint);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));for(let a=0;a<=8;a++){lastRequestAt=Date.now();const res=await fetch(u,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`,'X-API-VERSION':'1.0'},signal:AbortSignal.timeout(30000)});const body=await res.json().catch(()=>({}));if(res.ok&&body.status!=='FAILURE')return body.payload??body;if((res.status===429||res.status>=500)&&a<8){await sleep(Math.min(5000*2**a,60000));continue}throw Error(`Groww ${endpoint} failed (${res.status}): ${body?.error?.message||body?.message||JSON.stringify(body)}`)}throw Error('Groww retries exhausted')}
async function candles(token,{segment,symbol,start,end,interval='3minute'},spacingMs){const rows=[];for(const c of splitDateRange(start,end,28)){const p=await get(token,'/historical/candles',{exchange:'NSE',segment,groww_symbol:symbol,start_time:`${c.startDate} 09:15:00`,end_time:`${c.endDate} 15:29:00`,candle_interval:interval},spacingMs);rows.push(...normalizeCandles(p.candles??[]))}return rows.sort((a,b)=>a.timestamp.localeCompare(b.timestamp))}
async function expiries(token,years,spacingMs){const out=[];for(const year of years){const p=await get(token,'/historical/expiries',{exchange:'NSE',underlying_symbol:'NIFTY',year},spacingMs);out.push(...(p.expiries??[]))}return[...new Set(out)].sort()}
async function contracts(token,expiry,spacingMs){const p=await get(token,'/historical/contracts',{exchange:'NSE',underlying_symbol:'NIFTY',expiry_date:expiry},spacingMs);return(p.contracts??[]).map(x=>parseIndexOptionContract(x,'NIFTY')).filter(Boolean)}
function ema(rows,n){const k=2/(n+1);let prev=null;return rows.map((r,i)=>{if(i===n-1)prev=rows.slice(0,n).reduce((s,x)=>s+x.close,0)/n;else if(i>=n)prev=r.close*k+prev*(1-k);return prev})}
function group(rows){const m=new Map;for(const r of rows){const d=r.timestamp.slice(0,10);if(!m.has(d))m.set(d,[]);m.get(d).push(r)}return m}
function atm(chain,spot,dir){const type=dir==='UP'?'CE':'PE';const c=chain.filter(x=>(x.type===type||x.optionType===type)&&x.strike!=null);if(!c.length)return null;const strikes=[...new Set(c.map(x=>+x.strike))].sort((a,b)=>a-b);const k=strikes.reduce((best,x)=>Math.abs(x-spot)<Math.abs(best-spot)?x:best,strikes[0]);return c.find(x=>+x.strike===k)??null}
function cost(entry,exit,lot,date,slip){const n=Math.floor(CAPITAL/(entry*lot));return n<1?null:calculateLongOptionRoundTripCosts({entryPremium:entry,exitPremium:exit,lotSize:n*lot,tradeDate:date,slippagePointsPerLeg:slip}).netPnl}
function stats(rows,s){const v=rows.map(x=>x.money[s]).filter(Number.isFinite),gp=v.filter(x=>x>0).reduce((a,b)=>a+b,0),gl=Math.abs(v.filter(x=>x<0).reduce((a,b)=>a+b,0));let eq=0,peak=0,dd=0;for(const x of v){eq+=x;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}return{trades:v.length,winners:v.filter(x=>x>0).length,winRate:v.length?v.filter(x=>x>0).length/v.length:null,totalNetPnl:v.reduce((a,b)=>a+b,0),profitFactor:gl?gp/gl:(gp?Infinity:null),maxDrawdownRupees:dd}}
function boot(rows,s,N=5000){const v=rows.map(x=>x.money[s]).filter(Number.isFinite);if(!v.length)return{samples:N,mean:null,lower:null,upper:null};let seed=20260923,r=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296},m=[];for(let i=0;i<N;i++){let x=0;for(let j=0;j<v.length;j++)x+=v[Math.floor(r()*v.length)];m.push(x/v.length)}m.sort((a,b)=>a-b);return{samples:N,mean:v.reduce((a,b)=>a+b,0)/v.length,lower:m[Math.floor(N*.025)],upper:m[Math.floor(N*.975)]}}
function zone(row,fast,slow,mode,threshold){if(!Number.isFinite(fast)||!Number.isFinite(slow))return'INSIDE';const hi=Math.max(fast,slow),lo=Math.min(fast,slow);let d=threshold;if(mode==='BAND_WIDTH_PCT')d=Math.abs(fast-slow)*threshold;return row.close>=hi+d?'ABOVE':row.close<=lo-d?'BELOW':'INSIDE'}
function priorBias(days,date){const ds=[...days.keys()].filter(d=>d<date).sort();const prev=ds.at(-1);if(!prev)return'FLAT';const r=days.get(prev);if(!r?.length)return'FLAT';const move=r.at(-1).close-r[0].open;return move>0?'UP':move<0?'DOWN':'FLAT'}
function rawBreaks(rows,fast,slow){
  const out=[];
  const start=slow.findIndex(Number.isFinite);for(let i=Math.max(1,start);i<rows.length;i++){
    const r=rows[i],p=rows[i-1];
    if(!Number.isFinite(r.close)||!Number.isFinite(p.close)||!Number.isFinite(fast[i])||!Number.isFinite(slow[i])||!Number.isFinite(fast[i-1])||!Number.isFinite(slow[i-1]))continue;
    const up=r.close>fast[i]&&r.close>slow[i]&&p.close<=fast[i-1];
    const dn=r.close<fast[i]&&r.close<slow[i]&&p.close>=fast[i-1];
    if(up||dn)out.push({index:i,row:r,direction:up?'UP':'DOWN'});
  }
  return out;
}
function findCandidate(raws,rows,fast,slow,variant){
  for(const raw of raws){
    const i=raw.index,direction=raw.direction;
    if(variant.holdBars>0){
      let ok=true;
      for(let k=1;k<=variant.holdBars;k++){
        const x=rows[i+k];
        if(!x){ok=false;break}
        const above=x.close>fast[i+k]&&x.close>slow[i+k];
        const below=x.close<fast[i+k]&&x.close<slow[i+k];
        if((direction==='UP'&&!above)||(direction==='DOWN'&&!below)){ok=false;break}
      }
      if(!ok)continue;
      const j=i+variant.holdBars;
      return{index:j,row:rows[j],direction,originIndex:i,originTime:raw.row.timestamp};
    }
    if(variant.thresholdMode){
      const outer=direction==='UP'?Math.max(fast[i],slow[i]):Math.min(fast[i],slow[i]);
      const distance=variant.thresholdMode==='FIXED_POINTS'?variant.threshold:Math.abs(fast[i]-slow[i])*variant.threshold;
      if(direction==='UP'&&raw.row.close<outer+distance)continue;
      if(direction==='DOWN'&&raw.row.close>outer-distance)continue;
    }
    return{index:i,row:raw.row,direction,originIndex:i,originTime:raw.row.timestamp};
  }
  return null;
}

export async function run({token,startDate,endDate,spacingMs=1500,out}){lastRequestAt=0;
const spot=await candles(token,{segment:'CASH',symbol:'NSE-NIFTY',start:startDate,end:endDate},spacingMs),days=group(spot),dates=[...days.keys()].filter(d=>d>=startDate&&d<=endDate).sort(),years=[...new Set(dates.map(d=>+d.slice(0,4)))],ex=await expiries(token,years,spacingMs),cc=new Map,oc=new Map;const results={};for(const name of Object.keys(VARIANTS))results[name]={variant:name,trades:[],diagnostics:{rawUnderlyingBreaks:0,candidateBreaks:0,confirmedBreaks:0,cutoffMisses:0,biasFiltered:0,daysWithFiniteEma:0,upBreaks:0,downBreaks:0,expiryMatches:0}};
for(const date of dates){const rows=days.get(date);if(!rows?.length)continue;const expiry=ex.find(x=>x>=date);if(!expiry)continue;for(const name of Object.keys(VARIANTS))results[name].diagnostics.expiryMatches++;if(!cc.has(expiry))cc.set(expiry,await contracts(token,expiry,spacingMs));const chain=cc.get(expiry);for(const[name,v]of Object.entries(VARIANTS)){const fast=ema(rows,v.fast),slow=ema(rows,v.slow);if(fast.filter(Number.isFinite).length>0)results[name].diagnostics.daysWithFiniteEma++;const raws=rawBreaks(rows,fast,slow);results[name].diagnostics.rawUnderlyingBreaks+=raws.length;results[name].diagnostics.upBreaks+=raws.filter(x=>x.direction==='UP').length;results[name].diagnostics.downBreaks+=raws.filter(x=>x.direction==='DOWN').length;const b=findCandidate(raws,rows,fast,slow,v);if(!b)continue;results[name].diagnostics.candidateBreaks++;if(b.row.timestamp.slice(11,16)>='15:15'){results[name].diagnostics.cutoffMisses++;continue}results[name].diagnostics.confirmedBreaks++;if(name==='IDEA14_BIAS'){const bias=priorBias(days,date);if(bias==='FLAT'||bias!==b.direction){results[name].diagnostics.biasFiltered++;continue}}const ct=atm(chain,b.row.close,b.direction);if(!ct)continue;const key=`${date}:${ct.symbol}`;if(!oc.has(key))oc.set(key,await candles(token,{segment:'FNO',symbol:ct.symbol,start:date,end:date},spacingMs));const o=oc.get(key),of=ema(o,v.fast),os=ema(o,v.slow),j=o.findIndex(x=>x.timestamp===b.row.timestamp);if(j<Math.max(v.fast,v.slow)||j<1)continue;const q=o[j],p=o[j-1],up=q.close>of[j]&&q.close>os[j]&&p.close<=of[j-1],dn=q.close<of[j]&&q.close<os[j]&&p.close>=of[j-1];if(!((b.direction==='UP'&&up)||(b.direction==='DOWN'&&dn)))continue;const stop=b.direction==='UP'?q.low:q.high;let exit=null,reason=null,stopOut=false;for(const x of o.filter(x=>x.timestamp>q.timestamp)){if(x.timestamp.slice(11,16)>='15:15'){exit=x.close;reason='EOD';break}if(b.direction==='UP'&&x.low<=stop){exit=x.open<=stop?x.open:stop;reason='OPTION_CONFIRMATION_BAR_STOP';stopOut=true;break}if(b.direction==='DOWN'&&x.high>=stop){exit=x.open>=stop?x.open:stop;reason='OPTION_CONFIRMATION_BAR_STOP';stopOut=true;break}}if(exit==null){const x=o.at(-1);if(x){exit=x.close;reason='LAST_AVAILABLE'}}if(!Number.isFinite(exit))continue;const lot=indexLotSizeForExpiry('NIFTY',expiry);if(!(lot>0))continue;const bias=priorBias(days,date);results[name].trades.push({date,variant:name,direction:b.direction,side:b.direction==='UP'?'CE':'PE',contract:ct,expiry,signalTime:b.row.timestamp,originTime:b.originTime,entry:q.close,stop,exit,exitReason:reason,stopOut,dailyBias:bias,money:{current:cost(q.close,exit,lot,date,0),stress0_5:cost(q.close,exit,lot,date,.5),stress1_0:cost(q.close,exit,lot,date,1)}})}}
for(const[name,r]of Object.entries(results)){r.tradeCount=r.trades.length;r.stopOutCount=r.trades.filter(x=>x.stopOut).length;r.stopOutRate=r.tradeCount?r.stopOutCount/r.tradeCount:null;r.summaries=Object.fromEntries(['current','stress0_5','stress1_0'].map(s=>[s,stats(r.trades,s)]));r.bootstrap=Object.fromEntries(['current','stress0_5','stress1_0'].map(s=>[s,boot(r.trades,s)]));delete r.trades}
const output={schemaVersion:1,dataDiagnostics:{spotCandles:spot.length,allDays:days.size,dates:dates.length,expiryCount:ex.length,firstDate:dates[0]??null,lastDate:dates.at(-1)??null,firstExpiry:ex[0]??null,lastExpiry:ex.at(-1)??null},study:'Idea 13/14/15 frozen 2026 diagnostic against Idea 10A failure mode',period:{startDate,endDate},capital:CAPITAL,baseline:'Idea 10A Variant A: 156 trades, PF 0.994, net -4824 normal cost',frozen:{IDEA13_H1:'9/21 EMA; first ABOVE/BELOW transition must hold same zone for 1 additional 3-min bar',IDEA13_H2:'9/21 EMA; first ABOVE/BELOW transition must hold same zone for 2 additional 3-min bars',IDEA14_BIAS:'9/21 EMA; prior completed trading day open-to-close bias must agree with break direction; FLAT filtered',IDEA15_FIXED10:'9/21 EMA; close must exceed outer EMA by >=10 NIFTY points',IDEA15_WIDTH25:'9/21 EMA; close must exceed outer EMA by >=25% of EMA band width'},results};if(out)fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');return output}
const a=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const[k,...v]=x.slice(2).split('=');return[k,v.join('=')]}));if(process.argv[1]?.endsWith('idea13-15-2026-diagnostic.mjs'))run({token:process.env.GROWW_ACCESS_TOKEN,startDate:a.start,endDate:a.end,spacingMs:+(process.env.GROWW_REQUEST_SPACING_MS||1500),out:a.out}).then(r=>console.log(JSON.stringify(Object.fromEntries(Object.entries(r.results).map(([k,v])=>[k,{tradeCount:v.tradeCount,stopOutRate:v.stopOutRate,summaries:v.summaries,diagnostics:v.diagnostics}])),null,2))).catch(e=>{console.error(e.stack||e);process.exit(1)});
