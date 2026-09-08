import test from 'node:test';import assert from 'node:assert/strict';import { mergeMultiIndexShards } from '../research/merge-multi-index-credit-shards.mjs';

function costs(value){return{normalized:{netPnl:value},stress0_5:{netPnl:value},stress1_0:{netPnl:value}};}
function shard(month,study='M3'){const date=`${month}-02`;return{study,period:{startDate:`${month}-01`,endDate:`${month}-28`},documents:['NIFTY','BANKNIFTY','FINNIFTY'].map((underlying)=>({underlying,results:[{date,underlying,status:'TRADE',costs:costs(10)}]}))};}

test('strict merger retains pooled and per-index evidence',()=>{const documents=[shard('2024-01'),shard('2024-02')];const merged=mergeMultiIndexShards(documents,'2024-01-01','2024-02-29',2);assert.equal(merged.shardCount,2);assert.equal(merged.results.length,6);assert.equal(merged.documents.find((row)=>row.underlying==='BANKNIFTY').summary.normalized.netPnl,20);});
test('strict merger rejects duplicate or incomplete months',()=>{assert.throws(()=>mergeMultiIndexShards([shard('2024-01'),shard('2024-01')],'2024-01-01','2024-02-29',2),/unique months/);});
