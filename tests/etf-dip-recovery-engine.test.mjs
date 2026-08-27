import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eligibleCandidate,
  replayStrategy,
  scoreTrade,
  selectDailyTrade,
} from '../research/etf-dip-recovery-engine.mjs';
import {
  chunkDateRange,
  classifyEtf,
  etfUniverse,
  summarizeIntraday,
} from '../research/groww-etf-dip-recovery-backtest.mjs';

const candidate = (symbol, category, monthly, daily = -1.2, volume = 600_000) => ({
  symbol,
  category,
  thirtyDayReturnPct: monthly,
  dayReturnPct: daily,
  volumeToEntry: volume,
  entryPrice: 100,
});

test('eligibility requires a 30-session return at or below -2.5%', () => {
  assert.equal(eligibleCandidate(candidate('A', 'BANKING', -2.4)), false);
  assert.equal(eligibleCandidate(candidate('A', 'BANKING', -2.5)), true);
  assert.equal(eligibleCandidate(candidate('A', 'BANKING', -4)), true);
  assert.equal(eligibleCandidate(candidate('A', 'BANKING', 0.1)), false);
  assert.equal(eligibleCandidate(candidate('A', 'BANKING', -1, -0.99)), false);
  assert.equal(eligibleCandidate(candidate('A', 'BANKING', -1, -1.1, 500_000)), false);
  assert.equal(eligibleCandidate(candidate('A', 'UNCLASSIFIED:A', -1)), false);
});

test('selection chooses the most negative eligible monthly return', () => {
  const decision = selectDailyTrade({
    date: '2026-06-02',
    candidates: [candidate('A', 'BANKING', -3.1), candidate('B', 'GOLD', -4.2), candidate('C', 'AUTO', -3.6)],
    priorSessionDate: '2026-06-01',
    priorPurchase: null,
  });
  assert.equal(decision.selected.symbol, 'B');
});

test('same category on the immediately previous session is skipped for next ranked category', () => {
  const decision = selectDailyTrade({
    date: '2026-06-02',
    candidates: [candidate('BANK2', 'BANKING', -4.1), candidate('GOLD1', 'GOLD', -3.7)],
    priorSessionDate: '2026-06-01',
    priorPurchase: { date: '2026-06-01', category: 'BANKING' },
  });
  assert.equal(decision.selected.symbol, 'GOLD1');
  assert.deepEqual(decision.excluded, [{ symbol: 'BANK2', reason: 'CONSECUTIVE_CATEGORY', category: 'BANKING' }]);
});

test('a no-trade gap removes the consecutive-category block', () => {
  const decision = selectDailyTrade({
    date: '2026-06-03',
    candidates: [candidate('BANK2', 'BANKING', -4.1)],
    priorSessionDate: '2026-06-02',
    priorPurchase: { date: '2026-06-01', category: 'BANKING' },
  });
  assert.equal(decision.selected.symbol, 'BANK2');
});

test('target scoring ignores the entry day high before the 15:15 entry', () => {
  const sessions = ['2026-06-01', '2026-06-02'];
  const marketBySymbol = new Map([['ETF', new Map([
    ['2026-06-01', { high: 120, low: 95, highAfterEntry: 102, lowAfterEntry: 99, markPrice: 100 }],
    ['2026-06-02', { high: 108, low: 98, highAfterEntry: 108, lowAfterEntry: 98, markPrice: 106 }],
  ])]]);
  const trade = scoreTrade({ date: '2026-06-01', symbol: 'ETF', entryPrice: 100 }, marketBySymbol, sessions);
  assert.equal(trade.status, 'TARGET');
  assert.equal(trade.exitDate, '2026-06-02');
  assert.equal(trade.sessionsToTarget, 1);
});

test('open trades stay marked to market and are not counted as wins', () => {
  const sessions = ['2026-06-01', '2026-06-02'];
  const candidatesByDate = new Map([['2026-06-01', [candidate('ETF', 'GOLD', -3)]]]);
  const marketBySymbol = new Map([['ETF', new Map([
    ['2026-06-01', { high: 101, low: 98, highAfterEntry: 101, lowAfterEntry: 99, markPrice: 100 }],
    ['2026-06-02', { high: 103, low: 96, highAfterEntry: 103, lowAfterEntry: 96, markPrice: 97 }],
  ])]]);
  const replay = replayStrategy({ sessions, candidatesByDate, marketBySymbol });
  assert.equal(replay.summary.targets, 0);
  assert.equal(replay.summary.open, 1);
  assert.ok(Math.abs(replay.trades[0].grossReturnPct + 3) < 1e-9);
});

test('five-minute chunks never exceed the official 14-calendar-day request span', () => {
  assert.deepEqual(chunkDateRange('2026-05-28', '2026-06-30'), [
    { startDate: '2026-05-28', endDate: '2026-06-10' },
    { startDate: '2026-06-11', endDate: '2026-06-24' },
    { startDate: '2026-06-25', endDate: '2026-06-30' },
  ]);
});

test('instrument master filtering keeps NSE cash ETFs and assigns deterministic sectors', () => {
  const rows = [
    { exchange: 'NSE', segment: 'CASH', instrument_type: 'EQ', trading_symbol: 'BANKBEES', groww_symbol: 'NSE-BANKBEES', name: 'Nippon India ETF Nifty Bank BeES', buy_allowed: '1' },
    { exchange: 'NSE', segment: 'CASH', instrument_type: 'EQ', trading_symbol: 'GOLDBEES', groww_symbol: 'NSE-GOLDBEES', name: 'Gold ETF', buy_allowed: '1' },
    { exchange: 'NSE', segment: 'CASH', instrument_type: 'EQ', trading_symbol: 'RELIANCE', name: 'Reliance Industries Limited', buy_allowed: '1' },
    { exchange: 'BSE', segment: 'CASH', instrument_type: 'EQ', trading_symbol: 'IGNOREETF', name: 'Ignore ETF', buy_allowed: '1' },
  ];
  const universe = etfUniverse(rows);
  assert.deepEqual(universe.map((item) => [item.symbol, item.category]), [['BANKBEES', 'BANKING_FINANCIAL'], ['GOLDBEES', 'GOLD']]);
  assert.equal(classifyEtf({ trading_symbol: 'NIFTYBEES', name: 'Nifty 50 ETF' }), 'BROAD_MARKET');
  assert.equal(classifyEtf({ trading_symbol: 'PVTBANIETF', name: 'PVTBANIETF' }), 'BANKING_FINANCIAL');
  assert.equal(classifyEtf({ trading_symbol: 'JUNIORBEES', name: 'JUNIORBEES' }), 'BROAD_MARKET');
  assert.equal(classifyEtf({ trading_symbol: 'ITIETF', name: 'ICICITECH' }), 'TECHNOLOGY_IT');
  assert.equal(classifyEtf({ trading_symbol: 'VAL30IETF', name: 'ICICI Prudential Nif' }), 'FACTOR');
  assert.equal(classifyEtf({ trading_symbol: 'BFSI', name: 'Mirae Asset Nifty Financial Services ETF' }), 'BANKING_FINANCIAL');
  assert.equal(classifyEtf({ trading_symbol: 'GROWWRAIL', name: 'Nifty India Railways PSU Index' }), 'INFRA_REALTY');
  assert.equal(classifyEtf({ trading_symbol: 'TECH', name: 'Aditya Birla Sun Life Nifty IT ETF' }), 'TECHNOLOGY_IT');
});

test('15:15 entry summary uses only volume known through the 15:10 bar', () => {
  const result = summarizeIntraday([
    ['2026-06-01 09:15:00', 100, 101, 99, 100, 300_000],
    ['2026-06-01 15:10:00', 99, 100, 98, 99, 250_001],
    ['2026-06-01 15:15:00', 99, 108, 97, 107, 900_000],
  ]).get('2026-06-01');
  assert.equal(result.entryPrice, 99);
  assert.equal(result.volumeToEntry, 550_001);
  assert.equal(result.highAfterEntry, 108);
});
