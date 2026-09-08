export const MULTI_INDEX_SPREAD_RULES = Object.freeze({
  hedgeIntervals: 6,
  underlyings: Object.freeze([
    Object.freeze({ underlying: 'NIFTY', spotSymbol: 'NSE-NIFTY' }),
    Object.freeze({ underlying: 'BANKNIFTY', spotSymbol: 'NSE-BANKNIFTY' }),
    Object.freeze({ underlying: 'FINNIFTY', spotSymbol: 'NSE-FINNIFTY' }),
  ]),
});

export function parseIndexOptionContract(value, underlying) {
  const symbol = typeof value === 'string' ? value : value?.symbol ?? value?.groww_symbol;
  const match = String(symbol).match(new RegExp(`^NSE-${underlying}-(\\d{2}[A-Za-z]{3}\\d{2})-(\\d+(?:\\.\\d+)?)-(CE|PE)$`));
  if (!match) return null;
  return { symbol, expiryCode: match[1], strike: Number(match[2]), optionType: match[3], underlying };
}

export function indexLotSizeForExpiry(underlying, expiry) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry))) throw new Error('expiry must be YYYY-MM-DD');
  if (underlying === 'NIFTY') {
    if (expiry < '2021-08-01') return 75;
    if (expiry < '2024-05-02') return 50;
    return 25;
  }
  if (underlying === 'BANKNIFTY') {
    if (expiry < '2020-07-01') return 20;
    if (expiry < '2023-07-01') return 25;
    return 15;
  }
  if (underlying === 'FINNIFTY') {
    if (expiry < '2021-01-01') return null;
    if (expiry < '2024-05-02') return 40;
    return 25;
  }
  throw new Error(`Unsupported underlying ${underlying}`);
}

export function selectListedIntervalCreditSpread(contracts, spot, direction, hedgeIntervals = MULTI_INDEX_SPREAD_RULES.hedgeIntervals) {
  if (!Number.isInteger(hedgeIntervals) || hedgeIntervals < 1) throw new Error('hedgeIntervals must be a positive integer');
  const optionType = direction === 'UP' ? 'PE' : direction === 'DOWN' ? 'CE' : null;
  if (!optionType) throw new Error('direction must be UP or DOWN');
  const available = contracts.filter((row) => row.optionType === optionType && Number.isFinite(row.strike));
  const strikes = [...new Set(available.map((row) => row.strike))].sort((a, b) => a - b);
  const shortStrike = strikes.toSorted((a, b) => Math.abs(a - spot) - Math.abs(b - spot) || a - b)[0];
  if (!Number.isFinite(shortStrike)) return null;
  const shortIndex = strikes.indexOf(shortStrike);
  const hedgeIndex = shortIndex + (direction === 'UP' ? -hedgeIntervals : hedgeIntervals);
  const hedgeStrike = strikes[hedgeIndex];
  if (!Number.isFinite(hedgeStrike)) return null;
  const short = available.find((row) => row.strike === shortStrike);
  const long = available.find((row) => row.strike === hedgeStrike);
  return short && long ? { short, long, listedIntervals: hedgeIntervals } : null;
}

export function selectCrossingSkewedSpread({ contracts, spot, direction, crossingDirection, hedgeIntervals = 6 }) {
  const optionType = direction === 'UP' ? 'PE' : direction === 'DOWN' ? 'CE' : null;
  if (!optionType) throw new Error('direction must be UP or DOWN');
  const agrees = crossingDirection === direction;
  const available = contracts.filter((row) => row.optionType === optionType && Number.isFinite(row.strike));
  const strikes = [...new Set(available.map((row) => row.strike))].sort((a, b) => a - b);
  const atmIndex = strikes.indexOf(strikes.toSorted((a, b) => Math.abs(a - spot) - Math.abs(b - spot) || a - b)[0]);
  const shortIndex = agrees ? atmIndex : atmIndex + (direction === 'UP' ? -1 : 1);
  const hedgeIndex = shortIndex + (direction === 'UP' ? -hedgeIntervals : hedgeIntervals);
  const shortStrike = strikes[shortIndex];
  const hedgeStrike = strikes[hedgeIndex];
  if (![shortStrike, hedgeStrike].every(Number.isFinite)) return null;
  return {
    short: available.find((row) => row.strike === shortStrike),
    long: available.find((row) => row.strike === hedgeStrike),
    listedIntervals: hedgeIntervals,
    crossingAgreement: agrees,
    shortOffsetIntervals: agrees ? 0 : 1,
  };
}
