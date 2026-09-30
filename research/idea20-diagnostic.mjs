import fs from 'node:fs';

const API='https://api.groww.in/v1';
let last=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(t,e,p,sp=1500){
  const w=Math.max(0,sp-(Date.now()-last)); if(w) await sleep(w);
  const u=new URL(API+e); for(const[k,v] of Object.entries(p)) u.searchParams.set(k,String(v));
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
function norm(rows){return(rows??[]).map(x=>{const ts=x.timestamp??x.time??x.startTime??x.start_time;return{timestamp:typeof ts==='number'?new Date(ts*1000).toISOString():String(ts),open:+(x.open??x.o),high:+(x.high??x.h),low:+(x.low??x.l),close:+(x.close??x.c)}}).filter(x=>x.timestamp&&Number.isFinite(x.high)&&Number.isFinite(x.low)&&Number.isFinite(x.close)).sort((a,b)=>a.timestamp.localeCompare(b.timestamp))}
function stats(rows,key){const v=rows.map(x=>x[key]).filter(Number.isFinite),p=v.filter(x=>x>0),n=v.filter(x=>x<0);const gp=p.reduce((a,b)=>a+b,0),gl=Math.abs(n.reduce((a,b)=>a+b,0));return{trades:v.length,winners:p.length,winRatePct:v.length?p.length/v.length*100:null,avg:v.length?v.reduce((a,b)=>a+b,0)/v.length:null,total:v.reduce((a,b)=>a+b,0),profitFactor:gl?gp/gl:(gp?Infinity:null)}}
export async function run({token,baselinePath,startDate='2026-01-01',endDate='2026-09-19',spacingMs=1500,out='idea20-2026-diagnostic.json'}){
  last=0;
  const base=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
  const trades=(base.trades??[]).filter(t=>t.date>=startDate&&t.date<=endDate&&t.contract?.symbol&&t.signalTime&&t.exitTime);
  const cache=new Map(), enriched=[];
  for(const t of trades){
    const key=t.date+':'+t.contract.symbol;
    if(!cache.has(key)){
      const p=await get(token,'/historical/candles',{exchange:'NSE',segment:'FNO',groww_symbol:t.contract.symbol,start_time:t.date+' 09:15:00',end_time:t.date+' 15:29:00',candle_interval:'3minute'},spacingMs);
      cache.set(key,norm(p.candles??[]));
    }
    const rows=cache.get(key), i0=rows.findIndex(x=>x.timestamp===t.signalTime), i1=rows.findIndex(x=>x.timestamp===t.exitTime);
    if(i0<0||i1<i0) continue;
    const path=rows.slice(i0+1,i1+1), entry=t.entry;
    const side=t.side;
    const favorable=x=>side==='CE'?(x.high/entry-1)*100:(x.high/entry-1)*100;
    const adverse=x=>side==='CE'?(x.low/entry-1)*100:(x.low/entry-1)*100;
    const mfeBars=path.map((x,i)=>({bars:i,mfePct:favorable(x),maePct:adverse(x)}));
    const firstAt=[0.25,0.5,1,1.5,2,3,5,7.5,10].map(th=>{const z=mfeBars.find(x=>x.mfePct>=th);return [th,z?.bars??null]});
    const maxMfe=Math.max(...mfeBars.map(x=>x.mfePct)), maxMae=Math.min(...mfeBars.map(x=>x.maePct));
    enriched.push({...t,barsAlive:path.length-1,maxFavorableExcursionPct:maxMfe,maxAdverseExcursionPct:maxMae,firstFavorableBars:Object.fromEntries(firstAt)});
  }
  const alive3=enriched.filter(t=>t.barsAlive>=3), stop=alive3.filter(t=>t.stopOut);
  const thresholds=[0.25,0.5,1,1.5,2,3,5];
  const byThreshold=Object.fromEntries(thresholds.map(th=>{
    const r=alive3.filter(t=>t.maxFavorableExcursionPct>=th);
    const s=r.filter(t=>t.stopOut);
    return [String(th),{thresholdPct:th,trades:r.length,stops:s.length,stopRatePct:r.length?s.length/r.length*100:null,avgPnl:r.length?r.reduce((a,x)=>a+(x.money?.current??0),0)/r.length:null,totalPnl:r.reduce((a,x)=>a+(x.money?.current??0),0)}];
  }));
  const result={schemaVersion:1,study:'Idea 20 favorable-excursion / exit-management diagnostic',period:{startDate,endDate},source:'Frozen Idea 10A baseline plus causal 3-minute option-candle path; no lookahead and no rule is activated.',dataIntegrity:{baselineTrades:base.trades?.length??0,eligibleTrades:trades.length,measuredTrades:enriched.length,aliveAtLeast3Bars:alive3.length,stopsAmongAlive3:stop.length},summary:{allMeasured:stats(enriched,'maxFavorableExcursionPct'),alive3:stats(alive3,'maxFavorableExcursionPct'),stopsAlive3:stats(stop,'maxFavorableExcursionPct')},thresholdDiagnostics:byThreshold,trades:enriched};
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({dataIntegrity:result.dataIntegrity,thresholdDiagnostics:result.thresholdDiagnostics},null,2));
}
const a=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const[k,...v]=x.slice(2).split('=');return[k,v.join('=')]}));
if(process.argv[1]?.endsWith('idea20-diagnostic.mjs')) run({token:process.env.GROWW_ACCESS_TOKEN,baselinePath:a.baseline,startDate:a.start,endDate:a.end,spacingMs:+(process.env.GROWW_REQUEST_SPACING_MS||1500),out:a.out||'idea20-2026-diagnostic.json'}).catch(e=>{console.error(e.stack||e);process.exit(1)});

// CI trigger: ensure the Idea 20 diagnostic can be restarted from the research branch.
