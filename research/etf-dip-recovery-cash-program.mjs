function addMonths(dateText, months) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function aggregateCashFlows(cashFlows) {
  const byDate = new Map();
  for (const cashFlow of cashFlows) {
    byDate.set(cashFlow.date, (byDate.get(cashFlow.date) || 0) + cashFlow.amount);
  }
  return [...byDate.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function xirr(cashFlows) {
  const flows = aggregateCashFlows(cashFlows);
  if (flows.length < 2 || !flows.some((flow) => flow.amount < 0) || !flows.some((flow) => flow.amount > 0)) return null;
  const first = new Date(`${flows[0].date}T00:00:00Z`);
  const npv = (rate) => flows.reduce((sum, flow) => {
    const days = (new Date(`${flow.date}T00:00:00Z`) - first) / 86_400_000;
    return sum + flow.amount / ((1 + rate) ** (days / 365));
  }, 0);
  let low = -0.999999;
  let high = 1;
  let lowValue = npv(low);
  let highValue = npv(high);
  for (let attempt = 0; attempt < 80 && Math.sign(lowValue) === Math.sign(highValue); attempt++) {
    high *= 2;
    highValue = npv(high);
  }
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || Math.sign(lowValue) === Math.sign(highValue)) return null;
  for (let iteration = 0; iteration < 200; iteration++) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-8) return mid;
    if (Math.sign(value) === Math.sign(lowValue)) {
      low = mid;
      lowValue = value;
    } else {
      high = mid;
      highValue = value;
    }
  }
  return (low + high) / 2;
}

export function monthlyProgramStarts(sessions, fundingMonths = 3) {
  const finalDate = sessions.at(-1);
  const firstByMonth = new Map();
  for (const date of sessions) {
    const month = date.slice(0, 7);
    if (!firstByMonth.has(month)) firstByMonth.set(month, date);
  }
  return [...firstByMonth.values()].filter((date) => addMonths(date, fundingMonths) <= finalDate);
}

export function simulateCashProgram({
  sessions,
  trades,
  startDate,
  fundingMonths = 3,
  dailyContribution = 15_000,
  executionHaircutPct = 0,
}) {
  const finalDate = sessions.at(-1);
  const fundingEndExclusive = addMonths(startDate, fundingMonths);
  const tradeByDate = new Map(trades.map((trade) => [trade.date, trade]));
  const holdings = [];
  const purchases = [];
  const cashFlows = [];
  let cash = 0;
  let totalContributed = 0;
  let totalDeployed = 0;
  let lastContributionDate = startDate;
  let lastExitDate = startDate;
  let peakConcurrentPositions = 0;

  for (const date of sessions) {
    if (date < startDate) continue;
    for (const holding of holdings) {
      if (holding.closed || holding.trade.status !== 'TARGET' || holding.trade.exitDate !== date) continue;
      const netReturnPct = holding.trade.grossReturnPct - executionHaircutPct;
      holding.closed = true;
      holding.proceeds = holding.invested * (1 + netReturnPct / 100);
      cash += holding.proceeds;
      lastExitDate = date;
    }

    const fundingActive = date < fundingEndExclusive;
    if (fundingActive) {
      cash += dailyContribution;
      totalContributed += dailyContribution;
      lastContributionDate = date;
      cashFlows.push({ date, amount: -dailyContribution });
      const trade = tradeByDate.get(date);
      if (trade && cash > 0) {
        const invested = cash;
        cash = 0;
        totalDeployed += invested;
        const holding = { trade, invested, closed: false, proceeds: null };
        holdings.push(holding);
        purchases.push({
          date,
          symbol: trade.symbol,
          invested,
          targetReturnPct: trade.targetReturnPct,
          exitDate: trade.exitDate,
          status: trade.status,
        });
        peakConcurrentPositions = Math.max(peakConcurrentPositions, holdings.filter((item) => !item.closed).length);
      }
    }
  }

  const openHoldings = holdings.filter((holding) => !holding.closed);
  const terminalDate = openHoldings.length ? finalDate : [lastContributionDate, lastExitDate].sort().at(-1);
  let terminalValue = cash;
  for (const holding of openHoldings) {
    const netReturnPct = holding.trade.grossReturnPct - executionHaircutPct;
    const proceeds = holding.invested * (1 + netReturnPct / 100);
    terminalValue += proceeds;
  }
  cashFlows.push({ date: terminalDate, amount: terminalValue });

  const annualized = xirr(cashFlows);
  return {
    startDate,
    fundingEndExclusive,
    terminalDate,
    fundingSessions: Math.round(totalContributed / dailyContribution),
    dailyContribution,
    totalContributed,
    purchases: purchases.length,
    targetExits: holdings.filter((holding) => holding.closed).length,
    openPositions: openHoldings.length,
    peakConcurrentPositions,
    totalDeployed,
    turnoverMultiple: totalContributed ? totalDeployed / totalContributed : null,
    terminalValue,
    profit: terminalValue - totalContributed,
    totalReturnPct: totalContributed ? ((terminalValue / totalContributed) - 1) * 100 : null,
    xirrPct: annualized === null ? null : annualized * 100,
    purchaseLedger: purchases,
  };
}

export function runRollingCashPrograms({
  sessions,
  targetSweep,
  fundingMonths = 3,
  dailyContribution = 15_000,
  executionHaircutsPct = [0, 0.25, 0.5],
}) {
  const starts = monthlyProgramStarts(sessions, fundingMonths);
  return targetSweep.map((target) => {
    const scenarios = Object.fromEntries(executionHaircutsPct.map((haircut) => {
      const programs = starts.map((startDate) => simulateCashProgram({
        sessions,
        trades: target.trades,
        startDate,
        fundingMonths,
        dailyContribution,
        executionHaircutPct: haircut,
      }));
      const xirrValues = programs.map((program) => program.xirrPct).filter(Number.isFinite);
      const returnValues = programs.map((program) => program.totalReturnPct).filter(Number.isFinite);
      return [String(haircut), {
        programs,
        summary: {
          cohorts: programs.length,
          medianXirrPct: percentile(xirrValues, 0.5),
          p25XirrPct: percentile(xirrValues, 0.25),
          p75XirrPct: percentile(xirrValues, 0.75),
          worstXirrPct: xirrValues.length ? Math.min(...xirrValues) : null,
          bestXirrPct: xirrValues.length ? Math.max(...xirrValues) : null,
          medianTotalReturnPct: percentile(returnValues, 0.5),
          medianContributed: percentile(programs.map((program) => program.totalContributed), 0.5),
          medianTerminalValue: percentile(programs.map((program) => program.terminalValue), 0.5),
          medianPurchases: percentile(programs.map((program) => program.purchases), 0.5),
          medianOpenPositions: percentile(programs.map((program) => program.openPositions), 0.5),
          medianTurnoverMultiple: percentile(programs.map((program) => program.turnoverMultiple), 0.5),
        },
      }];
    }));
    return { targetReturnPct: target.targetReturnPct, scenarios };
  });
}

export function simulateFixedTicketProgram({
  sessions,
  trades,
  startDate,
  fundingMonths = 3,
  ticketAmount = 15_000,
  executionHaircutPct = 0,
}) {
  const finalDate = sessions.at(-1);
  const fundingEndExclusive = addMonths(startDate, fundingMonths);
  const tradeByDate = new Map(trades.map((trade) => [trade.date, trade]));
  const holdings = [];
  const purchases = [];
  const cashFlows = [];
  let cash = 0;
  let totalFreshFunding = 0;
  let totalPurchased = 0;
  let lastPurchaseDate = startDate;
  let lastExitDate = startDate;
  let peakConcurrentPositions = 0;

  for (const date of sessions) {
    if (date < startDate) continue;
    for (const holding of holdings) {
      if (holding.closed || holding.trade.status !== 'TARGET' || holding.trade.exitDate !== date) continue;
      const netReturnPct = holding.trade.grossReturnPct - executionHaircutPct;
      holding.closed = true;
      holding.proceeds = holding.invested * (1 + netReturnPct / 100);
      cash += holding.proceeds;
      lastExitDate = date;
    }

    if (date >= fundingEndExclusive) continue;
    const trade = tradeByDate.get(date);
    if (!trade) continue;
    const freshFunding = Math.max(0, ticketAmount - cash);
    if (freshFunding > 0) {
      cash += freshFunding;
      totalFreshFunding += freshFunding;
      cashFlows.push({ date, amount: -freshFunding });
    }
    cash -= ticketAmount;
    totalPurchased += ticketAmount;
    lastPurchaseDate = date;
    const holding = { trade, invested: ticketAmount, closed: false, proceeds: null };
    holdings.push(holding);
    purchases.push({
      date,
      symbol: trade.symbol,
      invested: ticketAmount,
      freshFunding,
      recycledCashUsed: ticketAmount - freshFunding,
      targetReturnPct: trade.targetReturnPct,
      exitDate: trade.exitDate,
      status: trade.status,
    });
    peakConcurrentPositions = Math.max(peakConcurrentPositions, holdings.filter((item) => !item.closed).length);
  }

  const openHoldings = holdings.filter((holding) => !holding.closed);
  const terminalDate = openHoldings.length ? finalDate : [lastPurchaseDate, lastExitDate].sort().at(-1);
  let terminalValue = cash;
  for (const holding of openHoldings) {
    const netReturnPct = holding.trade.grossReturnPct - executionHaircutPct;
    terminalValue += holding.invested * (1 + netReturnPct / 100);
  }
  cashFlows.push({ date: terminalDate, amount: terminalValue });
  const annualized = xirr(cashFlows);
  return {
    startDate,
    fundingEndExclusive,
    terminalDate,
    ticketAmount,
    purchases: purchases.length,
    targetExits: holdings.filter((holding) => holding.closed).length,
    openPositions: openHoldings.length,
    peakConcurrentPositions,
    peakInvested: peakConcurrentPositions * ticketAmount,
    totalPurchased,
    totalFreshFunding,
    recycledCashUsed: totalPurchased - totalFreshFunding,
    recyclingCoveragePct: totalPurchased ? ((totalPurchased - totalFreshFunding) / totalPurchased) * 100 : null,
    terminalValue,
    profit: terminalValue - totalFreshFunding,
    totalReturnPct: totalFreshFunding ? ((terminalValue / totalFreshFunding) - 1) * 100 : null,
    xirrPct: annualized === null ? null : annualized * 100,
    purchaseLedger: purchases,
  };
}

export function runRollingFixedTicketPrograms({
  sessions,
  targetSweep,
  fundingMonths = 3,
  ticketAmount = 15_000,
  executionHaircutsPct = [0, 0.25, 0.5],
}) {
  const starts = monthlyProgramStarts(sessions, fundingMonths);
  return targetSweep.map((target) => {
    const scenarios = Object.fromEntries(executionHaircutsPct.map((haircut) => {
      const programs = starts.map((startDate) => simulateFixedTicketProgram({
        sessions,
        trades: target.trades,
        startDate,
        fundingMonths,
        ticketAmount,
        executionHaircutPct: haircut,
      }));
      const xirrValues = programs.map((program) => program.xirrPct).filter(Number.isFinite);
      const returnValues = programs.map((program) => program.totalReturnPct).filter(Number.isFinite);
      return [String(haircut), {
        programs,
        summary: {
          cohorts: programs.length,
          medianXirrPct: percentile(xirrValues, 0.5),
          p25XirrPct: percentile(xirrValues, 0.25),
          p75XirrPct: percentile(xirrValues, 0.75),
          worstXirrPct: xirrValues.length ? Math.min(...xirrValues) : null,
          bestXirrPct: xirrValues.length ? Math.max(...xirrValues) : null,
          medianTotalReturnPct: percentile(returnValues, 0.5),
          medianFreshFunding: percentile(programs.map((program) => program.totalFreshFunding), 0.5),
          medianTotalPurchased: percentile(programs.map((program) => program.totalPurchased), 0.5),
          medianTerminalValue: percentile(programs.map((program) => program.terminalValue), 0.5),
          medianPurchases: percentile(programs.map((program) => program.purchases), 0.5),
          medianOpenPositions: percentile(programs.map((program) => program.openPositions), 0.5),
          medianPeakInvested: percentile(programs.map((program) => program.peakInvested), 0.5),
          medianRecyclingCoveragePct: percentile(programs.map((program) => program.recyclingCoveragePct), 0.5),
        },
      }];
    }));
    return { targetReturnPct: target.targetReturnPct, scenarios };
  });
}
