function brokerage(value) {
  const raw = Math.min(0.001 * value, 20);
  return raw < 5 ? Math.min(5, 0.025 * value) : raw;
}

function legCharges(value, side) {
  const broker = brokerage(value);
  const exchange = value * 0.0000297;
  const sebi = value * 0.000001;
  const ipft = value * 0.000001;
  const stamp = side === 'BUY' ? value * 0.00003 : 0;
  const stt = side === 'SELL' ? value * 0.00025 : 0;
  const gst = 0.18 * (broker + exchange + sebi + ipft);
  return { brokerage: broker, exchange, sebi, ipft, stamp, stt, gst };
}

function sumCharges(charges) {
  return Object.values(charges).reduce((sum, value) => sum + value, 0);
}

export function calculateEquityIntradayRoundTrip({
  direction,
  entry,
  exit,
  quantity,
  slippageBpsPerLeg = 0,
}) {
  if (!['LONG', 'SHORT'].includes(direction)) throw new Error('direction must be LONG or SHORT');
  if (![entry, exit, quantity].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('entry, exit and quantity must be positive numbers');
  }
  const slip = slippageBpsPerLeg / 10000;
  const effectiveEntry = direction === 'LONG' ? entry * (1 + slip) : entry * (1 - slip);
  const effectiveExit = direction === 'LONG' ? exit * (1 - slip) : exit * (1 + slip);
  const entrySide = direction === 'LONG' ? 'BUY' : 'SELL';
  const exitSide = direction === 'LONG' ? 'SELL' : 'BUY';
  const entryCharges = legCharges(effectiveEntry * quantity, entrySide);
  const exitCharges = legCharges(effectiveExit * quantity, exitSide);
  const grossPnl = direction === 'LONG'
    ? (effectiveExit - effectiveEntry) * quantity
    : (effectiveEntry - effectiveExit) * quantity;
  const totalCharges = sumCharges(entryCharges) + sumCharges(exitCharges);
  return {
    slippageBpsPerLeg,
    effectiveEntry,
    effectiveExit,
    grossPnl,
    entryCharges,
    exitCharges,
    totalCharges,
    netPnl: grossPnl - totalCharges,
  };
}

export function equityIntradayCostScenarios(inputs) {
  return {
    normalized: calculateEquityIntradayRoundTrip(inputs),
    stress2bps: calculateEquityIntradayRoundTrip({ ...inputs, slippageBpsPerLeg: 2 }),
    stress5bps: calculateEquityIntradayRoundTrip({ ...inputs, slippageBpsPerLeg: 5 }),
  };
}
