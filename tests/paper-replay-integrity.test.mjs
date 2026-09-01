import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { applyReplay } from '../paper/apply-paper-replay.mjs';
import { verifyReplay } from '../paper/verify-paper-replay.mjs';

function fixture() {
  const trade = (strategy, version, extra = {}) => ({
    source: 'PAPER_REPLAY', reconstructed: true, date: '2026-08-26', strategy, strategyVersion: version,
    entryTime: '09:31', exitTime: '09:40', entryPremium: 185, exitPremium: 180,
    grossPnl: -325, charges: 100, totalPnl: -425, startStopLoss: 160, ...extra,
  });
  const baseTrades = [
    trade('V2 strategy', 'V2'), trade('V3 five', 'V3', { trailStepPoints: 5 }),
    trade('V3 ten', 'V3', { trailStepPoints: 10 }), trade('V6 strategy', 'V6'),
    trade('V7 strategy', 'V7', { trailStepPoints: 10 }),
    trade('V8 strategy', 'V8', { trailStepPoints: 10, startStopLoss: 165 }),
    trade('V9 strategy', 'V9', { startStopLoss: 170 }),
    trade('V10 five', 'V10', { trailStepPoints: 5, startStopLoss: 170 }),
    trade('V10 ten', 'V10', { trailStepPoints: 10, startStopLoss: 170 }),
    trade('V11 strategy', 'V11', { startStopLoss: 170 }),
  ];
  const confirmedTrades = [
    trade('V4 strategy', 'V4', { niftySignalTime: '09:30' }),
    trade('V5 strategy', 'V5', { niftySignalTime: '09:30', trailStepPoints: 10 }),
  ];
  return {
    schemaVersion: 1, date: '2026-08-26', complete: true,
    selectionAudit: { ce: { bracketed: true, selected: { symbol: 'CE' } }, pe: { bracketed: true, selected: { symbol: 'PE' } } },
    base: { status: 'CLOSED', complete: true, signalTime: '09:30', trades: baseTrades },
    confirmed: { status: 'CLOSED', complete: true, trades: confirmedTrades },
  };
}

test('replay integrity validates cohort, causality, accounting, and relative V8 stop', () => {
  const integrity = verifyReplay(fixture());
  assert.equal(integrity.passed, true);
  assert.equal(integrity.tradeCount, 12);
});

test('replay integrity rejects a same-bar entry', () => {
  const result = fixture(); result.base.trades[0].entryTime = '09:30';
  const integrity = verifyReplay(result);
  assert.equal(integrity.passed, false);
  assert.equal(integrity.checks.find((row) => row.name === 'causal-times').passed, false);
});

test('verified replay applies once and never overwrites a live terminal outcome', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-replay-test-'));
  fs.mkdirSync(path.join(root, 'public/paper'), { recursive: true });
  const write = (name, value) => fs.writeFileSync(path.join(root, 'public/paper', name), JSON.stringify(value));
  write('session-status.json', { date: '2026-08-26', status: 'DATA_BOUNDARY' });
  write('v4-session-status.json', { date: '2026-08-26', status: 'DATA_BOUNDARY' });
  write('trades.json', { meta: {}, trades: [] }); write('v4-trades.json', { meta: {}, trades: [] });
  const result = fixture(); const integrity = verifyReplay(result);
  assert.equal(applyReplay({ result, integrity, root }).applied, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'public/paper/trades.json'))).trades.length, 10);
  assert.equal(applyReplay({ result, integrity, root }).applied, false);

  write('session-status.json', { date: '2026-08-26', status: 'CLOSED' });
  write('v4-session-status.json', { date: '2026-08-26', status: 'NO_TRADE' });
  assert.throws(() => applyReplay({ result, integrity, root }), /terminal live paper outcome/);
});
