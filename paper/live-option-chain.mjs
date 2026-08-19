const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function growwExpiryCode(expiryDate) {
  const match = String(expiryDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid expiry date: ${expiryDate}`);
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) throw new Error(`Invalid expiry month: ${expiryDate}`);
  return `${day}${monthName}${year.slice(-2)}`;
}

export function contractsFromLiveOptionChain(payload, expiryDate, underlying = 'NIFTY') {
  const strikes = payload?.strikes;
  if (!strikes || typeof strikes !== 'object') return [];
  const expiryCode = growwExpiryCode(expiryDate);
  const contracts = [];
  for (const [strikeText, sides] of Object.entries(strikes)) {
    const strike = Number(strikeText);
    if (!Number.isFinite(strike) || !sides || typeof sides !== 'object') continue;
    for (const optionType of ['CE', 'PE']) {
      const leg = sides[optionType];
      if (!leg || typeof leg !== 'object' || !leg.trading_symbol) continue;
      contracts.push({
        symbol: `NSE-${underlying}-${expiryCode}-${strikeText}-${optionType}`,
        expiryCode,
        strike,
        optionType,
        tradingSymbol: String(leg.trading_symbol),
        liveLtp: Number.isFinite(Number(leg.ltp)) ? Number(leg.ltp) : null,
      });
    }
  }
  return contracts;
}
