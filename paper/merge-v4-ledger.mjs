import fs from 'node:fs';
import { compactPaperSession, upsertPaperSessions } from './session-journal.mjs';

const MAIN = 'public/paper/trades.json';
const V4 = 'public/paper/v4-trades.json';
const BASE_STATUS = 'public/paper/session-status.json';
const V4_STATUS = 'public/paper/v4-session-status.json';
const SESSIONS = 'public/paper/sessions.json';

function key(row) {
  return `${row.source}|${row.date}|${row.strategy}|${row.trailStepPoints ?? ''}`;
}

function readJson(path, fallback) {
  return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : fallback;
}

let main = readJson(MAIN, { meta: {}, trades: [] });
const v4 = readJson(V4, { meta: {}, trades: [] });
main.trades = Array.isArray(main.trades) ? main.trades : [];
const existing = new Set(main.trades.map(key));
for (const row of Array.isArray(v4.trades) ? v4.trades : []) {
  if (!existing.has(key(row))) {
    main.trades.push(row);
    existing.add(key(row));
  }
}
const paperStrategies = new Set(Array.isArray(main.meta?.paperStrategies) ? main.meta.paperStrategies : []);
for (const value of ['V2', 'V3-5', 'V3-10', 'V4']) paperStrategies.add(value);
main.meta = { ...main.meta, paperMode: true, paperStrategies: [...paperStrategies] };
fs.writeFileSync(MAIN, JSON.stringify(main, null, 2));

const sessionRows = [];
if (fs.existsSync(BASE_STATUS)) sessionRows.push(compactPaperSession(readJson(BASE_STATUS, {}), 'BASE'));
if (fs.existsSync(V4_STATUS)) sessionRows.push(compactPaperSession(readJson(V4_STATUS, {}), 'V4'));
if (sessionRows.some(Boolean)) {
  const journal = upsertPaperSessions(readJson(SESSIONS, { meta: {}, sessions: [] }), sessionRows);
  fs.writeFileSync(SESSIONS, JSON.stringify(journal, null, 2));
}
