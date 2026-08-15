import test from 'node:test';
import assert from 'node:assert/strict';
import { auditQuickFlipData } from '../research/quick-flip-data-quality.mjs';

const c=(timestamp,open,high,low,close,volume=1000,symbol='TEST')=>({timestamp,open,high,low,close,volume,symbol});
function d(date,base,symbol='TEST') { return [
  c(`${date}T09:00:00+05:30`,1,9999,.1,1,1,symbol),
  c(`${date}T09:15:00+05:30`,base,base+2,base-1,base+1,1000,symbol),
  c(`${date}T09:20:00+05:30`,base+1,base+2,base,base+1,900,symbol),
  c(`${date}T09:25:00+05:30`,base+1,base+2,base,base+1,800,symbol),
  c(`${date}T15:10:00+05:30`,base+1,base+2,base,base+1,1000,symbol),
  // Deliberately impossible closing-auction print: audit must ignore it.
  c(`${date}T15:20:00+05:30`,1,9999,.01,8000,1000,symbol),
];}

test('audit ignores pre-open and closing-auction prints while surfacing structural overnight gaps',()=>{
  const rows=[];
  for(let i=1;i<=16;i++) rows.push(...d(`2025-01-${String(i).padStart(2,'0')}`,100+i));
  rows.push(...d('2025-01-17',30));
  const out=auditQuickFlipData(rows);
  assert.equal(out.bySymbol.TEST.gapsOver20Pct.length,1);
  assert.ok(Math.abs(out.bySymbol.TEST.gapsOver20Pct[0].gapPct)>50);
  assert.ok(out.bySymbol.TEST.atr.max<1000);
  assert.deepEqual(out.continuousSession,{start:'09:15',endExclusive:'15:15'});
});
