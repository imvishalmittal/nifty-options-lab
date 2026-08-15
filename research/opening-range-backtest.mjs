import fs from 'node:fs';

const DEFAULTS = {
  openingStart: '09:15',
  openingEnd: '09:30',
  entryWindowEnd: '10:45',
  oneTradePerDay: true,
};

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((v) => v.trim());
  const required = ['timestamp','open','high','low','close','volume'];
  for (const key of required) {
    if (!header.includes(key)) throw new Error(`Missing CSV column: ${key}`);
  }
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i]?.trim()]));
    return {
      timestamp: row.timestamp,
      symbol: row.symbol || '',
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    };
  }).filter((r) => [r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite));
}

function parts(timestamp) {
  // Input timestamps must already be in Asia/Kolkata local time, e.g. 2026-08-14T09:15:00+05:30.
  const m = timestamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return { date: m[1], time: m[2] };
}

function body(c) { return Math.abs(c.close - c.open); }
function upperWick(c) { return c.high - Math.max(c.open, c.close); }
function lowerWick(c) { return Math.min(c.open, c.close) - c.low; }

export function isBullishHammer(c) {
  const b = Math.max(body(c), (c.high - c.low) * 0.05);
  return c.close >= c.open && lowerWick(c) >= 2 * b && upperWick(c) <= 1.25 * b;
}

export function isBearishShootingStar(c) {
  const b = Math.max(body(c), (c.high - c.low) * 0.05);
  return c.close <= c.open && upperWick(c) >= 2 * b && lowerWick(c) <= 1.25 * b;
}

export function isBullishEngulfing(prev, c) {
  return prev && prev.close < prev.open && c.close > c.open && c.open <= prev.close && c.close >= prev.open;
}

export function isBearishEngulfing(prev, c) {
  return prev && prev.close > prev.open && c.close < c.open && c.open >= prev.close && c.close <= prev.open;
}

function groupByDay(candles) {
  const groups = new Map();
  for (const c of candles) {
    const { date } = parts(c.timestamp);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(c);
  }
  for (const rows of groups.values()) rows.sort((a,b) => a.timestamp.localeCompare(b.timestamp));
  return groups;
}

function outcomeAfterEntry(day, entryIndex, direction, entry, stop, target) {
  let mfe = 0;
  let mae = 0;
  for (let i = entryIndex; i < day.length; i++) {
    const c = day[i];
    if (direction === 'LONG') {
      mfe = Math.max(mfe, c.high - entry);
      mae = Math.max(mae, entry - c.low);
      const stopHit = c.low <= stop;
      const targetHit = c.high >= target;
      if (stopHit && targetHit) return { result: 'STOP', exit: stop, exitTime: c.timestamp, mfe, mae, ambiguousBar: true };
      if (stopHit) return { result: 'STOP', exit: stop, exitTime: c.timestamp, mfe, mae, ambiguousBar: false };
      if (targetHit) return { result: 'TARGET', exit: target, exitTime: c.timestamp, mfe, mae, ambiguousBar: false };
    } else {
      mfe = Math.max(mfe, entry - c.low);
      mae = Math.max(mae, c.high - entry);
      const stopHit = c.high >= stop;
      const targetHit = c.low <= target;
      if (stopHit && targetHit) return { result: 'STOP', exit: stop, exitTime: c.timestamp, mfe, mae, ambiguousBar: true };
      if (stopHit) return { result: 'STOP', exit: stop, exitTime: c.timestamp, mfe, mae, ambiguousBar: false };
      if (targetHit) return { result: 'TARGET', exit: target, exitTime: c.timestamp, mfe, mae, ambiguousBar: false };
    }
  }
  const last = day.at(-1);
  return { result: 'EOD', exit: last.close, exitTime: last.timestamp, mfe, mae, ambiguousBar: false };
}

export function backtest(candles, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const trades = [];

  for (const [date, day] of groupByDay(candles)) {
    const opening = day.filter((c) => {
      const t = parts(c.timestamp).time;
      return t >= cfg.openingStart && t < cfg.openingEnd;
    });
    if (opening.length < 3) continue;

    const openingHigh = Math.max(...opening.map((c) => c.high));
    const openingLow = Math.min(...opening.map((c) => c.low));
    if (!(openingHigh > openingLow)) continue;

    let taken = false;
    for (let i = 0; i < day.length - 1 && !taken; i++) {
      const c = day[i];
      const { time } = parts(c.timestamp);
      if (time < cfg.openingEnd || time > cfg.entryWindowEnd) continue;
      const prev = i > 0 ? day[i - 1] : null;

      const bullishSweep = c.low < openingLow && c.close > openingLow;
      const bearishSweep = c.high > openingHigh && c.close < openingHigh;
      const bullishPattern = bullishSweep && (isBullishHammer(c) || isBullishEngulfing(prev, c));
      const bearishPattern = bearishSweep && (isBearishShootingStar(c) || isBearishEngulfing(prev, c));
      if (!bullishPattern && !bearishPattern) continue;

      const direction = bullishPattern ? 'LONG' : 'SHORT';
      const trigger = bullishPattern ? c.high : c.low;
      const stop = bullishPattern ? c.low : c.high;
      const target = bullishPattern ? openingHigh : openingLow;
      const risk = Math.abs(trigger - stop);
      const reward = Math.abs(target - trigger);
      if (!(risk > 0 && reward > 0)) continue;

      // Entry is allowed only after the reversal candle has closed. Scan later bars for trigger break.
      let entryIndex = -1;
      for (let j = i + 1; j < day.length; j++) {
        const jt = parts(day[j].timestamp).time;
        if (jt > cfg.entryWindowEnd) break;
        if ((direction === 'LONG' && day[j].high >= trigger) || (direction === 'SHORT' && day[j].low <= trigger)) {
          entryIndex = j;
          break;
        }
      }
      if (entryIndex < 0) continue;

      const outcome = outcomeAfterEntry(day, entryIndex, direction, trigger, stop, target);
      const pnlPoints = direction === 'LONG' ? outcome.exit - trigger : trigger - outcome.exit;
      trades.push({
        date,
        symbol: c.symbol || day[0].symbol || '',
        direction,
        openingHigh,
        openingLow,
        reversalTime: c.timestamp,
        pattern: bullishPattern ? (isBullishHammer(c) ? 'HAMMER' : 'BULL_ENGULF') : (isBearishShootingStar(c) ? 'SHOOTING_STAR' : 'BEAR_ENGULF'),
        entryTime: day[entryIndex].timestamp,
        entry: trigger,
        stop,
        target,
        riskPoints: risk,
        rewardPoints: reward,
        plannedR: reward / risk,
        result: outcome.result,
        exit: outcome.exit,
        exitTime: outcome.exitTime,
        pnlPoints,
        realizedR: pnlPoints / risk,
        mfePoints: outcome.mfe,
        maePoints: outcome.mae,
        ambiguousBar: outcome.ambiguousBar,
      });
      taken = cfg.oneTradePerDay;
    }
  }

  return { trades, summary: summarize(trades) };
}

export function summarize(trades) {
  const n = trades.length;
  const winners = trades.filter((t) => t.pnlPoints > 0);
  const losers = trades.filter((t) => t.pnlPoints < 0);
  const totalR = trades.reduce((s,t) => s + t.realizedR, 0);
  return {
    trades: n,
    winners: winners.length,
    losers: losers.length,
    winRate: n ? winners.length / n : 0,
    targetRate: n ? trades.filter((t) => t.result === 'TARGET').length / n : 0,
    averageR: n ? totalR / n : 0,
    totalR,
    averagePlannedR: n ? trades.reduce((s,t) => s + t.plannedR, 0) / n : 0,
    ambiguousBars: trades.filter((t) => t.ambiguousBar).length,
  };
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node research/opening-range-backtest.mjs <5m.csv> [more.csv]');
    process.exit(2);
  }
  const allTrades = [];
  for (const file of files) {
    const candles = parseCsv(fs.readFileSync(file, 'utf8'));
    const result = backtest(candles);
    allTrades.push(...result.trades);
  }
  const payload = { summary: summarize(allTrades), trades: allTrades };
  process.stdout.write(JSON.stringify(payload, null, 2));
}

if (process.argv[1]?.endsWith('opening-range-backtest.mjs')) main();
