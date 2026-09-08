export const PROFIT_ONLY_PAPER_START = '2026-09-08';
export const PROFIT_ONLY_PAPER_VARIANTS = Object.freeze([
  'RETEST15_TRAIL_5_AFTER_BE_10',
  'RETEST15_TRAIL_10_AFTER_BE_10',
  'PREVIOUS_DAY_BREAK_TRAIL_5_AFTER_BE_10',
  'PREVIOUS_DAY_BREAK_TRAIL_10_AFTER_BE_10',
]);

export const PROFIT_ONLY_PAPER_META = Object.freeze({
  paperMode: true,
  brokerOrders: false,
  prospectiveOnly: true,
  startedOn: PROFIT_ONLY_PAPER_START,
  capitalPerStrategy: 60000,
  variants: PROFIT_ONLY_PAPER_VARIANTS,
  selectionBasis: 'Experimental shadow observation while frozen 2020-2024 trailing discovery runs',
  validationStatus: 'UNVERIFIED_TRAILING_DISCOVERY_RUNNING',
  excludedFromV2V11Totals: true,
});

const TERMINAL = new Set(['TRADE', 'NO_TRADE', 'NO_SESSION', 'DATA_MISSING']);
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export function shouldRunProfitOnlyPaper(journal, date, force = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Paper session date must be YYYY-MM-DD');
  if (date < PROFIT_ONLY_PAPER_START) return { run: false, reason: 'Historical paper backfill is forbidden' };
  const existing = (journal?.sessions ?? []).find((row) => row.date === date);
  if (!existing || force || !TERMINAL.has(existing.status)) return { run: true, reason: existing ? 'Retry non-terminal session' : 'New prospective session' };
  return { run: false, reason: `Session already terminal (${existing.status})` };
}

function compactTrade(row, lotSize = 65, capital = 60000) {
  if (!row) return null;
  const lots = Math.floor(capital / (row.entry * lotSize));
  return {
    side: row.side,
    contract: row.contract?.symbol ?? null,
    expiry: row.contract?.expiryCode ?? null,
    strike: finite(row.contract?.strike),
    signalTime: row.signalTime ?? null,
    entryTime: row.entryTime ?? null,
    exitTime: row.exitTime ?? null,
    entryPremium: finite(row.entry),
    exitPremium: finite(row.exit),
    peakPremium: finite(row.peak),
    exitReason: row.result ?? null,
    lots,
    lotSize,
    amountInvested: finite(row.entry * lotSize * lots),
    directionalPnlPerUnit: finite(row.pnlPerUnit),
    normalNetPnl: finite(row.money?.current),
    stress0_5NetPnl: finite(row.money?.stress0_5),
    stress1_0NetPnl: finite(row.money?.stress1_0),
  };
}

export function compactProfitOnlyPaperSession(result, date, updatedAt = new Date().toISOString()) {
  const source = (result?.sessions ?? []).find((row) => row.date === date);
  const strategies = Object.fromEntries(PROFIT_ONLY_PAPER_VARIANTS.map((key) => {
    const row = result?.variants?.[key]?.trades?.find((trade) => trade.date === date);
    return [key, compactTrade(row, result?.methodology?.lotSize ?? 65, result?.methodology?.capital ?? 60000)];
  }));
  const trades = Object.values(strategies).filter(Boolean).length;
  return {
    date,
    status: trades ? 'TRADE' : (source?.status ?? 'NO_SESSION'),
    reason: trades ? null : (source?.reason ?? 'No selected signal'),
    updatedAt,
    strategies,
  };
}

export function upsertProfitOnlyPaperJournal(journal, session) {
  const sessions = Array.isArray(journal?.sessions) ? [...journal.sessions] : [];
  const index = sessions.findIndex((row) => row.date === session.date);
  if (index < 0) sessions.push(session); else sessions[index] = session;
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return { meta: { ...(journal?.meta ?? {}), ...PROFIT_ONLY_PAPER_META, updatedAt: session.updatedAt }, sessions };
}
