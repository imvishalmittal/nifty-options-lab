import test from 'node:test';
import assert from 'node:assert/strict';
import { itmContracts } from '../paper/paper-engine.mjs';

test('recovers a near-ATM NIFTY ladder when historical contracts are sparse far from spot', () => {
  const contracts = [
    'NSE-NIFTY-25Aug26-21800-CE', 'NSE-NIFTY-25Aug26-21700-CE', 'NSE-NIFTY-25Aug26-21250-CE', 'NSE-NIFTY-25Aug26-21200-CE',
    'NSE-NIFTY-25Aug26-25600-PE', 'NSE-NIFTY-25Aug26-25650-PE', 'NSE-NIFTY-25Aug26-25900-PE', 'NSE-NIFTY-25Aug26-26100-PE',
  ];
  const ce = itmContracts(contracts, 24108.6, 'CE');
  const pe = itmContracts(contracts, 24108.6, 'PE');
  assert.deepEqual(ce.slice(0, 4).map((row) => row.strike), [24100, 24050, 24000, 23950]);
  assert.deepEqual(pe.slice(0, 4).map((row) => row.strike), [24150, 24200, 24250, 24300]);
  assert.equal(ce[1].symbol, 'NSE-NIFTY-25Aug26-24050-CE');
  assert.equal(pe[2].symbol, 'NSE-NIFTY-25Aug26-24250-PE');
});

test('keeps the provider ladder when near-spot contracts are already present', () => {
  const contracts = [
    'NSE-NIFTY-25Aug26-24100-CE', 'NSE-NIFTY-25Aug26-24050-CE', 'NSE-NIFTY-25Aug26-24000-CE',
    'NSE-NIFTY-25Aug26-24150-PE', 'NSE-NIFTY-25Aug26-24200-PE', 'NSE-NIFTY-25Aug26-24250-PE',
  ];
  assert.deepEqual(itmContracts(contracts, 24108.6, 'CE').map((row) => row.strike), [24100, 24050, 24000]);
  assert.deepEqual(itmContracts(contracts, 24108.6, 'PE').map((row) => row.strike), [24150, 24200, 24250]);
});
