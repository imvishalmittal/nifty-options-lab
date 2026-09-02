export const OPENING_RANGE_SHADOW_START = '2026-09-02';

export const OPENING_RANGE_SHADOW_META = Object.freeze({
  paperMode: true,
  experimental: true,
  confirmedEdge: false,
  strategy: '30-minute opening-range ATM credit spread',
  strategyVersion: 'ORC-SHADOW-V1',
  startedOn: OPENING_RANGE_SHADOW_START,
  noBackfill: true,
  excludedFromV2V11: true,
  lotsPerObservation: 1,
  minimumProspectiveTrades: 100,
  selectionStatus: 'REJECTED_UNCONFIRMED',
});

const TERMINAL = new Set(['TRADE', 'NO_TRADE', 'NO_SESSION', 'DATA_MISSING', 'DATA_BOUNDARY']);
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function compactContract(row) {
  if (!row?.symbol) return null;
  return {
    symbol: String(row.symbol),
    strike: finite(row.strike),
    optionType: row.optionType ? String(row.optionType) : null,
  };
}

function compactScenario(row) {
  if (!row) return null;
  return {
    netPnl: finite(row.netPnl),
    grossPnl: finite((row.legs?.short?.grossPnl ?? 0) + (row.legs?.long?.grossPnl ?? 0)),
    charges: finite(row.charges),
  };
}

export function compactOpeningRangeShadowSession(row, updatedAt = new Date().toISOString()) {
  if (!row?.date) throw new Error('Opening-range shadow session requires a date');
  const trade = row.status === 'TRADE';
  return {
    date: String(row.date),
    status: String(row.status ?? 'UNKNOWN'),
    reason: row.reason ? String(row.reason) : null,
    updatedAt,
    signalDirection: row.signal?.direction ?? null,
    rangeHigh: finite(row.signal?.high),
    rangeLow: finite(row.signal?.low),
    confirmationTimestamp: row.signal?.confirmationTimestamp ?? null,
    expiry: row.expiry ?? null,
    short: compactContract(row.selection?.short),
    long: compactContract(row.selection?.long),
    entryTimestamp: row.entryTimestamp ?? null,
    entryCredit: finite(row.entryCredit),
    exitTimestamp: row.exitTimestamp ?? null,
    exitReason: row.exitReason ?? null,
    lotSize: finite(row.lotSize),
    ambiguous: Boolean(row.ambiguous),
    normalized: trade ? compactScenario(row.costs?.normalized) : null,
    stress0_5: trade ? compactScenario(row.costs?.stress0_5) : null,
    stress1_0: trade ? compactScenario(row.costs?.stress1_0) : null,
  };
}

export function shouldRunOpeningRangeShadow(journal, date, force = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Paper session date must be YYYY-MM-DD');
  if (date < OPENING_RANGE_SHADOW_START) return { run: false, reason: 'Historical backfill is forbidden' };
  const existing = (journal?.sessions ?? []).find((row) => row.date === date);
  if (!existing || force || !TERMINAL.has(existing.status)) return { run: true, reason: existing ? 'Retry non-terminal session' : 'New prospective session' };
  return { run: false, reason: `Session already terminal (${existing.status})` };
}

export function upsertOpeningRangeShadowJournal(journal, session) {
  const sessions = Array.isArray(journal?.sessions) ? [...journal.sessions] : [];
  const index = sessions.findIndex((row) => row.date === session.date);
  if (index === -1) sessions.push(session);
  else sessions[index] = session;
  sessions.sort((left, right) => left.date.localeCompare(right.date));
  return {
    meta: { ...OPENING_RANGE_SHADOW_META, ...(journal?.meta ?? {}), ...OPENING_RANGE_SHADOW_META, updatedAt: session.updatedAt },
    sessions,
  };
}
