import { PAPER_RULES, chooseClosestPremium, parseOption, premiumBracket } from './paper-engine.mjs';
import { candleAt, sleep } from './groww-paper-client.mjs';

function gcd(a, b) {
  let x = Math.abs(Math.round(a)); let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x;
}

export function inferredStrikeStep(parsed) {
  const strikes = [...new Set(parsed.map((row) => row.strike).filter(Number.isFinite))].sort((a, b) => a - b);
  const diffs = [];
  for (let index = 1; index < strikes.length; index += 1) {
    const diff = strikes[index] - strikes[index - 1];
    if (diff > 0 && diff <= 500) diffs.push(diff);
  }
  const step = diffs.reduce((value, diff) => value ? gcd(value, diff) : diff, 0);
  // NIFTY's near-ATM strike grid is 50 points. A sparse provider response can
  // make the observed GCD look like 100/200; never promote such a gap to the step.
  return step >= 25 && step <= 50 ? step : 50;
}

function orderedOffsets(optionType, radius) {
  const offsets = [0];
  for (let distance = 1; distance <= radius; distance += 1) {
    // Prefer the nearest ITM strike, then the equally distant OTM strike.
    offsets.push(optionType === 'CE' ? -distance : distance);
    offsets.push(optionType === 'CE' ? distance : -distance);
  }
  return offsets;
}

export function paperContractCandidates(contracts, spot, optionType, radius = 10) {
  const parsed = contracts.map(parseOption).filter(Boolean);
  const expiryCode = parsed.find((row) => row.optionType === optionType)?.expiryCode ?? parsed[0]?.expiryCode;
  if (!expiryCode || !Number.isFinite(spot)) return { candidates: [], strikeStep: 50, missingStrikes: [], actualCount: 0 };
  const strikeStep = inferredStrikeStep(parsed);
  const center = Math.round(spot / strikeStep) * strikeStep;
  const actual = new Map(parsed.filter((row) => row.optionType === optionType).map((row) => [row.strike, row]));
  const candidates = orderedOffsets(optionType, radius).map((offset) => {
    const strike = center + offset * strikeStep;
    const row = actual.get(strike);
    return row ? { ...row, discoverySource: 'contracts_api' } : {
      symbol: `NSE-NIFTY-${expiryCode}-${strike}-${optionType}`,
      expiryCode, strike, optionType, discoverySource: 'synthetic_gap_fill',
    };
  });
  return {
    candidates,
    strikeStep,
    missingStrikes: candidates.filter((row) => row.discoverySource === 'synthetic_gap_fill').map((row) => row.strike),
    actualCount: candidates.length - candidates.filter((row) => row.discoverySource === 'synthetic_gap_fill').length,
  };
}

export async function selectPremiumContract({ fetchCandles, date, candidateSet, reference = PAPER_RULES.referencePremium }) {
  const rows = [];
  for (const candidate of candidateSet.candidates) {
    let premium = null;
    let error = null;
    try {
      const candles = await fetchCandles('FNO', candidate.symbol, date, '09:25', '09:29');
      premium = candleAt(candles, '09:25')?.open ?? null;
    } catch (caught) {
      if (!/failed \((400|404)\)/.test(caught?.message ?? '')) throw caught;
      error = caught.message;
    }
    rows.push({ ...candidate, premium, ...(error ? { error } : {}) });
    if (premiumBracket(rows, reference).bracketed) break;
  }
  const bracket = premiumBracket(rows, reference);
  return {
    selected: bracket.bracketed ? chooseClosestPremium(rows, reference) : null,
    ...bracket,
    fetched: rows.length,
    candidatesChecked: rows,
    strikeStep: candidateSet.strikeStep,
    missingStrikes: candidateSet.missingStrikes,
    actualCandidateCount: candidateSet.actualCount,
  };
}

export async function selectPaperContracts({
  fetchCandles,
  loadContracts,
  date,
  spot,
  now = () => '23:59',
  retryUntil = '09:34',
  maxAttempts = 4,
  retryDelayMs = 30_000,
}) {
  let result = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const contracts = await loadContracts();
    const [ce, pe] = await Promise.all([
      selectPremiumContract({ fetchCandles, date, candidateSet: paperContractCandidates(contracts, spot, 'CE') }),
      selectPremiumContract({ fetchCandles, date, candidateSet: paperContractCandidates(contracts, spot, 'PE') }),
    ]);
    result = { ce, pe, attempt, complete: Boolean(ce.bracketed && ce.selected && pe.bracketed && pe.selected) };
    if (result.complete || attempt === maxAttempts || now() >= retryUntil) return result;
    await sleep(retryDelayMs);
  }
  return result;
}
