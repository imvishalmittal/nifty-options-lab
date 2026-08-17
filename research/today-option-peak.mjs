import { backtestNifty180, normalizeCandles } from './groww-backtest-nifty-180.mjs';

const token = process.env.GROWW_ACCESS_TOKEN;
if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
const date = process.env.DATE || '2026-08-17';
const spacing = Number(process.env.GROWW_REQUEST_SPACING_MS || 1500);
let last = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function get(url) {
  const wait = Math.max(0, spacing - (Date.now() - last)); if (wait) await sleep(wait);
  last = Date.now();
  const r = await fetch(url, {headers:{Accept:'application/json',Authorization:`Bearer ${token}`,'X-API-VERSION':'1.0'}});
  const b = await r.json().catch(()=>({}));
  if (!r.ok || b.status === 'FAILURE') throw new Error(`Groww failed ${r.status}: ${b?.error?.message || b?.message || JSON.stringify(b)}`);
  return b.payload ?? b;
}
function peak(rows) {
  const valid = rows.filter(c => Number.isFinite(c.high));
  const max = valid.reduce((best,c)=>!best || c.high > best.high ? c : best, null);
  return max ? {premium:max.high,time:max.timestamp} : null;
}
const baseline = await backtestNifty180({token,startDate:date,endDate:date,maxCandidatesPerSide:8,lotSize:null,requestSpacingMsOverride:spacing});
const row = baseline.results[0];
if (!row?.callSelection || !row?.putSelection) throw new Error(`No selected CE/PE candidates: ${JSON.stringify(row)}`);
const out = {date, spot925:row.spot925, expiry:row.expiry, selections:{CE:row.callSelection,PE:row.putSelection}, histories:{}};
for (const [side, sel] of [['CE',row.callSelection],['PE',row.putSelection]]) {
  const payload = await get(`https://api.groww.in/v1/historical/candles?exchange=NSE&segment=FNO&groww_symbol=${encodeURIComponent(sel.symbol)}&start_time=${date}%2009%3A25%3A00&end_time=${date}%2015%3A29%3A00&candle_interval=1minute`);
  const rows = normalizeCandles(payload.candles ?? []);
  const day = rows.filter(c=>c.timestamp.slice(0,10)===date);
  const window = day.filter(c=>c.timestamp.includes('T09:30') || (c.timestamp.includes('T09:') && c.timestamp.slice(11,16) <= '09:45'));
  out.histories[side]={count:day.length, premiumAt930:day.find(c=>c.timestamp.slice(11,16)==='09:30')?.open ?? null, peakAllSession:peak(day), peakEntryWindow:peak(window)};
}
console.log(JSON.stringify(out,null,2));
