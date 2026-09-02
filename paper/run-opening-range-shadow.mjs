import fs from 'node:fs';
import { backtestOpeningRangeCredit } from '../research/groww-opening-range-credit-backtest.mjs';
import {
  compactOpeningRangeShadowSession,
  shouldRunOpeningRangeShadow,
  upsertOpeningRangeShadowJournal,
} from './opening-range-shadow-journal.mjs';

const JOURNAL = 'public/paper/opening-range-shadow.json';

function readJournal() {
  try { return JSON.parse(fs.readFileSync(JOURNAL, 'utf8')); }
  catch { return { meta: {}, sessions: [] }; }
}

function writeJournal(journal) {
  fs.mkdirSync('public/paper', { recursive: true });
  fs.writeFileSync(JOURNAL, `${JSON.stringify(journal, null, 2)}\n`);
}

function utcDate() { return new Date().toISOString().slice(0, 10); }

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  // The scheduled run occurs during the same UTC date as the Indian market
  // session. An explicit value is reserved for same-session operational retry.
  const date = process.env.PAPER_SESSION_DATE || utcDate();
  const force = String(process.env.FORCE ?? '').toLowerCase() === 'true';
  const journal = readJournal();
  const guard = shouldRunOpeningRangeShadow(journal, date, force);
  if (!guard.run) { console.log(guard.reason); return; }

  try {
    const result = await backtestOpeningRangeCredit({ token, startDate: date, endDate: date });
    const source = result.results[0] ?? { date, status: 'NO_SESSION', reason: 'No NIFTY cash session returned' };
    const session = compactOpeningRangeShadowSession(source);
    writeJournal(upsertOpeningRangeShadowJournal(journal, session));
    console.log(JSON.stringify(session, null, 2));
  } catch (error) {
    const failed = compactOpeningRangeShadowSession({ date, status: 'FAILED', reason: error.message });
    writeJournal(upsertOpeningRangeShadowJournal(journal, failed));
    throw error;
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
