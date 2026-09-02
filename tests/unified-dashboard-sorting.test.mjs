import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("unified strategy table exposes sortable accessible headers", async () => {
  const source = await readFile(new URL("../app/paper-ledger.tsx", import.meta.url), "utf8");

  for (const key of ["strategy", "cohort", "status", "sessions", "trades", "winsLosses", "winRate", "pf", "total", "drawdown", "contract", "entryExit", "exitReason"]) {
    assert.match(source, new RegExp(`key: "${key}"`));
  }
  assert.match(source, /aria-sort=/);
  assert.match(source, /onClick=\{\(\) => sortBy\(column\.key\)\}/);
  assert.match(source, /sortedComparison\.map/);
});
