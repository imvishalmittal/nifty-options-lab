import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run(script) {
  const root = mkdtempSync(path.join(tmpdir(), 'nifty-backfill-incomplete-'));
  mkdirSync(path.join(root, '2025-01'));
  writeFileSync(path.join(root, '2025-01', 'partial.log'), 'job stopped before result');
  const journal = path.join(root, 'journal.json');
  return spawnSync(process.execPath, [script, root, journal], { encoding: 'utf8' });
}

test('base backfill refuses an input partition missing result.json', () => {
  const result = run('paper/backfill-ledger.mjs');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Incomplete backfill input/);
});

test('stepped backfill refuses an input partition missing result.json', () => {
  const result = run('paper/backfill-stepped-ledger.mjs');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Incomplete stepped backfill input/);
});
