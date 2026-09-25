import fs from 'node:fs';

import { createGrowwPaperClient, completedCandles, indiaParts, sleep } from './groww-paper-client.mjs';
import { paperOptionCosts } from './option-costs.mjs';
import { nearestExpiry, timeOf } from './paper-engine.mjs';
import { indexLotSizeForExpiry, parseIndexOptionContract } from '../research/multi-index-credit-engine.mjs';

const JOURNAL = 'public/paper/idea15-trades.json';
const STATUS = 'public/paper/idea15-session-status.json';
const FAST = 9, SLOW = 21, THRESHOLD = 10, CAPITAL = 60000;
const INTERVAL = '3minute', SIGNAL_START = '09:15', ENTRY_CUTOFF = '15:15', EOD_TIME = '15:15';

function writeStatus(value) {
  fs.mkdirSync('public/paper', { recursive: true });
  fs.writeFileSync(STATUS, JSON.stringify({
    updatedAt: new Date().toISOString(), strategy: 'IDEA15_FIXED10', variant: 'FIXED10', ...value
  }, null, 2));
}
function ema(candles, period) {
  const k = 2 / (period + 1); let value = null;
  return candles.map((c, i) => {
    if (i === period - 1) value = candles.slice(0, period).reduce((s, x) => s + x.close, 0) / period;
    else if (i >= period) value = c.close * k + value * (1 - k);
    return value;
  });
}
function crossedDirection(candles, fast, slow, i) {
  if (i < SLOW || !Number.isFinite(fast[i]) || !Number.isFinite(slow[i]) ||
      !Number.isFinite(fast[i - 1]) || !Number.isFinite(slow[i - 1])) return null;
  const c = candles[i], p = candles[i - 1];
  if (c.close > fast[i] && c.close > slow[i] && p.close <= fast[i - 1]) return 'UP';
  if (c.close < fast[i] && c.close < slow[i] && p.close >= fast[i - 1]) return 'DOWN';
  return null;
}
function fixed10(c, fast, slow, i, direction) {
  const outer = direction === 'UP' ? Math.max(fast[i], slow[i]) : Math.min(fast[i], slow[i]);
  return direction === 'UP' ? c.close >= outer + THRESHOLD : c.close <= outer - THRESHOLD;
}
function atm(contracts, spot, direction) {
  const type = direction === 'UP' ? 'CE' : 'PE';
  const rows = contracts.map(x => parseIndexOptionContract(x, 'NIFTY')).filter(Boolean)
    .filter(x => x.optionType === type);
  return rows.length ? rows.toSorted((a,b) =>
    Math.abs(a.strike - spot) - Math.abs(b.strike - spot) || a.strike - b.strike)[0] : null;
}
function appendTrade(row) {
  let payload = { meta: {}, trades: [] };
  if (fs.existsSync(JOURNAL)) payload = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  payload.trades = Array.isArray(payload.trades) ? payload.trades : [];
  const key = `${row.date}|${row.strategy}|${row.variant}`;
  const i = payload.trades.findIndex(t => `${t.date}|${t.strategy}|${t.variant}` === key);
  if (i >= 0) payload.trades[i] = row; else payload.trades.push(row);
  payload.meta = { ...payload.meta, paperMode: true, paperStrategies: ['IDEA15_FIXED10'], lastPaperSession: row.date };
  fs.writeFileSync(JOURNAL, JSON.stringify(payload, null, 2));
}
async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const { apiGet, fetchCandles } = createGrowwPaperClient({ token });
  const { date } = indiaParts();
  writeStatus({ date, status: 'STARTING', rules: {
    ema: '9/21', timeframe: '3minute', underlying: 'NSE-NIFTY', option: 'ATM',
    threshold: 'completed NIFTY 3-minute close >= 10 points beyond outer EMA in break direction',
    stop: 'confirmation candle low for CE / high for PE; subsequent completed bars only; gap fills at open',
    entry: 'option confirmation candle close',
    exit: 'first option completed bar at/after 15:15 closes the trade; no overnight', capital: CAPITAL,
    paperOnly: true, noOrderApiUsed: true
  }});
  const year = Number(date.slice(0,4));
  const expiryPayload = await apiGet('/historical/expiries', { exchange:'NSE', underlying_symbol:'NIFTY', year });
  const expiry = nearestExpiry(expiryPayload.expiries ?? [], date);
  if (!expiry) { writeStatus({date,status:'DATA_MISSING',reason:'No weekly expiry'}); return; }
  const contractsPayload = await apiGet('/historical/contracts', {exchange:'NSE',underlying_symbol:'NIFTY',expiry_date:expiry});
  const contracts = contractsPayload.contracts ?? [];
  if (!contracts.length) { writeStatus({date,status:'DATA_MISSING',reason:'No NIFTY option contracts',expiry}); return; }

  let entered = null, processedSignalTimestamp = null;
  while (indiaParts().time < ENTRY_CUTOFF) {
    const now = indiaParts().time;
    const spot = completedCandles(await fetchCandles('CASH','NSE-NIFTY',date,SIGNAL_START,now,INTERVAL), now);
    if (spot.length < SLOW) { await sleep(30000); continue; }
    const fast = ema(spot,FAST), slow = ema(spot,SLOW);
    for (let i=SLOW-1;i<spot.length;i++) {
      const ts=spot[i].timestamp;
      if (ts===processedSignalTimestamp) continue;
      const direction=crossedDirection(spot,fast,slow,i);
      if (!direction || !fixed10(spot[i],fast,slow,i,direction)) continue;
      const chosen=atm(contracts,spot[i].close,direction);
      if (!chosen) continue;
      const option=completedCandles(await fetchCandles('FNO',chosen.symbol,date,SIGNAL_START,now,INTERVAL),now);
      const of=ema(option,FAST), os=ema(option,SLOW), j=option.findIndex(x=>x.timestamp===ts);
      if (j<SLOW || j<1) continue;
      processedSignalTimestamp=ts;
      const od=crossedDirection(option,of,os,j);
      if (od!==direction) continue;
      const confirmation=option[j], lotSize=indexLotSizeForExpiry('NIFTY',expiry);
      const lots=Math.floor(CAPITAL/(confirmation.close*lotSize));
      if (!(lotSize>0) || lots<1) { writeStatus({date,status:'NO_TRADE',reason:'₹60k capital cannot fund one NIFTY lot',expiry,contract:chosen,signalTime:ts}); return; }
      entered={expiry,contract:chosen,direction,signalTime:ts,entryTime:confirmation.timestamp,entry:confirmation.close,
        stop:direction==='UP'?confirmation.low:confirmation.high,lots,units:lots*lotSize};
      writeStatus({date,status:'OPEN',...entered}); break;
    }
    if (entered) break;
    await sleep(30000);
  }
  if (!entered) { writeStatus({date,status:'NO_TRADE',reason:'No same-bar Idea15 Fixed10 + option 9/21 confirmation before 15:15',expiry}); return; }

  let exit=null, exitTimestamp=null, exitReason=null, processed=new Set();
  while (!exit) {
    const now=indiaParts().time;
    const option=completedCandles(await fetchCandles('FNO',entered.contract.symbol,date,timeOf(entered.entryTime),now,INTERVAL),now);
    for (const c of option) {
      if (c.timestamp<=entered.entryTime || processed.has(c.timestamp)) continue;
      if (timeOf(c.timestamp)>=EOD_TIME) { exit=c.close; exitTimestamp=c.timestamp; exitReason='EOD'; break; }
      if (entered.direction==='UP' && c.low<=entered.stop) { exit=c.open<=entered.stop?c.open:entered.stop; exitTimestamp=c.timestamp; exitReason='OPTION_CONFIRMATION_BAR_STOP'; break; }
      if (entered.direction==='DOWN' && c.high>=entered.stop) { exit=c.open>=entered.stop?c.open:entered.stop; exitTimestamp=c.timestamp; exitReason='OPTION_CONFIRMATION_BAR_STOP'; break; }
      processed.add(c.timestamp);
    }
    if (exit) break;
    if (now>='15:30') { const last=option.at(-1); if(last){exit=last.close;exitTimestamp=last.timestamp;exitReason='LAST_AVAILABLE';} break; }
    await sleep(30000);
  }
  if (!Number.isFinite(exit)) throw new Error('No executable paper exit was available');
  const pnl=paperOptionCosts(entered.entry,exit,entered.units,date), stopOut=exitReason==='OPTION_CONFIRMATION_BAR_STOP';
  const row={source:'PAPER',strategy:'Idea 15 Fixed10 EMA Break',strategyVersion:'IDEA15_FIXED10',variant:'FIXED10',date,
    expiry:entered.expiry,side:entered.direction==='UP'?'CE':'PE',contract:entered.contract.symbol,strike:entered.contract.strike,
    signalTime:timeOf(entered.signalTime),entryTime:timeOf(entered.entryTime),entryPremium:entered.entry,initialStop:entered.stop,
    exitTime:timeOf(exitTimestamp),exitPremium:exit,exitReason,lots:entered.lots,units:entered.units,
    grossPnl:Number(pnl.gross.toFixed(2)),charges:Number(pnl.charges.toFixed(2)),totalPnl:Number(pnl.net.toFixed(2)),stopOut,paperOnly:true,
    diagnostics:{variant:'FIXED10',ema:'9/21',timeframe:'3minute',thresholdPoints:10,noOrderApiUsed:true}};
  appendTrade(row); writeStatus({date,status:'CLOSED',trade:row}); console.log(JSON.stringify(row,null,2));
}
main().catch(error=>{console.error(error.stack||error.message);writeStatus({status:'FAILED',reason:error.message});process.exitCode=1;});
