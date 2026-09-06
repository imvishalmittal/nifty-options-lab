import test from 'node:test';
import assert from 'node:assert/strict';
import { paperOptionCosts } from '../paper/option-costs.mjs';
import { calculateLongOptionRoundTripCosts } from '../research/groww-option-costs.mjs';

test('paper accounting remains exactly equal to the canonical option-cost model', () => {
  for (const tradeDate of ['2026-03-31', '2026-04-01']) {
    const canonical = calculateLongOptionRoundTripCosts({ entryPremium: 181.25, exitPremium: 207.8, lotSize: 65, tradeDate });
    assert.deepEqual(paperOptionCosts(181.25, 207.8, 65, tradeDate), {
      gross: canonical.grossPnl,
      charges: canonical.charges.total,
      net: canonical.netPnl,
    });
  }
});
