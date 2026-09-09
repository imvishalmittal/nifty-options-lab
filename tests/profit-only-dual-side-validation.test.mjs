import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { summarizePairedTrades } from '../research/groww-profit-only-directional-backtest.mjs';
import { evaluateDualSideValidation } from '../research/profit-only-dual-side-validation-gates.mjs';

const leg = (date, side, money) => ({ date, strategy: 'RETEST15', signalTime: `${date} 10:00:00`, side, money });

test('paired trades sum independently managed CE and PE legs by signal', () => {
  const paired = summarizePairedTrades([
    leg('2025-01-02', 'CE', { current: 100, stress0_5: 90, stress1_0: 80 }),
    leg('2025-01-02', 'PE', { current: -20, stress0_5: -30, stress1_0: -40 }),
  ]);
  assert.equal(paired.pairs.length, 1);
  assert.equal(paired.pairs[0].money.current, 80);
  assert.equal(paired.summary.stress1_0.totalNetPnl, 40);
});

test('validation requires aggregate and both calendar periods positive at every stress', () => {
  const makePaired = () => summarizePairedTrades([
    leg('2025-01-02', 'CE', { current: 100, stress0_5: 90, stress1_0: 80 }),
    leg('2025-01-02', 'PE', { current: 20, stress0_5: 10, stress1_0: 5 }),
    leg('2026-01-02', 'CE', { current: 100, stress0_5: 90, stress1_0: 80 }),
    leg('2026-01-02', 'PE', { current: 20, stress0_5: 10, stress1_0: 5 }),
  ]);
  const paired = makePaired();
  const result = { period: { startDate: '2025-01-01', endDate: '2026-09-08' }, variants: {
    RETEST15_CONFIRM_BE_10_CAP_10: { paired },
    PREVIOUS_DAY_BREAK_CONFIRM_BE_10: { paired },
  } };
  assert.equal(evaluateDualSideValidation(result).passed, true);
});

test('an unaffordable leg makes the pair a no-trade', () => {
  const paired = summarizePairedTrades([
    leg('2025-01-02', 'CE', { current: 100, stress0_5: 90, stress1_0: 80 }),
    leg('2025-01-02', 'PE', { current: null, stress0_5: null, stress1_0: null }),
  ]);
  assert.equal(paired.candidatePairs, 1);
  assert.equal(paired.pairs.length, 0);
  assert.equal(paired.skippedForCapital, 1);
});

test('workflow runs only the declared 2025-2026 validation period', async () => {
  const workflow = await readFile(new URL('../.github/workflows/research-profit-only-dual-side-validation.yml', import.meta.url), 'utf8');
  assert.match(workflow, /--start=2025-01-01 --end=2026-09-08 --expected=21/);
  assert.doesNotMatch(workflow, /2020|2021|2022|2023|2024/);
  assert.match(workflow, /--trade-both-sides=true/);
});
