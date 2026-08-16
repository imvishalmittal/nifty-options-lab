import fs from 'node:fs';
import { parseCsv } from './opening-range-backtest.mjs';
import { computeWilderAtrByDate } from './quick-flip-backtest.mjs';

const MAX_ATR_TO_MEDIAN_CLOSE = 0.50;
const LARGE_DAILY_RANGE_TO_MEDIAN_CLOSE = 0.20;
const OUTLIER_LIMIT = 12;

function parts(timestamp) {
  const m = String(timestamp).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) throw new Error(`Unsupported timestamp: ${timestamp}`);
  return { date: m[1], time: m[2] };
}

function regular(rows) {
  return rows.filter((c) => {
    const t = parts(c.timestamp).time;
    // Use the same continuous-session definition as the strategy/ATR engine.
    return t >= '09:15' && t < '15:15';
  });
}

function group(candles) {
  const out = new Map();
  for (const c of candles) {
    const symbol = c.symbol || 'UNKNOWN';
    const { date } = parts(c.timestamp);
    if (!out.has(symbol)) out.set(symbol, new Map());
    if (!out.get(symbol).has(date)) out.get(symbol).set(date, []);
    out.get(symbol).get(date).push(c);
  }
  for (const days of out.values()) for (const rows of days.values()) rows.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  return out;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const p=(sorted.length-1)*q, lo=Math.floor(p), hi=Math.ceil(p);
  if (lo===hi) return sorted[lo];
  return sorted[lo]*(hi-p)+sorted[hi]*(p-lo);
}

function stats(values) {
  const v=values.filter(Number.isFinite).sort((a,b)=>a-b);
  return v.length ? {count:v.length,min:v[0],p50:quantile(v,.5),p75:quantile(v,.75),p90:quantile(v,.9),p95:quantile(v,.95),max:v.at(-1)} : {count:0,min:null,p50:null,p75:null,p90:null,p95:null,max:null};
}

export function auditQuickFlipData(candles) {
  const grouped=group(candles);
  const bySymbol={};
  const allGaps=[];
  const invalidSymbols=[];
  for (const [symbol,days] of grouped) {
    const dates=[...days.keys()].sort();
    const atr=computeWilderAtrByDate(days,14);
    const atrValues=[...atr.values()];
    const gaps=[];
    const monthlyOpeningCoverage={};
    const continuousCloses=[];
    const sessionRanges=[];
    const intradayRanges=[];
    const malformedCandles=[];
    let prevClose=null;
    for (const date of dates) {
      const rows=regular(days.get(date));
      const month=date.slice(0,7);
      monthlyOpeningCoverage[month] ??= {sessions:0,completeOpening:0};
      monthlyOpeningCoverage[month].sessions += 1;
      const opening=rows.filter((c)=>{const t=parts(c.timestamp).time; return t>='09:15'&&t<'09:30';});
      if (opening.length>=3) monthlyOpeningCoverage[month].completeOpening += 1;
      if (!rows.length) continue;
      const open=rows[0].open;
      const close=rows.at(-1).close;
      const highBar=rows.reduce((best,row)=>row.high>best.high?row:best);
      const lowBar=rows.reduce((best,row)=>row.low<best.low?row:best);
      sessionRanges.push({
        date,
        open,
        high:highBar.high,
        highTimestamp:highBar.timestamp,
        low:lowBar.low,
        lowTimestamp:lowBar.timestamp,
        close,
        range:highBar.high-lowBar.low,
      });
      for (const row of rows) {
        const range=row.high-row.low;
        intradayRanges.push({
          timestamp:row.timestamp,
          open:row.open,
          high:row.high,
          low:row.low,
          close:row.close,
          range,
        });
        const malformed = row.open<=0 || row.high<=0 || row.low<=0 || row.close<=0
          || row.high<Math.max(row.open,row.close)
          || row.low>Math.min(row.open,row.close)
          || row.high<row.low;
        if (malformed) malformedCandles.push({
          timestamp:row.timestamp,
          open:row.open,
          high:row.high,
          low:row.low,
          close:row.close,
        });
      }
      if (Number.isFinite(close) && close > 0) continuousCloses.push(close);
      if (prevClose>0 && open>0) {
        const gap=(open/prevClose)-1;
        gaps.push({date,prevClose,open,gapPct:gap*100});
        allGaps.push({symbol,date,prevClose,open,gapPct:gap*100});
      }
      prevClose=close;
    }
    const absGaps=gaps.map((g)=>Math.abs(g.gapPct));
    const atrStats=stats(atrValues);
    const medianClose=stats(continuousCloses).p50;
    const withRangeFraction=(row)=>({
      ...row,
      rangeToMedianClose:medianClose>0?row.range/medianClose:null,
    });
    const rankedSessionRanges=sessionRanges
      .map(withRangeFraction)
      .sort((a,b)=>b.rangeToMedianClose-a.rangeToMedianClose);
    const rankedIntradayRanges=intradayRanges
      .map(withRangeFraction)
      .sort((a,b)=>b.rangeToMedianClose-a.rangeToMedianClose);
    const maxAtrToMedianClose=(atrStats.max != null && medianClose>0) ? atrStats.max/medianClose : null;
    const qualityValid=maxAtrToMedianClose == null || maxAtrToMedianClose <= MAX_ATR_TO_MEDIAN_CLOSE;
    if (!qualityValid) invalidSymbols.push({symbol,maxAtrToMedianClose,medianClose,maxAtr:atrStats.max});
    bySymbol[symbol]={
      sessions:dates.length,
      atr:atrStats,
      medianContinuousClose:medianClose,
      maxAtrToMedianClose,
      qualityValid,
      absoluteOvernightGapPct:stats(absGaps),
      gapsOver20Pct:gaps.filter((g)=>Math.abs(g.gapPct)>=20).sort((a,b)=>Math.abs(b.gapPct)-Math.abs(a.gapPct)),
      topOvernightGaps:gaps.sort((a,b)=>Math.abs(b.gapPct)-Math.abs(a.gapPct)).slice(0,8),
      largeDailyRanges:rankedSessionRanges.filter((row)=>row.rangeToMedianClose>=LARGE_DAILY_RANGE_TO_MEDIAN_CLOSE),
      topDailyRanges:rankedSessionRanges.slice(0,OUTLIER_LIMIT),
      topIntradayRanges:rankedIntradayRanges.slice(0,OUTLIER_LIMIT),
      malformedCandles:malformedCandles.slice(0,OUTLIER_LIMIT),
      monthlyOpeningCoverage,
    };
  }
  return {
    continuousSession: { start: '09:15', endExclusive: '15:15' },
    quality: {
      valid: invalidSymbols.length===0,
      maxAtrToMedianCloseThreshold: MAX_ATR_TO_MEDIAN_CLOSE,
      largeDailyRangeToMedianCloseThreshold: LARGE_DAILY_RANGE_TO_MEDIAN_CLOSE,
      invalidSymbols: invalidSymbols.sort((a,b)=>b.maxAtrToMedianClose-a.maxAtrToMedianClose),
    },
    bySymbol,
    largestOvernightGaps: allGaps.sort((a,b)=>Math.abs(b.gapPct)-Math.abs(a.gapPct)).slice(0,30),
  };
}

function main(){
  const files=process.argv.slice(2);
  if(!files.length){console.error('Usage: node research/quick-flip-data-quality.mjs <csv> [more.csv]');process.exit(2);}
  const candles=files.flatMap((f)=>parseCsv(fs.readFileSync(f,'utf8')));
  process.stdout.write(JSON.stringify(auditQuickFlipData(candles),null,2));
}
if(process.argv[1]?.endsWith('quick-flip-data-quality.mjs')) main();
