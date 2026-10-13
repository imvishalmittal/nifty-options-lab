import fs from 'node:fs';
import { normalizeCandles } from './groww-backtest-nifty-180.mjs';
import { run as runIdea10A } from './groww-idea10-2026-diagnostic.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import { indexLotSizeForExpiry } from './multi-index-credit-engine.mjs';

const API='https://api.groww.in/v1';
const THRESHOLDS=[0.25,0.5,1,1.5,2,3,5];
let last=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(t,e,p,sp=1500){const w=Math.max(0,sp-(Date.now()-last));if(w)await sleep(w);const u=new URL(API+e);for(const[k,v]of Object.entries(p))u.searchParams.set(k,String(v));for(let a=0;a<9;a++){last=Date.now();const r=await fetch(u,{headers:{Accept:'application/json',Authorization:`Bearer ${t}`,'X-API-VERSION':'1.0'}});const b=await r.json().catch(()=>({}));if(r.ok&&b.status!=='FAILURE')return b.payload??b;if((r.status===429||r.status>=500)&&a<8){await sleep(Math.min(5000*2**a,60000));continue}throw Error(`Groww ${e} failed ${r.status}: ${b?.message||JSON.stringify(b)}`)}throw Error('Groww retries exhausted')}
async function candles(t,symbol,date,sp){const p=await get(t,'/historical/candles',{exchange:'NSE',segment:'FNO',groww_symbol:symbol,start_time:`${date} 09:15:00`,end_time:`${date} 15:29:00`,candle_interval:'3minute'},sp);return normalizeCandles(p.candles??[])}

const CAPITAL=60000;
const EXIT_RULES=['baseline','target_0_5','target_1','target_2','target_3','breakeven_0_5','trail_1_0_0_5'];
function tradeCost(t,exit,slippagePointsPerLeg=0){const lot=indexLotSizeForExpiry('NIFTY',t.expiry);if(!(lot>0))return null;const lots=Math.floor(CAPITAL/(t.entry*lot));if(lots<1)return null;return calculateLongOptionRoundTripCosts({entryPremium:t.entry,exitPremium:exit,lotSize:lots*lot,tradeDate:t.date,slippagePointsPerLeg}).netPnl}
function replayExit(t,cs,rule){
 if(t.side!=='CE')return null; // PE is excluded: frozen host stop is inverted for a long-premium P&L model.
 const entry=t.entry,stop=t.stop,after=cs.filter(x=>x.timestamp>t.signalTime),targetPct=rule==='target_0_5'?.5:rule==='target_1'?1:rule==='target_2'?2:rule==='target_3'?3:null;
 let activeStop=stop,peak=entry,activated=false,exit=null,exitTime=null,reason=null;
 for(const c of after){
  if(c.timestamp.slice(11,16)>='15:15'){exit=c.close;exitTime=c.timestamp;reason='EOD';break}
  const stopTouched=c.low<=activeStop,target=targetPct==null?null:entry*(1+targetPct/100),targetTouched=target!=null&&c.high>=target;
  if(stopTouched){exit=c.open<=activeStop?c.open:activeStop;exitTime=c.timestamp;reason=activated?'MANAGED_STOP':'ORIGINAL_STOP';break}
  if(targetTouched){exit=target;exitTime=c.timestamp;reason='PROFIT_TARGET';break}
  // Decisions from a completed candle apply only to the next candle.
  if(rule==='breakeven_0_5'&&c.high>=entry*1.005){activated=true;activeStop=Math.max(activeStop,entry)}
  if(rule==='trail_1_0_0_5'){peak=Math.max(peak,c.high);if(peak>=entry*1.01){activated=true;activeStop=Math.max(activeStop,peak*0.995)}}
 }
 if(exit==null){const c=after.at(-1);if(!c)return null;exit=c.close;exitTime=c.timestamp;reason='LAST_AVAILABLE'}
 return {exit,exitTime,reason,netPnl:tradeCost(t,exit,0),stress0_5:tradeCost(t,exit,.5),stress1_0:tradeCost(t,exit,1)}
}
function summarizeExitRows(rows){
 const pnl=rows.map(x=>x.netPnl).filter(Number.isFinite),wins=pnl.filter(x=>x>0).reduce((a,b)=>a+b,0),loss=Math.abs(pnl.filter(x=>x<0).reduce((a,b)=>a+b,0));
 let eq=0,peak=0,dd=0;for(const x of pnl){eq+=x;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}
 let seed=20261012,rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const means=[];
 for(let i=0;i<5000&&pnl.length;i++){let s=0;for(let j=0;j<pnl.length;j++)s+=pnl[Math.floor(rand()*pnl.length)];means.push(s/pnl.length)}
 means.sort((a,b)=>a-b);
 return {trades:pnl.length,winners:pnl.filter(x=>x>0).length,winRate:pnl.length?pnl.filter(x=>x>0).length/pnl.length:null,totalNetPnl:pnl.reduce((a,b)=>a+b,0),profitFactor:loss?wins/loss:(wins?Infinity:null),maxDrawdownRupees:dd,meanPnlPerTrade:pnl.length?pnl.reduce((a,b)=>a+b,0)/pnl.length:null,bootstrap95PctMeanInterval:means.length?{lower:means[Math.floor(means.length*.025)],upper:means[Math.floor(means.length*.975)]}:null}
}
function counterfactualSummary(rows){
 const byRule={};
 for(const rule of EXIT_RULES){
  const selected=rows.filter(t=>t.side==='CE'&&t.counterfactuals?.[rule]);
  byRule[rule]={ceTrades:selected.length,excludedPeTrades:rows.filter(t=>t.side==='PE').length,costs:Object.fromEntries(['netPnl','stress0_5','stress1_0'].map(key=>[key,summarizeExitRows(selected.map(t=>({netPnl:t.counterfactuals[rule][key]})))]))};
 }
 const baseline=rows.filter(t=>t.side==='CE'&&t.counterfactuals?.baseline);
 byRule.baseline.replayParity={checkedTrades:baseline.length,matches:baseline.filter(t=>t.counterfactuals.baseline.exitTime===t.exitTime&&Math.abs(t.counterfactuals.baseline.exit-t.exit)<1e-8).length};
 return byRule;
}

function enrich(trade,cs){const entry=trade.entry,post=cs.filter(x=>x.timestamp>trade.signalTime),exitIdx=post.findIndex(x=>x.timestamp===trade.exitTime),path=exitIdx>=0?post.slice(0,exitIdx+1):post,upside=path.map(x=>(x.high/entry-1)*100),downside=path.map(x=>(x.low/entry-1)*100),mfe=upside.length?Math.max(...upside):null,mae=downside.length?Math.min(...downside):null,barsAlive=path.length,stopIndex=trade.stopOut?path.findIndex(x=>x.timestamp===trade.exitTime):-1,preStop=stopIndex>=0?path.slice(0,stopIndex):path,mfeBeforeStop=preStop.length?Math.max(...preStop.map(x=>(x.high/entry-1)*100)):null,stopBarHighPct=stopIndex>=0?(path[stopIndex].high/entry-1)*100:null,reached=Object.fromEntries(THRESHOLDS.map(th=>[th,mfeBeforeStop!=null&&mfeBeforeStop>=th]));return {...trade,mfePct:mfe,maePct:mae,barsAlive,threeBarSurvivor:barsAlive>=3,mfeBeforeStopPct:mfeBeforeStop,stopBarHighPct,reachedThresholdBeforeStop:reached,stopBarIntrabarOrderAmbiguous:stopIndex>=0}}
function median(a){const v=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2}
function summarize(rows){const stops=rows.filter(x=>x.stopOut),survivors=rows.filter(x=>x.threeBarSurvivor);return{trades:rows.length,stopOuts:stops.length,stopOutRate:rows.length?stops.length/rows.length:null,threeBarSurvivors:survivors.length,threeBarSurvivorRate:rows.length?survivors.length/rows.length:null,avgMfePct:rows.length?rows.reduce((s,x)=>s+x.mfePct,0)/rows.length:null,medianMfePct:median(rows.map(x=>x.mfePct)),avgMaePct:rows.length?rows.reduce((s,x)=>s+x.maePct,0)/rows.length:null,medianMaePct:median(rows.map(x=>x.maePct)),thresholds:Object.fromEntries(THRESHOLDS.map(th=>{const r=stops.filter(x=>x.reachedThresholdBeforeStop?.[th]);return[`${th}%`,{stopOutsAfterThreshold:r.length,shareOfStopOuts:stops.length?r.length/stops.length:null,shareOfAllTrades:rows.length?r.length/rows.length:null}]}))}}

function temporalSummary(rows){
 const periods=[
  {name:'jan_jun_2026',start:'2026-01-01',end:'2026-07-01'},
  {name:'jul_sep_2026',start:'2026-07-01',end:'2026-10-01'}
 ];
 const result={method:'Retrospective calendar split; not a true untouched holdout because rules were evaluated on the full study period',periods:{}};
 for(const period of periods){
  const selected=rows.filter(t=>t.side==='CE'&&t.date>=period.start&&t.date<period.end);
  result.periods[period.name]={startDate:period.start,endDateExclusive:period.end,byExitRule:{}};
  for(const rule of EXIT_RULES){
   const ruleRows=selected.filter(t=>t.counterfactuals?.[rule]);
   result.periods[period.name].byExitRule[rule]={
    trades:ruleRows.length,
    costs:Object.fromEntries(['netPnl','stress0_5','stress1_0'].map(key=>[key,summarizeExitRows(ruleRows.map(t=>({netPnl:t.counterfactuals[rule][key]})))]))
   };
  }
 }
 return result;
}

async function main(){const token=process.env.GROWW_ACCESS_TOKEN;if(!token)throw Error('GROWW_ACCESS_TOKEN required');const start='2026-01-01',end='2026-09-19',variants={};for(const variant of ['A','B']){last=0;const base=await runIdea10A({token,startDate:start,endDate:end,variant,spacingMs:+(process.env.GROWW_REQUEST_SPACING_MS||1500)}),rows=[];for(const t of base.trades){if(!t.contract?.symbol)continue;const cs=await candles(token,t.contract.symbol,t.date,+(process.env.GROWW_REQUEST_SPACING_MS||1500));const enriched=enrich(t,cs);enriched.counterfactuals=Object.fromEntries(EXIT_RULES.map(rule=>[rule,replayExit(t,cs,rule)]));rows.push(enriched)}variants[variant]={base:{variant:base.variant,ema:base.ema,period:base.period,tradeCount:base.tradeCount,stopOutCount:base.stopOutCount,stopOutRate:base.stopOutRate,summaries:base.summaries,bootstrap:base.bootstrap},diagnostics:summarize(rows),counterfactualSummary:counterfactualSummary(rows),temporalValidation:temporalSummary(rows),trades:rows}}
const out={schemaVersion:1,study:'Idea 20 favorable-excursion / exit-management diagnostic',host:'Idea 10A baseline',period:{startDate:start,endDate:end},rule:'Post-entry 3-minute option premium path; CE/PE both use premium-price excursion; threshold-before-stop excludes the stop bar because intrabar high/stop ordering is unknown; diagnostic only; no exit rule activated',thresholds:THRESHOLDS,variants};fs.writeFileSync(process.env.OUT||'idea20-2026-diagnostic.json',JSON.stringify(out,null,2));console.log(JSON.stringify({study:out.study,period:out.period,rule:'CE-only counterfactual exits; PE excluded because frozen host stop is inverted for long-premium P&L; stop-first on same-candle target/stop; completed-bar trailing changes apply next bar; stress0_5/stress1_0 are 0.5/1.0 premium points adverse slippage per leg',variants:Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,{base:v.base.summaries,diagnostics:v.diagnostics,counterfactualSummary:v.counterfactualSummary}]))},null,2))}
main().catch(e=>{console.error(e.stack||e);process.exit(1)})