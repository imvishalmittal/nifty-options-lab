export const PEAD_RULES = Object.freeze({
  sueThresholdLong: 2,
  sueThresholdShort: -2,
  driftWindowTradingDays: 20,
  marketOpen: '09:15',
});

export function standardizedUnexpectedEarnings({ actualEps, consensusEstimateEps, analystEstimateDispersion }) {
  if (![actualEps, consensusEstimateEps, analystEstimateDispersion].every(Number.isFinite) || analystEstimateDispersion <= 0) return null;
  return (actualEps - consensusEstimateEps) / analystEstimateDispersion;
}

export function classifyPeadSignal(input, rules = PEAD_RULES) {
  const sue = standardizedUnexpectedEarnings(input ?? {});
  if (sue == null) return { status: 'INSUFFICIENT_DATA' };
  if (sue >= rules.sueThresholdLong) return { status: 'ENTRY', direction: 'CE', sue };
  if (sue <= rules.sueThresholdShort) return { status: 'ENTRY', direction: 'PE', sue };
  return { status: 'NO_TRADE', sue };
}

function uniqueSessions(tradingSessions) {
  const sessions = [...new Set(tradingSessions ?? [])].sort();
  if (sessions.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('tradingSessions must contain ISO dates');
  return sessions;
}

export function peadDriftWindow({ announcementTimestamp, tradingSessions, rules = PEAD_RULES } = {}) {
  const match = String(announcementTimestamp).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return { status: 'INSUFFICIENT_DATA', reason: 'Point-in-time announcement timestamp unavailable' };
  const [, announcementDate, announcementTime] = match;
  const sessions = uniqueSessions(tradingSessions);
  const mayUseSameSessionOpen = announcementTime < rules.marketOpen && sessions.includes(announcementDate);
  const entryDate = mayUseSameSessionOpen ? announcementDate : sessions.find((date) => date > announcementDate);
  if (!entryDate) return { status: 'INSUFFICIENT_DATA', reason: 'Causal entry session unavailable' };
  const entryIndex = sessions.indexOf(entryDate);
  const targetExitDate = sessions[entryIndex + rules.driftWindowTradingDays];
  if (!targetExitDate) return { status: 'INSUFFICIENT_DATA', reason: 'Complete drift window unavailable' };
  return { status: 'WINDOW', entryDate, targetExitDate };
}

export function selectPeadExpiry(expiries, targetExitDate) {
  return [...new Set(expiries ?? [])].filter((date) => date >= targetExitDate).sort()[0] ?? null;
}
