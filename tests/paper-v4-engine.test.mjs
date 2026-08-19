import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyV4Entry, choosePrimaryBackup, initialV4Position, niftyReferenceRange, processV4CompletedBar } from '../paper/v4-engine.mjs';

const t = (clock) => `2026-08-19T${clock}:00+05:30`;
const candle = (clock, open, high, low, close) => ({ timestamp: t(clock), open, high, low, close, volume: 1 });

const ce = { symbol: 'NSE-NIFTY-20Aug26-24500-CE', strike: 24500, optionType: 'CE', premium: 184 };
const pe = { symbol: 'NSE-NIFTY-20Aug26-24400-PE', strike: 24400, optionType: 'PE', premium: 174 };

test('V4 primary is the globally closest 09:25 contract and backup is opposite side', () => {
  const selected = choosePrimaryBackup(ce, pe);
  assert.equal(selected.primary.symbol, ce.symbol);
  assert.equal(selected.backup.symbol, pe.symbol);
});

test('V4 requires all five NIFTY 09:25-09:29 bars', () => {
  const rows = [25, 26, 27, 28].map((m) => candle(`09:${m}`, 24500, 24505, 24495, 24500));
  assert.equal(niftyReferenceRange(rows), null);
});

test('V4 enters primary only after matching NIFTY directional confirmation', () => {
  const callCandles = [
    candle('09:25', 184, 185, 183, 184),
    candle('09:29', 185, 186, 184, 185),
    candle('09:30', 186, 188, 185, 186),
    candle('09:31', 187, 189, 186, 188),
    candle('09:32', 188, 190, 187, 189),
  ];
  const putCandles = [
    candle('09:25', 174, 175, 173, 174),
    candle('09:29', 175, 176, 174, 175),
    candle('09:30', 176, 177, 175, 176),
    candle('09:31', 177, 178, 176, 177),
    candle('09:32', 178, 179, 177, 178),
  ];
  const niftyCandles = [
    candle('09:25', 24500, 24505, 24495, 24500), candle('09:26', 24500, 24506, 24496, 24502),
    candle('09:27', 24502, 24507, 24497, 24503), candle('09:28', 24503, 24508, 24498, 24504),
    candle('09:29', 24504, 24510, 24499, 24505), candle('09:30', 24505, 24509, 24500, 24508),
    candle('09:31', 24508, 24514, 24507, 24512), candle('09:32', 24512, 24515, 24510, 24513),
  ];
  const result = classifyV4Entry({ callSelection: ce, putSelection: pe, callCandles, putCandles, niftyCandles });
  assert.equal(result.status, 'ENTRY');
  assert.equal(result.source, 'PRIMARY');
  assert.equal(result.signal.timestamp, t('09:31'));
  assert.equal(result.entryBar.timestamp, t('09:32'));
  assert.equal(result.entry, 188);
});

test('V4 backup requires a fresh 180 cross and matching PE NIFTY confirmation', () => {
  const callCandles = [candle('09:25', 184, 185, 183, 184), candle('09:29', 181, 182, 179, 179), candle('09:30', 179, 180, 177, 178), candle('09:31', 178, 179, 176, 177), candle('09:32', 177, 178, 175, 176)];
  const putCandles = [candle('09:25', 174, 175, 173, 174), candle('09:29', 178, 179, 177, 178), candle('09:30', 179, 180, 178, 179), candle('09:31', 181, 183, 180, 182), candle('09:32', 183, 185, 182, 184)];
  const niftyCandles = [
    candle('09:25', 24500, 24505, 24495, 24500), candle('09:26', 24500, 24506, 24496, 24502), candle('09:27', 24502, 24507, 24497, 24503),
    candle('09:28', 24503, 24508, 24498, 24504), candle('09:29', 24504, 24510, 24499, 24505), candle('09:30', 24505, 24506, 24496, 24498),
    candle('09:31', 24498, 24500, 24490, 24492), candle('09:32', 24492, 24495, 24488, 24490),
  ];
  const result = classifyV4Entry({ callSelection: ce, putSelection: pe, callCandles, putCandles, niftyCandles });
  assert.equal(result.status, 'ENTRY');
  assert.equal(result.source, 'BACKUP');
  assert.equal(result.side, 'PE');
  assert.equal(result.entry, 183);
});

test('V4 fail-fast close below 180 exits at next bar open before trailing is active', () => {
  let position = initialV4Position({ entry: 188, entryTime: t('09:32') });
  position = processV4CompletedBar(position, candle('09:32', 188, 191, 177, 178));
  assert.equal(position.exit, null);
  assert.equal(position.pendingFailFastFrom, t('09:32'));
  position = processV4CompletedBar(position, candle('09:33', 179, 181, 175, 177));
  assert.equal(position.exit.result, 'FAILED_BREAKOUT_EXIT');
  assert.equal(position.exit.price, 179);
  assert.equal(position.exit.time, t('09:33'));
});

test('V4 fail-fast is disabled after V2 trailing protection activates', () => {
  let position = initialV4Position({ entry: 188, entryTime: t('09:32') });
  position = processV4CompletedBar(position, candle('09:32', 188, 223, 185, 221));
  assert.equal(position.trailActivated, true);
  position = processV4CompletedBar(position, candle('09:33', 221, 222, 202, 179));
  assert.equal(position.pendingFailFastFrom, null);
});
