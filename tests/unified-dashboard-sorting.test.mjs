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

test("renders day, month and year strategy comparison matrices", async () => {
  const source = await readFile(new URL("../app/paper-ledger.tsx", import.meta.url), "utf8");

  assert.match(source, /Day-by-day comparison/);
  assert.match(source, /Month-by-month comparison/);
  assert.match(source, /Year-by-year comparison/);
  assert.match(source, /buildMatrix\(allDates, "DAY"/);
  assert.match(source, /buildMatrix\(months, "MONTH"/);
  assert.match(source, /buildMatrix\(years, "YEAR"/);
  assert.match(source, /cell\.sessions \? "No trade" : "—"/);
});
