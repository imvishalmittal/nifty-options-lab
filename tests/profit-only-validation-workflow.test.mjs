import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('profit-only validation zero-pads every month in partial years', async () => {
  const workflow = await readFile(new URL('../.github/workflows/research-profit-only-trailing-validation.yml', import.meta.url), 'utf8');
  assert.match(workflow, /for month_number in \$\(seq 1 "\$last"\)/);
  assert.match(workflow, /month=\$\(printf '%02d' "\$month_number"\)/);
  assert.doesNotMatch(workflow, /seq -w 1 "\$last"/);
});
