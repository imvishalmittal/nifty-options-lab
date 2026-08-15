import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectedContractForTrade,
  normalizeOptionTrade,
  analyzeOptionLiquidity,
} from '../research/option-liquidity-diagnostics.mjs';

function trade({ date, side, result, volume, oi, premium925, signalClose, entry, net }) {
  const selection = {
    symbol: `NSE-NIFTY-X-${side}`,
    strike: side === 'CE' ? 25000 : 25100,
    premium: premium925,
    premiumDistanceFrom180: Math.abs(premium925 - 180),
    volume925: volume,
    openInterest925: oi,
  };
  return {
    date,
    status: 'TRADE',
    side,
    result,
    callSelection: side === 'CE' ? selection : { symbol: 'OTHER-CE' },
    putSelection: side === 'PE' ? selection : { symbol: 'OTHER-PE' },
    signalClose,
    entry,
    pnlPerUnit: net / 65,
    grossPnlRupees: net + 100,
    costs: {
      currentGroww2026: { netPnl: net },
      slippageStress0_5: { netPnl: net - 65 },
      slippageStress1_0: { netPnl: net - 130 },
    },
  };
}

test('selects the actually traded CE or PE contract', () => {
  const ce = trade({ date: '2026-01-01', side: 'CE', result: 'TARGET', volume: 1000, oi: 10000, premium925: 179, signalClose: 182, entry: 184, net: 1000 });
  const pe = trade({ date: '2026-01-02', side: 'PE', result: 'STOP', volume: 800, oi: 9000, premium925: 181, signalClose: 183, entry: 185, net: -1200 });
  assert.equal(selectedContractForTrade(ce).symbol, 'NSE-NIFTY-X-CE');
  assert.equal(selectedContractForTrade(pe).symbol, 'NSE-NIFTY-X-PE');
});

test('normalizes selection liquidity and confirmation-to-entry drift', () => {
  const row = trade({ date: '2026-01-01', side: 'CE', result: 'TARGET', volume: 1000, oi: 10000, premium925: 179, signalClose: 182, entry: 184, net: 1000 });
  const normalized = normalizeOptionTrade(row);
  assert.equal(normalized.volume925, 1000);
  assert.equal(normalized.openInterest925, 10000);
  assert.equal(normalized.confirmationToEntryDrift, 2);
  assert.equal(normalized.entryMinus180, 4);
  assert.equal(normalized.netPnlRupees, 1000);
});

test('liquidity report remains descriptive and splits outcomes/sides', () => {
  const rows = [
    trade({ date: '2026-01-01', side: 'CE', result: 'TARGET', volume: 1000, oi: 10000, premium925: 179, signalClose: 182, entry: 184, net: 1000 }),
    trade({ date: '2026-01-02', side: 'PE', result: 'STOP', volume: 800, oi: 9000, premium925: 181, signalClose: 183, entry: 185, net: -1200 }),
    trade({ date: '2026-01-03', side: 'CE', result: 'TIME', volume: 1200, oi: 11000, premium925: 178, signalClose: 181, entry: 182, net: 100 }),
    { date: '2026-01-04', status: 'NO_TRADE', reason: 'No crossing' },
  ];
  const report = analyzeOptionLiquidity(rows);
  assert.equal(report.trades, 3);
  assert.equal(report.byOutcome.TARGET.trades, 1);
  assert.equal(report.byOutcome.STOP.trades, 1);
  assert.equal(report.bySide.CE.trades, 2);
  assert.equal(report.overall.volume925.count, 3);
  assert.equal(report.exploratoryCorrelations.logVolume925VsNetPnl !== undefined, true);
  assert.match(report.warnings[0], /descriptive/i);
});
