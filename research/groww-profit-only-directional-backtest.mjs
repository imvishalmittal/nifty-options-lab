import fs from 'node:fs';
import { normalizeCandles, splitDateRange } from './groww-backtest-nifty-180.mjs';
import { parseNiftyOptionContract, nearestExpiry } from './nifty-180-premium-strategy.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import {
  PROFIT_ONLY_RULES, groupSpotSessions, openingRangeSignal, retestSignal,
  previousDayBreakSignal, regimeAlignedSignal, vwapContinuationSignal,
  selectItmContract, evaluateImmediateBreakeven,
} from './profit-only-directional-engine.mjs';

const BASE_URL='https://api.groww.in/v1';
const CAPITAL=60000;
export const SIGNALS=['ORB15','RETEST15','PREVIOUS_DAY_BREAK','REGIME_ORB_DEEP_ITM','VWAP_CONTINUATION'];
export const EXITS=['IMMEDIATE_BE','CONFIRM_BE_10','FINANCE_HALF_10','TRAIL_5_AFTER_BE_10','TRAIL_10_AFTER_BE_10'];
let lastRequestAt=0;
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
function addDays(text,days){const d=new Date(`${text}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

async function get(token,endpoint,params,spacingMs){
  const wait=Math.max(0,spacingMs-(Date.now()-lastRequestAt)); if(wait) await sleep(wait);
  const url=new URL(`${BASE_URL}${endpoint}`); for(const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v));
  for(let attempt=0;attempt<=8;attempt+=1){lastRequestAt=Date.now();const response=await fetch(url,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`,'X-API-VERSION':'1.0'}});const body=await response.json().catch(()=>({}));if(response.ok&&body.status!=='FAILURE')return body.payload??body;if((response.status===429||response.status>=500)&&attempt<8){await sleep(Math.min(5000*(2**attempt),60000));continue;}throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message||body?.message||JSON.stringify(body)}`);}throw new Error('Groww retries exhausted');
}

async function candles(token,{segment,symbol,start,end,interval='5minute'},spacingMs){
  const rows=[]; for(const chunk of splitDateRange(start,end,28)){const payload=await get(token,'/historical/candles',{exchange:'NSE',segment,groww_symbol:symbol,start_time:`${chunk.startDate} 09:15:00`,end_time:`${chunk.endDate} 15:29:00`,candle_interval:interval},spacingMs);rows.push(...normalizeCandles(payload.candles??[]));}return rows.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
}

async function expiries(token,years,spacingMs){const out=[];for(const year of years){const p=await get(token,'/historical/expiries',{exchange:'NSE',underlying_symbol:'NIFTY',year},spacingMs);out.push(...(p.expiries??[]));}return [...new Set(out)].sort();}
async function contracts(token,expiry,spacingMs){const p=await get(token,'/historical/contracts',{exchange:'NSE',underlying_symbol:'NIFTY',expiry_date:expiry},spacingMs);return (p.contracts??[]).map((row)=>parseNiftyOptionContract(row.groww_symbol??row.symbol??row)).filter(Boolean);}

function dailySessions(groups){return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>({date,high:Math.max(...rows.map(r=>r.high)),low:Math.min(...rows.map(r=>r.low)),close:rows.at(-1).close}));}
function optionRowAt(rows,timestamp){return rows.find((row)=>row.timestamp===timestamp)??null;}

function costs(position,date,lotSize,scenario,capital=CAPITAL){
  const lots=Math.floor(capital/(position.entry*lotSize)); if(lots<1)return null;
  const slip=scenario==='current'?0:scenario==='stress0_5'?0.5:1;
  if(position.financed&&lots>=2){const firstLots=Math.floor(lots/2);const secondLots=lots-firstLots;return calculateLongOptionRoundTripCosts({entryPremium:position.entry,exitPremium:position.firstExit,lotSize:firstLots*lotSize,tradeDate:date,slippagePointsPerLeg:slip}).netPnl+calculateLongOptionRoundTripCosts({entryPremium:position.entry,exitPremium:position.exit,lotSize:secondLots*lotSize,tradeDate:date,slippagePointsPerLeg:slip}).netPnl;}
  return calculateLongOptionRoundTripCosts({entryPremium:position.entry,exitPremium:position.exit,lotSize:lots*lotSize,tradeDate:date,slippagePointsPerLeg:slip}).netPnl;
}

function summary(rows,scenario){const v=rows.map(r=>r.money[scenario]).filter(Number.isFinite);const gp=v.filter(x=>x>0).reduce((a,b)=>a+b,0);const gl=Math.abs(v.filter(x=>x<0).reduce((a,b)=>a+b,0));let eq=0,peak=0,dd=0;for(const x of v){eq+=x;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}return{trades:v.length,winners:v.filter(x=>x>0).length,winRate:v.length?v.filter(x=>x>0).length/v.length:null,totalNetPnl:v.reduce((a,b)=>a+b,0),profitFactor:gl?gp/gl:(gp?Infinity:null),maxDrawdownRupees:dd};}
export function summarizeProfitOnly(rows){const side=(s)=>{const r=s==='combined'?rows:rows.filter(x=>x.side===s);return{current:summary(r,'current'),stress0_5:summary(r,'stress0_5'),stress1_0:summary(r,'stress1_0')}};return{combined:side('combined'),CE:side('CE'),PE:side('PE')};}

export function summarizePairedTrades(rows) {
  const pairs = new Map();
  for (const row of rows) {
    const key = [row.date, row.strategy, row.signalTime].join(':');
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(row);
  }
  const complete = [...pairs.entries()].filter(([, legs]) => legs.length === 2
    && new Set(legs.map((leg) => leg.side)).size === 2);
  if (complete.length !== pairs.size) throw new Error('Incomplete CE/PE pairs: ' + complete.length + '/' + pairs.size);
  const executable = complete.filter(([, legs]) => legs.every((leg) =>
    ['current', 'stress0_5', 'stress1_0'].every((scenario) => Number.isFinite(leg.money[scenario]))));
  const portfolioRows = executable.map(([pairId, legs]) => ({
    pairId,
    date: legs[0].date,
    strategy: legs[0].strategy,
    signalTime: legs[0].signalTime,
    legs,
    money: Object.fromEntries(['current', 'stress0_5', 'stress1_0'].map((scenario) => [
      scenario, legs.reduce((total, leg) => total + leg.money[scenario], 0),
    ])),
  }));
  return {
    candidatePairs: complete.length,
    skippedForCapital: complete.length - executable.length,
    summary: {
      current: summary(portfolioRows, 'current'),
      stress0_5: summary(portfolioRows, 'stress0_5'),
      stress1_0: summary(portfolioRows, 'stress1_0'),
    },
    pairs: portfolioRows,
  };
}

export async function backtestProfitOnly({token,startDate,endDate,lotSize=65,spacingMs=1500,signals=SIGNALS,exits=EXITS,tradeBothSides=false}){
  lastRequestAt=0;const lookback=addDays(startDate,-120);const spot=await candles(token,{segment:'CASH',symbol:'NSE-NIFTY',start:lookback,end:endDate},spacingMs);const groups=groupSpotSessions(spot);const daily=dailySessions(groups);const dates=[...groups.keys()].filter(d=>d>=startDate&&d<=endDate).sort();const expiryList=await expiries(token,[...new Set(dates.map(d=>Number(d.slice(0,4))))],spacingMs);const contractCache=new Map(),optionCache=new Map();const keys=signals.flatMap(s=>exits.map(e=>`${s}_${e}`));const variants=Object.fromEntries(keys.map(k=>[k,[]]));const sessions=[];
  for(const date of dates){const rows=groups.get(date);const dayIndex=daily.findIndex(d=>d.date===date);const previous=daily[dayIndex-1]??null;const priorCloses=daily.slice(0,dayIndex).map(d=>d.close);const candidateSignals=[openingRangeSignal(rows),retestSignal(rows),previousDayBreakSignal(rows,previous),regimeAlignedSignal(rows,priorCloses),vwapContinuationSignal(rows)].filter(Boolean);if(!candidateSignals.length){sessions.push({date,status:'NO_TRADE'});continue;}const expiry=nearestExpiry(expiryList,date);if(!expiry){sessions.push({date,status:'DATA_MISSING',reason:'No expiry'});continue;}if(!contractCache.has(expiry))contractCache.set(expiry,await contracts(token,expiry,spacingMs));const chain=contractCache.get(expiry);const spot925=rows.find(r=>r.timestamp.slice(11,16)==='09:25')?.open;if(!Number.isFinite(spot925)){sessions.push({date,status:'DATA_MISSING',reason:'No 09:25 spot'});continue;}
    for(const signal of candidateSignals.filter((row)=>signals.includes(row.strategy))){const directions=tradeBothSides?['UP','DOWN']:[signal.direction];for(const direction of directions){const contract=selectItmContract(chain,spot925,direction);if(!contract)continue;const cacheKey=`${date}:${contract.symbol}`;if(!optionCache.has(cacheKey))optionCache.set(cacheKey,await candles(token,{segment:'FNO',symbol:contract.symbol,start:date,end:date},spacingMs));const optionRows=optionCache.get(cacheKey);if(!optionRowAt(optionRows,signal.signal.timestamp))continue;for(const exit of exits){const position=evaluateImmediateBreakeven(optionRows,signal.signal.timestamp,exit);if(!position)continue;const key=`${signal.strategy}_${exit}`;const side=direction==='UP'?'CE':'PE';const legCapital=tradeBothSides?CAPITAL/2:CAPITAL;variants[key].push({date,strategy:signal.strategy,exitMode:exit,side,contract,spot925,signalDirection:signal.direction,signalTime:signal.signal.timestamp,allocatedCapital:legCapital,...position,money:{current:costs(position,date,lotSize,'current',legCapital),stress0_5:costs(position,date,lotSize,'stress0_5',legCapital),stress1_0:costs(position,date,lotSize,'stress1_0',legCapital)}});}}}
    sessions.push({date,status:'PROCESSED',signals:candidateSignals.map(s=>s.strategy)});
  }
  return{schemaVersion:1,study:tradeBothSides?'Profit-only simultaneous CE+PE validation':'Profit-only directional option suite',period:{startDate,endDate},methodology:{rules:PROFIT_ONLY_RULES,signals,exits,contractSelection:'actual dated NIFTY option nearest 200 points ITM; no premium anchor',capital:CAPITAL,capitalAllocation:tradeBothSides?'₹30,000 CE + ₹30,000 PE':'₹60,000 signal-directed leg',tradeBothSides,lotSize},sessions,variants:Object.fromEntries(keys.map(k=>[k,{summary:summarizeProfitOnly(variants[k]),...(tradeBothSides?{paired:summarizePairedTrades(variants[k])}:{}),trades:variants[k]}]))};
}

const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const [k,...v]=x.slice(2).split('=');return[k,v.join('=')]}));
if(process.argv[1]?.endsWith('groww-profit-only-directional-backtest.mjs'))backtestProfitOnly({token:process.env.GROWW_ACCESS_TOKEN,startDate:args.start,endDate:args.end,lotSize:Number(args['lot-size']||65),spacingMs:Number(process.env.GROWW_REQUEST_SPACING_MS||1500),signals:args.signals?.split(',')||SIGNALS,exits:args.exits?.split(',')||EXITS,tradeBothSides:args['trade-both-sides']==='true'}).then(r=>{if(args.out)fs.writeFileSync(args.out,`${JSON.stringify(r,null,2)}\n`);process.stdout.write(`${JSON.stringify({period:r.period,sessions:r.sessions.length},null,2)}\n`)}).catch(e=>{console.error(e.stack||e.message);process.exit(1)});
