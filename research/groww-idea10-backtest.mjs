import fs from 'node:fs';
import { normalizeCandles, splitDateRange } from './groww-backtest-nifty-180.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import { indexLotSizeForExpiry, parseIndexOptionContract } from './multi-index-credit-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const CAPITAL = 60000;
const VARIANTS = {
  A: { fast: 9, slow: 21 },
  B: { fast: 5, slow: 13 },
};
let lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function addDays(text, days) {
  const d = new Date(`${text}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
async function get(token, endpoint, params, spacingMs) {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt <= 8; attempt++) {
    lastRequestAt = Date.now();
    const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < 8) {
      await sleep(Math.min(5000 * (2 ** attempt), 60000));
      continue;
    }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
  throw new Error('Groww retries exhausted');
}
async function candles(token, { segment, symbol, start, end, interval = '3minute' }, spacingMs) {
  const rows = [];
  for (const chunk of splitDateRange(start, end, 28)) {
    const payload = await get(token, '/historical/candles', {
      exchange: 'NSE', segment, groww_symbol: symbol,
      start_time: `${chunk.startDate} 09:15:00`, end_time: `${chunk.endDate} 15:29:00`,
      candle_interval: interval,
    }, spacingMs);
    rows.push(...normalizeCandles(payload.candles ?? []));
  }
  return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
async function expiries(token, years, spacingMs) {
  const out = [];
  for (const year of years) {
    const p = await get(token, '/historical/expiries', { exchange: 'NSE', underlying_symbol: 'NIFTY', year }, spacingMs);
    out.push(...(p.expiries ?? []));
  }
  return [...new Set(out)].sort();
}
async function contracts(token, expiry, spacingMs) {
  const p = await get(token, '/historical/contracts', { exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry }, spacingMs);
  return (p.contracts ?? []).map((row) => parseIndexOptionContract(row, 'NIFTY')).filter(Boolean);
}
function ema(rows, period) {
  const k = 2 / (period + 1);
  let prev = null;
  return rows.map((r, i) => {
    if (i === period - 1) prev = rows.slice(0, period).reduce((s, x) => s + x.close, 0) / period;
    else if (i >= period) prev = r.close * k + prev * (1 - k);
    return prev;
  });
}
function group(rows) {
  const m = new Map();
  for (const r of rows) {
    const d = r.timestamp.slice(0, 10);
    if (!m.has(d)) m.set(d, []);
    m.get(d).push(r);
  }
  return m;
}
function nearestExpiry(expiriesList, date) {
  return expiriesList.find((x) => x >= date) ?? null;
}
function atmContract(chain, spot, direction) {
  const candidates = chain
    .filter((c) => c.type === 'CE' || c.type === 'PE')
    .filter((c) => c.strike != null);
  if (!candidates.length) return null;
  const strikes = [...new Set(candidates.map(c => Number(c.strike)))].sort((a,b)=>a-b);
  const strike = strikes.reduce((best, s) => Math.abs(s-spot) < Math.abs(best-spot) ? s : best, strikes[0]);
  const type = direction === 'UP' ? 'CE' : 'PE';
  return candidates.find(c => Number(c.strike) === strike && c.type === type) ?? null;
}
function costs(entry, exit, lotSize, date, slip) {
  const lots = Math.floor(CAPITAL / (entry * lotSize));
  if (lots < 1) return null;
  return calculateLongOptionRoundTripCosts({ entryPremium: entry, exitPremium: exit, lotSize: lots * lotSize, tradeDate: date, slippagePointsPerLeg: slip }).netPnl;
}
function summary(rows, scenario) {
  const vals = rows.map(r => r.money[scenario]).filter(Number.isFinite);
  const gp = vals.filter(v=>v>0).reduce((a,b)=>a+b,0);
  const gl = Math.abs(vals.filter(v=>v<0).reduce((a,b)=>a+b,0));
  let eq=0, peak=0, dd=0;
  for (const v of vals) { eq += v; peak=Math.max(peak,eq); dd=Math.max(dd,peak-eq); }
  return { trades: vals.length, winners: vals.filter(v=>v>0).length, winRate: vals.length ? vals.filter(v=>v>0).length/vals.length : null,
    totalNetPnl: vals.reduce((a,b)=>a+b,0), profitFactor: gl ? gp/gl : (gp ? Infinity : null), maxDrawdownRupees: dd };
}
function summarize(rows) {
  return Object.fromEntries(['current','stress0_5','stress1_0'].map(s=>[s,summary(rows,s)]));
}
function bootstrap(rows, scenario, samples=5000) {
  const vals = rows.map(r=>r.money[scenario]).filter(Number.isFinite);
  if (!vals.length) return { samples, mean:null, lower:null, upper:null };
  let seed=20260919; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const means=[];
  for(let i=0;i<samples;i++){let x=0;for(let j=0;j<vals.length;j++)x+=vals[Math.floor(rnd()*vals.length)];means.push(x/vals.length);}
  means.sort((a,b)=>a-b);
  return {samples,mean:vals.reduce((a,b)=>a+b,0)/vals.length,lower:means[Math.floor(samples*.025)],upper:means[Math.floor(samples*.975)]};
}
export async function backtestIdea10({ token, startDate, endDate, spacingMs=1500, variant='A' }) {
  lastRequestAt=0;
  const cfg=VARIANTS[variant]; if(!cfg) throw new Error('variant must be A or B');
  const lookback=addDays(startDate,-60);
  const spot=await candles(token,{segment:'CASH',symbol:'NSE-NIFTY',start:lookback,end:endDate},spacingMs);
  const days=group(spot);
  const dates=[...days.keys()].filter(d=>d>=startDate&&d<=endDate).sort();
  const expiryList=await expiries(token,[...new Set(dates.map(d=>Number(d.slice(0,4))))],spacingMs);
  const cache=new Map(), contractCache=new Map(), trades=[];
  for(const date of dates){
    const rows=days.get(date); if(!rows?.length) continue;
    const fast=ema(rows,cfg.fast), slow=ema(rows,cfg.slow);
    let signal=null;
    for(let i=cfg.slow-1;i<rows.length;i++){
      const r=rows[i], prev=rows[i-1];
      const up=r.close>fast[i] && r.close>slow[i] && prev.close<=fast[i-1];
      const down=r.close<fast[i] && r.close<slow[i] && prev.close>=fast[i-1];
      if(up||down){ signal={i,row:r,direction:up?'UP':'DOWN'}; break; }
    }
    if(!signal) continue;
    const expiry=nearestExpiry(expiryList,date); if(!expiry) continue;
    if(!contractCache.has(expiry)) contractCache.set(expiry,await contracts(token,expiry,spacingMs));
    const spotAtSignal=signal.row.close;
    const contract=atmContract(contractCache.get(expiry),spotAtSignal,signal.direction); if(!contract) continue;
    const key=`${date}:${contract.symbol}`;
    if(!cache.has(key)) cache.set(key,await candles(token,{segment:'FNO',symbol:contract.symbol,start:date,end:date},spacingMs));
    const opt=cache.get(key);
    const entry=opt.find(x=>x.timestamp===signal.row.timestamp);
    if(!entry) continue;
    // Invented but deliberately simple frozen stop: option signal-candle low for CE / high for PE.
    // Entry is at completed confirmation candle close; stop is evaluated only on subsequent bars.
    const stop=signal.direction==='UP'?entry.low:entry.high;
    let exit=null, exitReason=null, stopOut=false;
    for(const r of opt.filter(x=>x.timestamp>entry.timestamp)){
      if(r.timestamp.slice(11,16)>='15:15'){ exit=r.close; exitReason='EOD'; break; }
      if(signal.direction==='UP' && r.low<=stop){ exit= r.open<=stop ? r.open : stop; exitReason='OPTION_SIGNAL_BAR_STOP'; stopOut=true; break; }
      if(signal.direction==='DOWN' && r.high>=stop){ exit= r.open>=stop ? r.open : stop; exitReason='OPTION_SIGNAL_BAR_STOP'; stopOut=true; break; }
    }
    if(exit==null){const last=opt.at(-1);if(last){exit=last.close;exitReason='LAST_AVAILABLE';}}
    if(!Number.isFinite(exit)) continue;
    const lotSize=indexLotSizeForExpiry('NIFTY',expiry); if(!(lotSize>0)) continue;
    trades.push({date,variant,side:signal.direction==='UP'?'CE':'PE',contract,expiry,signalTime:signal.row.timestamp,entry:entry.close,stop,exit,exitReason,stopOut,
      money:{current:costs(entry.close,exit,lotSize,date,0),stress0_5:costs(entry.close,exit,lotSize,date,.5),stress1_0:costs(entry.close,exit,lotSize,date,1)}});
  }
  const stopouts=trades.filter(t=>t.stopOut);
  return {schemaVersion:1,study:'Idea 10 underlying-chart signal + independent option-chart confirmation',variant,ema:`${cfg.fast}/${cfg.slow}`,
    stopRule:'INVENTED_FROZEN_V1: entry at completed confirmation bar close; stop = same option confirmation candle low for CE / high for PE; evaluated only on subsequent option bars; gap fills at bar open; otherwise stop price; EOD exit from 15:15 onward.',
    period:{startDate,endDate},capital:CAPITAL,tradeCount:trades.length,stopOutCount:stopouts.length,stopOutRate:trades.length?stopouts.length/trades.length:null,
    summaries:summarize(trades),bootstrap:Object.fromEntries(['current','stress0_5','stress1_0'].map(s=>[s,bootstrap(trades,s)])),trades};
}
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const [k,...v]=x.slice(2).split('=');return[k,v.join('=')]}));
if(process.argv[1]?.endsWith('groww-idea10-backtest.mjs')){
  backtestIdea10({token:process.env.GROWW_ACCESS_TOKEN,startDate:args.start,endDate:args.end,spacingMs:Number(process.env.GROWW_REQUEST_SPACING_MS||1500),variant:args.variant||'A'})
    .then(r=>{if(args.out)fs.writeFileSync(args.out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({variant:r.variant,period:r.period,trades:r.tradeCount,stopOutRate:r.stopOutRate,summaries:r.summaries},null,2));})
    .catch(e=>{console.error(e.stack||e.message);process.exit(1)});
}
