import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDocuments } from '../research/opportunity/aggregate-results.mjs';
import { compareDocuments } from '../research/opportunity/compare-results.mjs';
import { DEFAULT_RULES, STRATEGIES, summarizeOpportunityResults } from '../research/opportunity/opportunity-engine.mjs';
import { buildPartitions } from '../research/opportunity/workflow-plan.mjs';

function trade(date, strategy, net = 100) {
  const signalTime = `${date}T10:00:00+05:30`;
  return {
    date,
    strategy,
    status: 'TRADE',
    result: 'TARGET',
    entry: 180,
    exit: 220,
    pnlPerUnit: 40,
    entryTime: `${date}T10:01:00+05:30`,
    exitTime: `${date}T10:30:00+05:30`,
    signal: { strategy, optionType: 'CE', signalTime },
    selection: { contract: { optionType: 'CE', signalPremium: 180 } },
    costs: {
      normalized: { netPnl: net + 20 },
      stress0_5: { netPnl: net + 10 },
      stress1_0: { netPnl: net },
    },
  };
}

function document(strategy, startDay, endDay, net = 100) {
  const results = [];
  for (let day = startDay; day <= endDay; day += 1) {
    const date = `2025-01-${String(day).padStart(2, '0')}`;
    results.push(trade(date, strategy, net));
  }
  return {
    schemaVersion: 1,
    strategy,
    period: { startDate: results[0].date, endDate: results.at(-1).date },
    rules: DEFAULT_RULES,
    executionModel: { lotSize: 'auto-by-expiry' },
    diagnostics: {},
    summary: summarizeOpportunityResults(results),
    results,
  };
}

test('aggregation rejects overlapping monthly artifacts', () => {
  const first = document('late-breakout-retest', 1, 3);
  const second = document('late-breakout-retest', 3, 5);
  assert.throws(() => aggregateDocuments([first, second], 'late-breakout-retest'), /Overlapping partition session/);
});

test('comparison refuses unequal periods', () => {
  const documents = STRATEGIES.map((strategy) => document(strategy, 1, 30));
  documents[0].period.endDate = '2025-01-29';
  assert.throws(() => compareDocuments(documents), /periods do not match/);
});

test('comparison ranks only after all integrity and research gates pass', () => {
  const documents = STRATEGIES.map((strategy, index) => document(strategy, 1, 30, 100 - index * 10));
  const result = compareDocuments(documents);
  assert.equal(result.strategies.length, 4);
  assert.equal(result.strategies[0].strategy, STRATEGIES[0]);
  assert.ok(result.strategies.every((row) => row.passesResearchGate));
  assert.equal(result.promotionDecision, 'NONE_AUTOMATIC');
});

test('workflow scopes produce deterministic monthly partitions', () => {
  assert.equal(buildPartitions({ scope: 'discovery-2020-2024' }).length, 60);
  assert.equal(buildPartitions({ scope: 'validation-2025' }).length, 12);
  const holdout = buildPartitions({ scope: 'holdout-2026', today: new Date('2026-08-21T00:00:00Z') });
  assert.equal(holdout.length, 8);
  assert.equal(holdout.at(-1).end, '2026-08-21');
});
