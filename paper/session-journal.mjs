function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactContract(row) {
  if (!row || typeof row !== 'object' || !row.symbol) return null;
  return {
    symbol: String(row.symbol),
    strike: finiteOrNull(row.strike),
    optionType: row.optionType ? String(row.optionType) : null,
    premium: finiteOrNull(row.premium),
  };
}

export function compactPaperSession(status, thread) {
  if (!status || typeof status !== 'object' || !status.date) return null;
  const audit = status.selectionAudit && typeof status.selectionAudit === 'object' ? status.selectionAudit : {};
  const trades = Array.isArray(status.trades) ? status.trades : status.trade ? [status.trade] : [];
  const totalPnl = trades.reduce((sum, row) => sum + (Number.isFinite(Number(row?.totalPnl)) ? Number(row.totalPnl) : 0), 0);
  const strategyVersions = thread === 'V4' ? ['V4', 'V5'] : ['V2', 'V3-5', 'V3-10', 'V6', 'V7', 'V8'];
  const strategyOutcomes = Object.fromEntries(trades.map((row) => {
    const version = row?.strategyVersion === 'V3' ? `V3-${row?.trailStepPoints}` : String(row?.strategyVersion ?? 'UNKNOWN');
    return [version, { tradeCount: 1, totalPnl: Number.isFinite(Number(row?.totalPnl)) ? Number(Number(row.totalPnl).toFixed(2)) : null }];
  }));

  return {
    date: String(status.date),
    thread,
    strategyVersions,
    status: String(status.status ?? 'UNKNOWN'),
    reason: status.reason ? String(status.reason) : null,
    updatedAt: status.updatedAt ? String(status.updatedAt) : null,
    spot925: finiteOrNull(audit.spot925),
    expiry: audit.expiry ? String(audit.expiry) : null,
    referencePremium: finiteOrNull(audit.referencePremium),
    ce: compactContract(audit.ce?.selected),
    pe: compactContract(audit.pe?.selected),
    side: status.side ? String(status.side) : trades[0]?.callType ? String(trades[0].callType) : null,
    strike: finiteOrNull(status.strike ?? trades[0]?.strikePrice),
    entry: finiteOrNull(status.entry ?? trades[0]?.entryPremium),
    entryTime: status.entryTime ? String(status.entryTime) : trades[0]?.entryTime ? String(trades[0].entryTime) : null,
    signalSource: status.signalSource ? String(status.signalSource) : trades[0]?.signalSource ? String(trades[0].signalSource) : null,
    tradeCount: trades.length,
    totalPnl: trades.length ? Number(totalPnl.toFixed(2)) : null,
    strategyOutcomes,
  };
}

export function upsertPaperSessions(journal, rows) {
  const next = {
    meta: { ...(journal?.meta ?? {}), paperMode: true },
    sessions: Array.isArray(journal?.sessions) ? [...journal.sessions] : [],
  };
  const byKey = new Map(next.sessions.map((row, index) => [`${row.date}|${row.thread}`, index]));

  for (const row of rows.filter(Boolean)) {
    const key = `${row.date}|${row.thread}`;
    const index = byKey.get(key);
    if (index === undefined) {
      byKey.set(key, next.sessions.length);
      next.sessions.push(row);
    } else {
      next.sessions[index] = row;
    }
  }

  next.sessions.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.thread).localeCompare(String(b.thread)));
  next.meta.updatedAt = rows.filter(Boolean).map((row) => row.updatedAt).filter(Boolean).sort().at(-1) ?? next.meta.updatedAt ?? null;
  next.meta.threads = ['BASE', 'V4'];
  return next;
}
