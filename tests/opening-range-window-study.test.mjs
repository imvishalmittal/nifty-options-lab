import test from 'node:test';
import assert from 'node:assert/strict';
import { runWindowStudy, WINDOW_STUDIES, rankWindows } from '../research/opening-range-window-study.mjs';

const c = (timestamp, open, high, low, close, volume = 1000, symbol = 'TEST') => ({ timestamp, open, high, low, close, volume, symbol });

test('studies 15, 30, 60 and 75 minute entry windows from 09:30', () => {
  assert.deepEqual(WINDOW_STUDIES.map((w) => w.entryWindowEnd), ['09:45','10:00','10:30','10:45']);
});

test('later-only setup appears only in sufficiently wide windows', () => {
  const rows = [
    c('2026-08-10T09:15:00+05:30',100,104,99,103),
    c('2026-08-10T09:20:00+05:30',103,106,102,105),
    c('2026-08-10T09:25:00+05:30',105,107,101,102),
    c('2026-08-10T09:30:00+05:30',102,104,101,103),
    c('2026-08-10T09:35:00+05:30',103,104,102,103),
    c('2026-08-10T09:40:00+05:30',103,104,102,103),
    c('2026-08-10T09:45:00+05:30',103,104,102,103),
    c('2026-08-10T09:50:00+05:30',103,104,102,103),
    c('2026-08-10T09:55:00+05:30',103,104,102,103),
    c('2026-08-10T10:00:00+05:30',103,104,98,102.5),
    c('2026-08-10T10:05:00+05:30',102.5,104,102,103.5),
    c('2026-08-10T10:10:00+05:30',103.5,108,103,107),
  ];
  const results = runWindowStudy(rows);
  assert.equal(results[0].summary.trades, 0);
  assert.equal(results[1].summary.trades, 0);
  assert.equal(results[2].summary.trades, 1);
  assert.equal(results[3].summary.trades, 1);
});

test('ranking prioritizes average R before sample size', () => {
  const ranked = rankWindows([
    { label: 'a', summary: { averageR: 0.2, totalR: 2, trades: 10 } },
    { label: 'b', summary: { averageR: 0.4, totalR: 1.2, trades: 3 } },
  ]);
  assert.equal(ranked[0].label, 'b');
});
