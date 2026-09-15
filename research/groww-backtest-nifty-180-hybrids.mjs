import fs from 'node:fs';
import { backtestNifty180, normalizeCandles } from './groww-backtest-nifty-180.mjs';
import { calculateLongOptionRoundTripCosts } from './groww-option-costs.mjs';
import {
  HYBRID_RULES,
  HYBRID_STRATEGIES,
  HYBRID_VARIANTS,
  classifyHybridEntry,
  evaluateHybridPosition,
} from './nifty-180-hybrid-strategies.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_SPACING_MS = 1500;
const CAPITAL = 60000;
let lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(token, endpoint, params, spacingMs) {
  const wait = Math.max(0, spacingMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt <= 8; attempt += 1) {
    lastRequestAt = Date.now();
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-API-VERSION': '1.0',
      },
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status !== 'FAILURE') return body.payload ?? body;
    if ((response.status === 429 || response.status >= 500) && attempt < 8) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(5000 * (2 ** attempt), 60000));
      continue;
    }
    throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
  }
  throw new Error(`Groww ${endpoint} exhausted retries`);
}

async function fetchCandles(token, { segment, symbol, date, start = '09:25', end = '15:29' }, spacingMs) {
  const payload = await apiGet(token, '/historical/candles', {
    exchange: 'NSE',
    segment,
    groww_symbol: symbol,
    start_time: `${date} ${start}:00`,
    end_time: `${date} ${end}:00`,
    candle_interval: '1minute',
  }, spacingMs);
  return normalizeCandles(payload.candles ?? []);
}

function lotsAffordable(entryPremium, historicalLotSize) {
  if (!(entryPremium > 0) || !(historicalLotSize > 0)) return 0;
  return Math.floor(CAPITAL / (entryPremium * historicalLotSize));
}

function costScenario(position, tradeDate, historicalLotSize, lots) {
  if (!(lots > 0)) return null;
  const units = lots * historicalLotSize;
  const base = {
    entryPremium: position.entry,
    exitPremium: position.exit,
    lotSize: units,
    tradeDate,
  };
  return {
    lots,
    units,
    premiumCapitalUsed: position.entry * units,
    current: calculateLongOptionRoundTripCosts(base),
    stress0_5: calculateLongOptionRoundTripCosts({ ...base, slippagePointsPerLeg: 0.5 }),
    stress1_0: calculateLongOptionRoundTripCosts({ ...base, slippagePointsPerLeg: 1.0 }),
  };
}

export function moneyScenarios(position, tradeDate, historicalLotSize) {
  const affordableLots = lotsAffordable(position.entry, historicalLotSize);
  const initialRiskPoints = position.entry - HYBRID_RULES.initialStopPremium;
  const initialRiskPerLot = initialRiskPoints * historicalLotSize;
  const riskLots = (riskFraction) => Math.min(
    affordableLots,
    initialRiskPerLot > 0 ? Math.floor((CAPITAL * riskFraction) / initialRiskPerLot) : 0,
  );
  const oneLot = costScenario(position, tradeDate, historicalLotSize, 1);
  return {
    capital: CAPITAL,
    historicalLotSize,
    initialRiskPoints,
    initialRiskPerLot,
    grossR: initialRiskPoints > 0 ? position.pnlPerUnit / initialRiskPoints : null,
    oneLotNetR: oneLot ? oneLot.current.netPnl / initialRiskPerLot : null,
    minimumCapitalForOneLotAt1PctRisk: initialRiskPerLot / 0.01,
    minimumCapitalForOneLotAt2PctRisk: initialRiskPerLot / 0.02,
    oneLot,
    affordable: costScenario(position, tradeDate, historicalLotSize, affordableLots),
    risk1Pct: costScenario(position, tradeDate, historicalLotSize, riskLots(0.01)),
    risk2Pct: costScenario(position, tradeDate, historicalLotSize, riskLots(0.02)),
  };
}

function maxDrawdown(values) {
  let equity = 0;
  let peak = 0;
  let result = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    result = Math.max(result, peak - equity);
  }
  return result;
}

function longestLosingStreak(values) {
  let current = 0;
  let result = 0;
  for (const value of values) {
    if (value < 0) {
      current += 1;
      result = Math.max(result, current);
    } else {
      current = 0;
    }
  }
  return result;
}

function summarizeMoneyScenario(rows, key) {
  const scored = rows.map((row) => row.money[key]).filter(Boolean);
  const current = scored.map((row) => row.current.netPnl);
  const stress05 = scored.map((row) => row.stress0_5.netPnl);
  const stress10 = scored.map((row) => row.stress1_0.netPnl);
  const wins = current.filter((value) => value > 0);
  const losses = current.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  return {
    feasibleTrades: scored.length,
    winners: wins.length,
    losers: losses.length,
    winRate: scored.length ? wins.length / scored.length : null,
    totalNetPnl: current.reduce((sum, value) => sum + value, 0),
    averageNetPnl: scored.length ? current.reduce((sum, value) => sum + value, 0) / scored.length : null,
    averageWinner: wins.length ? grossProfit / wins.length : null,
    averageLoser: losses.length ? -grossLoss / losses.length : null,
    worstTrade: losses.length ? Math.min(...losses) : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? null : 0),
    maxDrawdownRupees: maxDrawdown(current),
    longestLosingStreak: longestLosingStreak(current),
    totalNetPnlStress0_5: stress05.reduce((sum, value) => sum + value, 0),
    totalNetPnlStress1_0: stress10.reduce((sum, value) => sum + value, 0),
  };
}

function summarizeTrades(rows) {
  const resultCounts = {};
  const sourceCounts = {};
  for (const row of rows) {
    resultCounts[row.result] = (resultCounts[row.result] ?? 0) + 1;
    sourceCounts[row.signalSource] = (sourceCounts[row.signalSource] ?? 0) + 1;
  }
  const grossR = rows.map((row) => row.money.grossR).filter(Number.isFinite);
  const netR = rows.map((row) => row.money.oneLotNetR).filter(Number.isFinite);
  return {
    trades: rows.length,
    resultCounts,
    signalSourceCounts: sourceCounts,
    normalized: {
      averageGrossR: grossR.length ? grossR.reduce((a, b) => a + b, 0) / grossR.length : null,
      averageOneLotNetR: netR.length ? netR.reduce((a, b) => a + b, 0) / netR.length : null,
      totalOneLotNetR: netR.reduce((a, b) => a + b, 0),
    },
    oneLot: summarizeMoneyScenario(rows, 'oneLot'),
    affordable: summarizeMoneyScenario(rows, 'affordable'),
    risk1Pct: summarizeMoneyScenario(rows, 'risk1Pct'),
    risk2Pct: summarizeMoneyScenario(rows, 'risk2Pct'),
  };
}

function baseSession(row) {
  return {
    date: row.date,
    oldBaselineStatus: row.status,
    oldBaselineReason: row.reason ?? null,
    spot925: row.spot925 ?? null,
    expiry: row.expiry ?? null,
    callSelection: row.callSelection ?? null,
    putSelection: row.putSelection ?? null,
    candidateFetches: row.candidateFetches ?? null,
  };
}

function sessionFromClassification(base, strategy, classified) {
  return {
    ...base,
    strategy: strategy.key,
    status: classified.status === 'SIGNAL' ? 'TRADE' : classified.status,
    reason: classified.status === 'SIGNAL' ? null : classified.reason,
    primary: classified.primary ?? null,
    backup: classified.backup ?? null,
    signalSource: classified.source ?? null,
    side: classified.side ?? null,
    contract: classified.contract ?? null,
    signalTime: classified.signal?.timestamp ?? null,
    signalClose: classified.signal?.close ?? null,
    niftySignalTime: classified.niftySignal?.timestamp ?? null,
    niftySignalClose: classified.niftySignal?.close ?? null,
    niftyRange: classified.niftyRange ?? null,
    entryTime: classified.entryTime ?? null,
    entry: classified.entry ?? null,
  };
}

export async function backtestHybridStrategies({
  token,
  startDate,
  endDate,
  historicalLotSize,
  spacingMs = DEFAULT_SPACING_MS,
}) {
  if (!(historicalLotSize > 0)) throw new Error('historicalLotSize is required');

  const selectionSource = await backtestNifty180({
    token,
    startDate,
    endDate,
    maxCandidatesPerSide: 8,
    lotSize: null,
    requestSpacingMsOverride: spacingMs,
  });

  const sessionLedgers = Object.fromEntries(HYBRID_STRATEGIES.map((strategy) => [strategy.key, []]));
  const tradeLedgers = Object.fromEntries(HYBRID_STRATEGIES.flatMap((strategy) =>
    HYBRID_VARIANTS.map((variant) => [`${strategy.key}_${variant.key}`, []])));

  for (const row of selectionSource.results) {
    const base = baseSession(row);
    if (row.status === 'DATA_MISSING' || row.status === 'CANDIDATE_BOUNDARY') {
      for (const strategy of HYBRID_STRATEGIES) {
        sessionLedgers[strategy.key].push({ ...base, strategy: strategy.key, status: row.status, reason: row.reason });
      }
      continue;
    }
    if (!row.callSelection?.symbol || !row.putSelection?.symbol) {
      for (const strategy of HYBRID_STRATEGIES) {
        sessionLedgers[strategy.key].push({ ...base, strategy: strategy.key, status: 'DATA_MISSING', reason: 'Missing selected CE or PE actual contract' });
      }
      continue;
    }

    const [callCandles, putCandles, niftyCandles] = await Promise.all([
      fetchCandles(token, { segment: 'FNO', symbol: row.callSelection.symbol, date: row.date }, spacingMs),
      fetchCandles(token, { segment: 'FNO', symbol: row.putSelection.symbol, date: row.date }, spacingMs),
      fetchCandles(token, { segment: 'CASH', symbol: 'NSE-NIFTY', date: row.date, end: '09:44' }, spacingMs),
    ]);

    for (const strategy of HYBRID_STRATEGIES) {
      const classified = classifyHybridEntry({
        strategy,
        callSelection: row.callSelection,
        putSelection: row.putSelection,
        callCandles,
        putCandles,
        niftyCandles,
      });
      sessionLedgers[strategy.key].push(sessionFromClassification(base, strategy, classified));
      if (classified.status !== 'SIGNAL') continue;

      for (const variant of HYBRID_VARIANTS) {
        const position = evaluateHybridPosition(classified.chosenCandles, classified.signal, variant, {
          failFast: strategy.failFast,
        });
        if (!position || position.rejected) throw new Error(`${row.date} ${strategy.key}/${variant.key} lost an already-validated entry`);
        tradeLedgers[`${strategy.key}_${variant.key}`].push({
          date: row.date,
          strategy: strategy.key,
          strategyName: strategy.name,
          variant: variant.key,
          signalSource: classified.source,
          side: classified.side,
          contract: classified.contract,
          primary: classified.primary,
          backup: classified.backup,
          spot925: row.spot925,
          expiry: row.expiry,
          signalTime: classified.signal.timestamp,
          signalClose: classified.signal.close,
          niftySignalTime: classified.niftySignal?.timestamp ?? null,
          niftySignalClose: classified.niftySignal?.close ?? null,
          niftyRange: classified.niftyRange ?? null,
          failFast: strategy.failFast,
          niftyConfirmation: strategy.niftyConfirmation,
          ...position,
          money: moneyScenarios(position, row.date, historicalLotSize),
        });
      }
    }
  }

  const sessionStatusCounts = {};
  for (const strategy of HYBRID_STRATEGIES) {
    const counts = {};
    for (const row of sessionLedgers[strategy.key]) counts[row.status] = (counts[row.status] ?? 0) + 1;
    sessionStatusCounts[strategy.key] = counts;
  }

  return {
    methodology: {
      frozenBeforeResults: true,
      capital: CAPITAL,
      historicalLotSize,
      referencePremium: HYBRID_RULES.referencePremium,
      entryBand: '(160, 220)',
      signalWindow: '[09:30, 09:45)',
      S1: 'Primary = single 09:25 CE/PE closest to ₹180 and qualifies on first completed close >₹180. Backup = opposite-side selected contract and qualifies on old fresh crossing <=₹180 to >₹180. Earlier signal wins; Primary wins same-minute tie.',
      S2: 'Exactly S1 entries. Before that variant activates trailing protection, any surviving completed candle closing <₹180 schedules exit at next bar open; ₹160 hard stop remains active.',
      S3: 'S2 fail-fast exit plus NIFTY confirmation. NIFTY 09:25-09:29 high/low is frozen; CE requires NIFTY completed close above range high, PE below range low. An option signal remains armed only while its premium closes >₹180; Primary wins same-minute tie.',
      exits: {
        V2: 'Existing continuous 20-point trail after ₹220 activation',
        V3_5: 'Existing 5-point stepped trail with 20-point gap',
        V3_10: 'Existing 10-point stepped trail with 20-point gap',
      },
      riskReporting: {
        oneLot: 'Always report exactly one historical lot',
        normalizedR: 'Initial hard-stop risk = entry-160; report gross R and one-lot net R',
        affordable: 'Existing ₹60k max-affordable sizing, reported only for comparability',
        risk1Pct: 'Lots capped by both affordability and 1% of ₹60k initial hard-stop risk; zero lots means infeasible',
        risk2Pct: 'Lots capped by both affordability and 2% of ₹60k initial hard-stop risk; zero lots means infeasible',
        slippage: 'Every money scenario reports current costs plus 0.5 and 1.0 adverse points per leg',
      },
      dataSafety: 'Prior progressive actual-contract selection and candidate-boundary guards are preserved; S3 additionally requires all five NIFTY 09:25-09:29 candles.',
    },
    period: { startDate, endDate },
    selectionSourceDiagnostics: selectionSource.diagnostics,
    sessionStatusCounts,
    sessionLedgers,
    combinations: Object.fromEntries(HYBRID_STRATEGIES.flatMap((strategy) =>
      HYBRID_VARIANTS.map((variant) => {
        const key = `${strategy.key}_${variant.key}`;
        return [key, { summary: summarizeTrades(tradeLedgers[key]), trades: tradeLedgers[key] }];
      }))),
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => {
    const [key, ...rest] = value.slice(2).split('=');
    return [key, rest.join('=')];
  }));
}

async function main() {
  const token = process.env.GROWW_ACCESS_TOKEN;
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');
  const args = parseArgs(process.argv.slice(2));
  const startDate = args.start;
  const endDate = args.end;
  const historicalLotSize = Number(args['lot-size']);
  if (!startDate || !endDate || !(historicalLotSize > 0)) throw new Error('--start, --end and --lot-size are required');
  const result = await backtestHybridStrategies({
    token,
    startDate,
    endDate,
    historicalLotSize,
    spacingMs: Number(process.env.GROWW_REQUEST_SPACING_MS || DEFAULT_SPACING_MS),
  });
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith('groww-backtest-nifty-180-hybrids.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
