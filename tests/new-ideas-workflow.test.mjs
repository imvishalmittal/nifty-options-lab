import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/research-new-ideas-eight.yml', import.meta.url), 'utf8');

test('new-ideas workflow freezes discovery, serial API use, and dated lot sizes', () => {
  assert.match(workflow, /2020/);
  assert.match(workflow, /2024/);
  assert.match(workflow, /max-parallel: 1/);
  assert.match(workflow, /--lot-size=auto/);
  assert.match(workflow, /--signals=RETEST15 --exits=CONFIRM_BE_10/);
  assert.match(workflow, /--underlying=\$\{\{ matrix\.underlying \}\}/);
  assert.doesNotMatch(workflow, /paper\/run-|git push|contents: write/);
});
