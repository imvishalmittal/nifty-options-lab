import fs from 'node:fs';
import { backtestProfitOnly } from '../research/groww-profit-only-directional-backtest.mjs';
import {
  compactProfitOnlyPaperSession,
  shouldRunProfitOnlyPaper,
  upsertProfitOnlyPaperJournal,
} from './profit-only-paper-journal.mjs';

const JOURNAL = 'public/paper/profit-only-directional.json';
const read = () => { try { return JSON.parse(fs.readFileSync(JOURNAL, 'utf8')); } catch { return { meta: {}, sessions: [] }; } };
const write = (value) => fs.writeFileSync(JOURNAL, `${JSON.stringify(value, null, 2)}\n`);

async function main() {
  if (!process.env.GROWW_ACCESS_TOKEN) throw new Error('GROWW_ACCESS_TOKEN is required');
  const date = process.env.PAPER_SESSION_DATE ?? new Date().toISOString().slice(0, 10);
  const force = String(process.env.FORCE ?? '').toLowerCase() === 'true';
  const journal = read();
  const guard = shouldRunProfitOnlyPaper(journal, date, force);
  if (!guard.run) return console.log(guard.reason);
  try {
    const result = await backtestProfitOnly({ token: process.env.GROWW_ACCESS_TOKEN, startDate: date, endDate: date, lotSize: 65 });
    const session = compactProfitOnlyPaperSession(result, date);
    write(upsertProfitOnlyPaperJournal(journal, session));
    console.log(JSON.stringify(session, null, 2));
  } catch (error) {
    const session = { date, status: 'FAILED', reason: error.message, updatedAt: new Date().toISOString(), strategies: {} };
    write(upsertProfitOnlyPaperJournal(journal, session));
    throw error;
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
