export function eventDatesInHoldingInterval(result, events) {
  const entryDate = result?.entryTimestamp?.slice(0, 10) ?? result?.date;
  const exitDate = result?.exitTimestamp?.slice(0, 10);
  if (!entryDate || !exitDate || exitDate < entryDate) return null;
  return (events ?? []).filter((event) => event?.date >= entryDate && event?.date <= exitDate);
}

export function applyEventExclusion(results, events) {
  return (results ?? []).map((result) => {
    if (result?.status !== 'TRADE') return { ...result, eventFilter: { status: result?.status ?? 'DATA_MISSING' } };
    const matchedEvents = eventDatesInHoldingInterval(result, events);
    if (matchedEvents == null) return { ...result, eventFilter: { status: 'DATA_MISSING' } };
    return {
      ...result,
      eventFilter: {
        status: matchedEvents.length ? 'EVENT_SKIPPED' : 'EVENT_OPEN',
        matchedEvents,
      },
    };
  });
}
