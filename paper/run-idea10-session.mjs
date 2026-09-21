import fs from 'node:fs';

import { createGrowwPaperClient, completedCandles, indiaParts, sleep } from './groww-paper-client.mjs';
import { paperOptionCosts } from './option-costs.mjs';
import { nearestExpiry, timeOf } from './paper-engine.mjs';
import { indexLotSizeForExpiry, parseIndexOptionContract } from '../research/multi-index-credit-engine.mjs';

const JOURNAL = 'public/paper/idea10-trades.json';
const STATUS = 'public/paper/idea10-session-status.json';
const FAST = 9;
const SLOW = 21;
const CAPITAL = 60000;
const INTERVAL = '3minute';
const SIGNAL_START = '09:15';
const ENTRY_CUTOFF = '15:15';
const EOD_TIME = '15:15';

function writeStatus(value) {
  fs.mkdirSync('public/paper', { recursive: true });
  fs.writeFileSync(STATUS, JSON.stringify({ updatedAt: new Date().toISOString(), strategy: 'IDEA10A', variant: 'A', ...value }, null, 2));
}

function ema(candles, period) {
  const k = 2 / (period + 1);
  let value = null;
  return candles.map((candle, index) => {
    if (index === period - 1) value = candles.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
    else if (index >= period) value = candle.close * k + value * (1 - k);
    return value;
  });
}

function crossedDirection(candles, fast, slow, index) {
  if (index < slow || !Number.isFinite(fast[index]) || !Number.isFinite(slow[index])
      || !Number.isFinite(fast[index - 1]) || !Number.isFinite(slow[index - 1])) return null;
  const current = candles[index];
  const previous = candles[index - 1];
  if (current.close > fast[index] && current.close > slow[index]
      && previous.close <= fast[index - 1]) return 'UP';
  if (current.close < fast[index] && current.close < slow[index]
      && previous.close >= fast[index - 1]) return 'DOWN';
  return null;
}

function atm(contracts, spot, direction) {
  const type = direction === 'UP' ? 'CE' : 'PE';
  const rows = contracts.map((value) => parseIndexOptionContract(value, 'NIFTY')).filter(Boolean)
    .filter((row) => row.optionType === type);
  if (!rows.length) return null;
  return rows.toSorted((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot) || a.strike - b.strike)[0];
}

function appendTrade(row) {
  let payload = { meta: {}, trades: [] };
  if (fs.existsSync(JOURNAL)) payload = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  payload.trades = Array.isArray(payload.trades) ? payload.trades : [];
  const key = `${row.date}|${row.strategy}|${row.variant}`;
  const index = payload.trades.findIndex((trade) => `${trade.date}|${trade.strategy}|${trade.variant}` === key);
  if (index >= 0) payload.trades[index] = row;
  else payload.trades.push(row);
  payload.meta = { ...payload.meta, paperMode: true, paperStrategies: ['IDEA10A'], lastPaperSession: row.date };
  fs.writeFileSync(JOURNAL, JSON.stringify(payload, null, 2));
}

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');

  const { apiGet, fetchCandles } = createGrowwPaperClient({ token });
  const { date } = indiaParts();
  writeStatus({ date, status: 'STARTING', rules: {
    ema: '9/21',
    timeframe: '3minute',
    underlying: 'NSE-NIFTY',
    option: 'ATM',
    stop: 'confirmation candle low for CE / high for PE; subsequent completed bars only; gap fills at open',
    entry: 'option confirmation candle close',
    exit: 'first option completed bar at/after 15:15 closes the trade; no overnight',
    capital: CAPITAL,
  }});

  const year = Number(date.slice(0, 4));
  const expiryPayload = await apiGet('/historical/expiries', { exchange: 'NSE', underlying_symbol: 'NIFTY', year });
  const expiry = nearestExpiry(expiryPayload.expiries ?? [], date);
  if (!expiry) {
    writeStatus({ date, status: 'DATA_MISSING', reason: 'No weekly expiry' });
    return;
  }
  const contractsPayload = await apiGet('/historical/contracts', { exchange: 'NSE', underlying_symbol: 'NIFTY', expiry_date: expiry });
  const contracts = contractsPayload.contracts ?? [];
  if (!contracts.length) {
    writeStatus({ date, status: 'DATA_MISSING', reason: 'No NIFTY option contracts', expiry });
    return;
  }

  let entered = null;
  let spotCandles = [];
  let optionCandles = [];
  let processedSignalTimestamp = null;

  while (indiaParts().time < ENTRY_CUTOFF) {
    const now = indiaParts().time;
    spotCandles = completedCandles(await fetchCandles('CASH', 'NSE-NIFTY', date, SIGNAL_START, now, INTERVAL), now);
    if (spotCandles.length < SLOW) {
      await sleep(30000);
      continue;
    }

    const fast = ema(spotCandles, FAST);
    const slow = ema(spotCandles, SLOW);

    for (let i = SLOW - 1; i < spotCandles.length; i += 1) {
      const signalTimestamp = spotCandles[i].timestamp;
      if (signalTimestamp === processedSignalTimestamp) continue;
      const direction = crossedDirection(spotCandles, fast, slow, i);
      if (!direction) continue;
      const chosen = atm(contracts, spotCandles[i].close, direction);
      if (!chosen) continue;

      optionCandles = completedCandles(
        await fetchCandles('FNO', chosen.symbol, date, SIGNAL_START, now, INTERVAL),
        now,
      );
      const optionFast = ema(optionCandles, FAST);
      const optionSlow = ema(optionCandles, SLOW);
      const j = optionCandles.findIndex((row) => row.timestamp === signalTimestamp);
      if (j < SLOW || j < 1) continue;
      processedSignalTimestamp = signalTimestamp;

      const optionDirection = crossedDirection(optionCandles, optionFast, optionSlow, j);
      if (optionDirection !== direction) continue;

      const confirmation = optionCandles[j];
      const lotSize = indexLotSizeForExpiry('NIFTY', expiry);
      const lots = Math.floor(CAPITAL / (confirmation.close * lotSize));
      if (!(lotSize > 0) || lots < 1) {
        writeStatus({ date, status: 'NO_TRADE', reason: '₹60k capital cannot fund one NIFTY lot at confirmation premium', expiry, contract: chosen, signalTime: signalTimestamp });
        return;
      }

      entered = {
        expiry,
        contract: chosen,
        direction,
        signalTime: signalTimestamp,
        entryTime: confirmation.timestamp,
        entry: confirmation.close,
        stop: direction === 'UP' ? confirmation.low : confirmation.high,
        lots,
        units: lots * lotSize,
      };
      writeStatus({ date, status: 'OPEN', ...entered });
      break;
    }

    if (entered) break;
    await sleep(30000);
  }

  if (!entered) {
    writeStatus({ date, status: 'NO_TRADE', reason: 'No same-bar underlying + option 9/21 EMA confirmation before 15:15', expiry });
    return;
  }

  let exit = null;
  let exitTimestamp = null;
  let exitReason = null;
  let processed = new Set();

  while (!exit) {
    const now = indiaParts().time;
    optionCandles = completedCandles(
      await fetchCandles('FNO', entered.contract.symbol, date, timeOf(entered.entryTime), now, INTERVAL),
      now,
    );

    for (const candle of optionCandles) {
      if (candle.timestamp <= entered.entryTime || processed.has(candle.timestamp)) continue;
      if (timeOf(candle.timestamp) >= EOD_TIME) {
        exit = candle.close;
        exitTimestamp = candle.timestamp;
        exitReason = 'EOD';
        break;
      }
      if (entered.direction === 'UP' && candle.low <= entered.stop) {
        exit = candle.open <= entered.stop ? candle.open : entered.stop;
        exitTimestamp = candle.timestamp;
        exitReason = 'OPTION_CONFIRMATION_BAR_STOP';
        break;
      }
      if (entered.direction === 'DOWN' && candle.high >= entered.stop) {
        exit = candle.open >= entered.stop ? candle.open : entered.stop;
        exitTimestamp = candle.timestamp;
        exitReason = 'OPTION_CONFIRMATION_BAR_STOP';
        break;
      }
      processed.add(candle.timestamp);
    }

    if (exit) break;
    if (now >= '15:30') {
      const last = optionCandles.at(-1);
      if (last) {
        exit = last.close;
        exitTimestamp = last.timestamp;
        exitReason = 'LAST_AVAILABLE';
      }
      break;
    }
    await sleep(30000);
  }

  if (!Number.isFinite(exit)) throw new Error('No executable paper exit was available');

  const pnl = paperOptionCosts(entered.entry, exit, entered.units, date);
  const stopOut = exitReason === 'OPTION_CONFIRMATION_BAR_STOP';
  const row = {
    source: 'PAPER',
    strategy: 'Idea 10 Dual-Chart EMA Confirmation',
    strategyVersion: 'IDEA10A',
    variant: 'A',
    date,
    expiry: entered.expiry,
    side: entered.direction === 'UP' ? 'CE' : 'PE',
    contract: entered.contract.symbol,
    strike: entered.contract.strike,
    signalTime: timeOf(entered.signalTime),
    entryTime: timeOf(entered.entryTime),
    entryPremium: entered.entry,
    initialStop: entered.stop,
    exitTime: timeOf(exitTimestamp),
    exitPremium: exit,
    exitReason,
    lots: entered.lots,
    units: entered.units,
    grossPnl: Number(pnl.gross.toFixed(2)),
    charges: Number(pnl.charges.toFixed(2)),
    totalPnl: Number(pnl.net.toFixed(2)),
    stopOut,
    paperOnly: true,
    diagnostics: { variant: 'A', ema: '9/21', timeframe: '3minute', noOrderApiUsed: true },
  };
  appendTrade(row);
  writeStatus({ date, status: 'CLOSED', trade: row });
  console.log(JSON.stringify(row, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  writeStatus({ status: 'FAILED', reason: error.message });
  process.exitCode = 1;
});
