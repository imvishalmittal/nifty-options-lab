import test from 'node:test';
import assert from 'node:assert/strict';
import { IRON_CONDOR_RULES, IRON_CONDOR_STRATEGY, summarizeIronCondorResults } from '../research/opportunity/iron-condor-engine.mjs';
import { validateIronCondorResult } from '../research/opportunity/iron-condor-integrity.mjs';
import { evaluateIronCondorGates } from '../research/opportunity/iron-condor-gates.mjs';

function trade(date, netPnl = 100) {
  const entryQuotes = { shortCall: 40, longCall: 10, shortPut: 45, longPut: 15 };
  const exitQuotes = { shortCall: 20, longCall: 5, shortPut: 25, longPut: 7 };
  const scenario = (value) => ({
    netPnl: value,
    legs: { shortCall: {}, longCall: {}, shortPut: {}, longPut: {} },
  });
  return {
    date,
    status: 'TRADE',
    signal: { strategy: IRON_CONDOR_STRATEGY },
    expiry: `${date.slice(0, 8)}28`,
    selection: {
      shortCall: { symbol: 'sc', strike: 24200 }, longCall: { symbol: 'lc', strike: 24400 },
      shortPut: { symbol: 'sp', strike: 23800 }, longPut: { symbol: 'lp', strike: 23600 },
    },
    entryTime: `${date}T10:00:00+05:30`,
    exitTime: `${date}T15:10:00+05:30`,
    entryQuotes,
    exitQuotes,
    entryCredit: 60,
    exitDebit: 33,
    pnlPerUnit: 27,
    maximumLossPoints: 140,
    lotSize: 65,
    result: 'TIME',
    costs: { normalized: scenario(netPnl + 20), stress0_5: scenario(netPnl), stress1_0: scenario(netPnl - 20) },
  };
}

function document(results, period = { startDate: '2020-01-01', endDate: '2024-12-31' }) {
  return {
    schemaVersion: 1,
    strategy: IRON_CONDOR_STRATEGY,
    period,
    rules: IRON_CONDOR_RULES,
    executionModel: { lotSize: 'auto-by-expiry' },
    summary: summarizeIronCondorResults(results),
    results,
  };
}

test('integrity validates four legs, equal wings, causal times and cost scenarios', () => {
  const report = validateIronCondorResult(document([trade('2020-01-02')], { startDate: '2020-01-01', endDate: '2020-01-31' }));
  assert.equal(report.valid, true);
});

test('integrity rejects expiry-day structures and asymmetric wings', () => {
  const row = trade('2020-01-02');
  row.expiry = row.date;
  row.selection.longCall.strike = 24350;
  const report = validateIronCondorResult(document([row], { startDate: '2020-01-01', endDate: '2020-01-31' }));
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes('expiry-day')));
  assert.ok(report.errors.some((error) => error.includes('call wing')));
});

test('precommitted discovery gates reject an undersized sample before profitability matters', () => {
  const report = evaluateIronCondorGates(document([trade('2020-01-02')]));
  assert.equal(report.phase, 'discovery');
  assert.equal(report.pass, false);
  assert.equal(report.checks.find((row) => row.name === 'observed sessions').pass, false);
  assert.equal(report.checks.find((row) => row.name === 'executed trades').pass, false);
});
