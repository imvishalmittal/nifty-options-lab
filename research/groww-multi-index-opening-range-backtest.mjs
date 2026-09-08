import fs from 'node:fs';
import { calculateOptionRoundTripCosts } from './groww-option-costs.mjs';
import { backtestNifty180, splitDateRange } from './groww-backtest-nifty-180.mjs';
import { indexLotSizeForExpiry, parseIndexOptionContract, selectCrossingSkewedSpread, selectListedIntervalCreditSpread } from './multi-index-credit-engine.mjs';
import { aggregateFiveMinute, normalizeCandles } from './groww-opening-range-credit-backtest.mjs';
import { evaluateCreditLifecycle, findOpeningRangeBreak, summarizeScenario } from './remaining-option-selling-engine.mjs';

const BASE_URL='https://api.groww.in/v1';
let lastRequestAt=0,requests=0,retries=0;
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

async function apiGet(token,endpoint,params,spacingMs){
  const url=new URL(`${BASE_URL}${endpoint}`);Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,String(value)));
  for(let attempt=0;attempt<=8;attempt+=1){
    const wait=Math.max(0,spacingMs-(Date.now()-lastRequestAt));if(wait)await sleep(wait);lastRequestAt=Date.now();requests+=1;
    const response=await fetch(url,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`,'X-API-VERSION':'1.0'}});
    const body=await response.json().catch(()=>({}));if(response.ok&&body.status!=='FAILURE')return body.payload??body;
    if((response.status===429||response.status>=500)&&attempt<8){retries+=1;await sleep(Math.min(5000*2**attempt,60000));continue;}
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message||body?.message||JSON.stringify(body)}`);
  }
}

async function candles(token,segment,symbol,startDate,endDate,spacingMs){
  const rows=[];for(const range of splitDateRange(startDate,endDate,28)){const payload=await apiGet(token,'/historical/candles',{exchange:'NSE',segment,groww_symbol:symbol,start_time:`${range.startDate} 09:15:00`,end_time:`${range.endDate} 15:29:00`,candle_interval:'1minute'},spacingMs);rows.push(...normalizeCandles(payload.candles??[]));}return rows.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
}
const byDate=(rows)=>{const map=new Map();for(const row of rows){const date=row.timestamp.slice(0,10);if(!map.has(date))map.set(date,[]);map.get(date).push(row);}return map;};
const dateDiff=(left,right)=>Math.round((new Date(`${right}T00:00:00Z`)-new Date(`${left}T00:00:00Z`))/86400000);
const nearestExpiry=(expiries,date)=>expiries.filter((expiry)=>dateDiff(date,expiry)>=1).sort()[0]??null;

function observations(shortRows,longRows,afterTimestamp){const longMap=new Map(longRows.map((row)=>[row.timestamp,row]));return shortRows.filter((row)=>row.timestamp>afterTimestamp&&longMap.has(row.timestamp)).map((short)=>{const long=longMap.get(short.timestamp);return{timestamp:short.timestamp,openDebit:short.open-long.open,highDebit:Math.max(0,short.high-long.low),lowDebit:Math.max(0,short.low-long.high),isFinal:short.timestamp.slice(11,16)==='15:15'};}).filter((row)=>[row.openDebit,row.highDebit,row.lowDebit].every(Number.isFinite));}
function costs(selection,entryPrices,exitPrices,lotSize,date,slippagePointsPerLeg){const short=calculateOptionRoundTripCosts({entryPremium:entryPrices.short,exitPremium:exitPrices.short,lotSize,tradeDate:date,slippagePointsPerLeg,side:'SHORT'});const long=calculateOptionRoundTripCosts({entryPremium:entryPrices.long,exitPremium:exitPrices.long,lotSize,tradeDate:date,slippagePointsPerLeg,side:'LONG'});return{netPnl:short.netPnl+long.netPnl,charges:short.charges.total+long.charges.total,legs:{short,long},width:Math.abs(selection.short.strike-selection.long.strike)};}
function summarize(results){const trades=results.filter((row)=>row.status==='TRADE');const scenario=(name)=>summarizeScenario(trades.map((row)=>row.costs[name].netPnl));return{sessions:results.length,signals:results.filter((row)=>row.signal?.status==='SIGNAL').length,trades:trades.length,dataMissing:results.filter((row)=>row.status==='DATA_MISSING').length,noTrade:results.filter((row)=>row.status==='NO_TRADE').length,normalized:scenario('normalized'),stress0_5:scenario('stress0_5'),stress1_0:scenario('stress1_0')};}

export async function backtestIndexCredit({token,underlying,spotSymbol,startDate,endDate,mode='M3',spacingMs=1600,crossingByDate=new Map()}){
  if(underlying==='FINNIFTY'&&endDate<'2021-01-11') return {schemaVersion:1,strategy:'M3-multi-index-opening-range-credit',underlying,period:{startDate,endDate},rules:{hedgeListedIntervals:6,targetDebitRatio:0.5,stopDebitRatio:2,exit:'15:15'},diagnostics:{requests:0,retries:0,notListed:true},results:[],summary:summarize([])};
  const spot=await candles(token,'CASH',spotSymbol,startDate,endDate,spacingMs);const sessions=byDate(spot);const years=[...new Set([Number(startDate.slice(0,4)),Number(endDate.slice(0,4)),Number(endDate.slice(0,4))+1])];const expiries=[];
  for(const year of years){const payload=await apiGet(token,'/historical/expiries',{exchange:'NSE',underlying_symbol:underlying,year},spacingMs);expiries.push(...(payload.expiries??[]));}
  const cache=new Map(),results=[];
  for(const [date,rows] of sessions){
    const signal=findOpeningRangeBreak(rows,aggregateFiveMinute(rows));if(signal.status!=='SIGNAL'){results.push({date,underlying,status:signal.status,signal,reason:signal.reason});continue;}
    const entryRow=rows.find((row)=>row.timestamp>signal.confirmationTimestamp);if(!entryRow){results.push({date,underlying,status:'DATA_MISSING',signal,reason:'Causal underlying entry bar unavailable'});continue;}
    const expiry=nearestExpiry([...new Set(expiries)],date);if(!expiry){results.push({date,underlying,status:'DATA_MISSING',signal,reason:'Eligible expiry unavailable'});continue;}
    if(!cache.has(expiry)){const payload=await apiGet(token,'/historical/contracts',{exchange:'NSE',underlying_symbol:underlying,expiry_date:expiry},spacingMs);cache.set(expiry,(payload.contracts??[]).map((row)=>parseIndexOptionContract(row,underlying)).filter(Boolean));}
    const crossingDirection=crossingByDate.get(date)??null;
    if(mode==='C1'&&!crossingDirection){results.push({date,underlying,status:'NO_TRADE',signal,reason:'No causal pre-09:45 ₹180 crossing'});continue;}
    const selection=mode==='C1'?selectCrossingSkewedSpread({contracts:cache.get(expiry),spot:entryRow.open,direction:signal.direction,crossingDirection}):selectListedIntervalCreditSpread(cache.get(expiry),entryRow.open,signal.direction);
    if(!selection){results.push({date,underlying,status:'DATA_MISSING',signal,expiry,reason:'Required listed-interval spread unavailable'});continue;}
    const [shortRows,longRows]=await Promise.all([candles(token,'FNO',selection.short.symbol,date,date,spacingMs),candles(token,'FNO',selection.long.symbol,date,date,spacingMs)]);const shortMap=new Map(shortRows.map((row)=>[row.timestamp,row])),longMap=new Map(longRows.map((row)=>[row.timestamp,row]));const entryTimestamp=[...shortMap.keys()].filter((timestamp)=>timestamp>signal.confirmationTimestamp&&longMap.has(timestamp)).sort()[0];
    if(!entryTimestamp){results.push({date,underlying,status:'DATA_MISSING',signal,expiry,selection,reason:'Synchronized next-minute entry unavailable'});continue;}
    const entryPrices={short:shortMap.get(entryTimestamp).open,long:longMap.get(entryTimestamp).open},entryCredit=entryPrices.short-entryPrices.long;const exit=evaluateCreditLifecycle({entryCredit,observations:observations(shortRows,longRows,entryTimestamp)});
    if(exit.status!=='EXIT'){results.push({date,underlying,status:exit.status,signal,expiry,selection,reason:exit.reason});continue;}
    const exitPrices={short:shortMap.get(exit.timestamp)?.open,long:longMap.get(exit.timestamp)?.open};if(![exitPrices.short,exitPrices.long].every(Number.isFinite)){results.push({date,underlying,status:'DATA_MISSING',signal,expiry,selection,reason:'Exit prices unavailable'});continue;}
    const lotSize=indexLotSizeForExpiry(underlying,expiry);if(!(lotSize>0)){results.push({date,underlying,status:'DATA_MISSING',signal,expiry,selection,reason:'Dated lot size unavailable'});continue;}
    const scenarios=Object.fromEntries([['normalized',0],['stress0_5',0.5],['stress1_0',1]].map(([name,slip])=>[name,costs(selection,entryPrices,exitPrices,lotSize,date,slip)]));
    results.push({date,underlying,status:'TRADE',signal,crossingDirection,expiry,selection,entryTimestamp,entryPrices,entryCredit,exitTimestamp:exit.timestamp,exitReason:exit.reason,exitPrices,lotSize,costs:scenarios});
  }
  return{schemaVersion:1,strategy:mode==='C1'?'C1-nifty-180-crossing-spread-skew':'M3-multi-index-opening-range-credit',underlying,period:{startDate,endDate},rules:{hedgeListedIntervals:6,targetDebitRatio:0.5,stopDebitRatio:2,exit:'15:15'},diagnostics:{requests,retries},results,summary:summarize(results)};
}

const args=Object.fromEntries(process.argv.slice(2).filter((x)=>x.startsWith('--')).map((x)=>{const[k,...v]=x.slice(2).split('=');return[k,v.join('=')];}));
if(process.argv[1]?.endsWith('groww-multi-index-opening-range-backtest.mjs')){
  if(!process.env.GROWW_ACCESS_TOKEN||!args.start||!args.end||!args.underlying)throw new Error('GROWW_ACCESS_TOKEN, --start, --end and --underlying are required');
  const mode=args.mode??'M3';let crossingByDate=new Map();
  if(mode==='C1'){
    const source=await backtestNifty180({token:process.env.GROWW_ACCESS_TOKEN,startDate:args.start,endDate:args.end,maxCandidatesPerSide:8,lotSize:null});
    crossingByDate=new Map(source.results.filter((row)=>row.side&&row.signalTime?.slice(11,16)<='09:45').map((row)=>[row.date,row.side==='CE'?'UP':'DOWN']));
  }
  const configs=args.underlying==='ALL'?[['NIFTY','NSE-NIFTY'],['BANKNIFTY','NSE-BANKNIFTY'],['FINNIFTY','NSE-FINNIFTY']]:[[args.underlying,args['spot-symbol']]];const documents=[];
  for(const[underlying,spotSymbol]of configs)documents.push(await backtestIndexCredit({token:process.env.GROWW_ACCESS_TOKEN,underlying,spotSymbol,startDate:args.start,endDate:args.end,mode,crossingByDate}));
  fs.writeFileSync(args.out??'multi-index-credit.json',`${JSON.stringify({schemaVersion:1,study:mode,period:{startDate:args.start,endDate:args.end},documents},null,2)}\n`);
}
