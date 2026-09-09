import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

test('profit-only dashboard exposes a default Both / CE / PE side filter', async () => {
  const source = await readFile(new URL('../app/profit-only-ledger.tsx', import.meta.url), 'utf8');
  assert.match(source, /type SideFilter = "BOTH" \| "CE" \| "PE"/);
  assert.match(source, /useState<SideFilter>\("BOTH"\)/);
  assert.match(source, /phaseSource\.filter\(\(row\) => row\.side === sideFilter\)/);
});

test('profit-only history publishes all 25 tested configurations', async () => {
  const history = JSON.parse(gunzipSync(await readFile(new URL('../public/research/profit-only-history.json.gz', import.meta.url))));
  const keys = new Set(history.strategies);
  assert.equal(keys.size, 25);
  assert.ok(keys.has('RETEST15_CONFIRM_BE_10'));
  assert.ok(keys.has('PREVIOUS_DAY_BREAK_CONFIRM_BE_10'));
  assert.ok(keys.has('RETEST15_TRAIL_5_AFTER_BE_10'));
  assert.ok(keys.has('PREVIOUS_DAY_BREAK_TRAIL_10_AFTER_BE_10'));
});
