import assert from 'node:assert/strict';
import test from 'node:test';
import { TRAILING_VARIANTS, evaluateTrailingGates } from '../research/profit-only-trailing-gates.mjs';

const summary=(pnl)=>({trades:200,totalNetPnl:pnl,profitFactor:pnl>0?1.2:0.8});
test('a trailing variant advances only when every execution scenario is profitable',()=>{
  const variants=Object.fromEntries(TRAILING_VARIANTS.map((key)=>[key,{summary:{combined:{current:summary(10),stress0_5:summary(5),stress1_0:summary(1)}}}]));
  assert.equal(evaluateTrailingGates({variants}).passed,true);
  variants[TRAILING_VARIANTS[0]].summary.combined.stress1_0=summary(-1);
  assert.equal(evaluateTrailingGates({variants}).variants[TRAILING_VARIANTS[0]].passed,false);
});
