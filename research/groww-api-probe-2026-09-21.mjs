const token = process.env.GROWW_ACCESS_TOKEN?.trim();
if (!token) throw new Error('GROWW_ACCESS_TOKEN missing');
const H={Accept:'application/json',Authorization:`Bearer ${token}`,'X-API-VERSION':'1.0'};
async function get(label,path){
  const r=await fetch('https://api.groww.in/v1'+path,{headers:H});
  const txt=await r.text(); let b={}; try{b=JSON.parse(txt)}catch{}
  console.log(JSON.stringify({label,status:r.status,ok:r.ok,bodyStatus:b?.status,error:b?.error?.message??b?.message??null,payloadKeys:b?.payload&&typeof b.payload==='object'?Object.keys(b.payload):[],preview:txt.slice(0,500)}));
  return {r,b};
}
const candle=(label,segment,symbol,start,end)=>get(label,`/historical/candles?exchange=NSE&segment=${segment}&groww_symbol=${encodeURIComponent(symbol)}&start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}&candle_interval=3minute`);
await get('user','/user/detail');
await candle('nifty-jan-2026','CASH','NSE-NIFTY','2026-01-01 09:15:00','2026-01-28 15:29:00');
const ex=await get('expiries-jan-2026','/historical/expiries?exchange=NSE&underlying_symbol=NIFTY&year=2026&month=1');
const expiry=ex.b?.payload?.expiries?.[0];
if(!expiry) throw new Error('No 2026 January expiry returned');
const cs=await get('contracts-'+expiry,`/historical/contracts?exchange=NSE&underlying_symbol=NIFTY&expiry_date=${expiry}`);
const contracts=cs.b?.payload?.contracts||[];
if(!contracts.length) throw new Error('No contracts returned');
const symbol=contracts.find(x=>/-(CE|PE)$/.test(x))||contracts[0];
const day=expiry;
await candle('option-first-contract','FNO',symbol,day+' 09:15:00',day+' 15:29:00');
await candle('option-previous-day','FNO',symbol,'2026-01-01 09:15:00','2026-01-05 15:29:00');
