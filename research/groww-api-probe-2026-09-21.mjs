import fs from 'node:fs';

const token = process.env.GROWW_ACCESS_TOKEN?.trim();
if (!token) throw new Error('GROWW_ACCESS_TOKEN missing');

const headers = {
  Accept: 'application/json',
  Authorization: `Bearer ${token}`,
  'X-API-VERSION': '1.0',
};

async function probe(label, url) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch {}
  console.log(JSON.stringify({
    label,
    status: response.status,
    ok: response.ok,
    bodyStatus: body?.status ?? null,
    error: body?.error?.message ?? body?.message ?? null,
    payloadKeys: body?.payload && typeof body.payload === 'object' ? Object.keys(body.payload).slice(0,20) : [],
    textPreview: text.slice(0,300),
  }));
  return { response, body };
}

const now = new Date();
const pad = n => String(n).padStart(2,'0');
const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}`;
const start = `${date} 09:15:00`;
const end = `${date} 15:30:00`;

await probe('user-detail','https://api.groww.in/v1/user/detail');
await probe('live-nifty','https://api.groww.in/v1/live-data/quote?exchange=NSE&segment=CASH&trading_symbol=NIFTY');
await probe('historical-nifty-current',`https://api.groww.in/v1/historical/candles?exchange=NSE&segment=CASH&groww_symbol=NSE-NIFTY&start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}&candle_interval=3minute`);
