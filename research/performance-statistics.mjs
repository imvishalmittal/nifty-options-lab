function numeric(values) {
  return values.map(Number).filter(Number.isFinite);
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function maxDrawdown(values) {
  const series = numeric(values);
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let peakIndex = -1;
  let troughIndex = -1;
  let currentPeakIndex = -1;
  for (let i = 0; i < series.length; i++) {
    equity += series[i];
    if (equity > peak) {
      peak = equity;
      currentPeakIndex = i;
    }
    const drawdown = peak - equity;
    if (drawdown > maxDd) {
      maxDd = drawdown;
      peakIndex = currentPeakIndex;
      troughIndex = i;
    }
  }
  return { maxDrawdown: maxDd, peakIndex, troughIndex };
}

export function longestLosingStreak(values) {
  const series = numeric(values);
  let current = 0;
  let longest = 0;
  let currentLoss = 0;
  let worstStreakLoss = 0;
  for (const value of series) {
    if (value < 0) {
      current += 1;
      currentLoss += value;
      if (current > longest) longest = current;
      if (currentLoss < worstStreakLoss) worstStreakLoss = currentLoss;
    } else {
      current = 0;
      currentLoss = 0;
    }
  }
  return { longestLosingStreak: longest, worstStreakLoss };
}

export function summarizePerformance(values) {
  const series = numeric(values);
  if (!series.length) {
    return {
      count: 0, total: 0, mean: null, median: null, winRate: null,
      positiveSum: 0, negativeSum: 0, profitFactor: null,
      best: null, worst: null, maxDrawdown: 0,
      longestLosingStreak: 0, worstStreakLoss: 0,
      top10PctPositiveContribution: null,
    };
  }
  const positive = series.filter((v) => v > 0);
  const negative = series.filter((v) => v < 0);
  const positiveSum = positive.reduce((a, b) => a + b, 0);
  const negativeSum = negative.reduce((a, b) => a + b, 0);
  const topCount = Math.max(1, Math.ceil(series.length * 0.10));
  const topPositive = [...positive].sort((a, b) => b - a).slice(0, topCount).reduce((a, b) => a + b, 0);
  const dd = maxDrawdown(series);
  const streak = longestLosingStreak(series);
  return {
    count: series.length,
    total: series.reduce((a, b) => a + b, 0),
    mean: mean(series),
    median: median(series),
    winRate: positive.length / series.length,
    positiveSum,
    negativeSum,
    profitFactor: negativeSum < 0 ? positiveSum / Math.abs(negativeSum) : (positiveSum > 0 ? Infinity : null),
    best: Math.max(...series),
    worst: Math.min(...series),
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownPeakIndex: dd.peakIndex,
    maxDrawdownTroughIndex: dd.troughIndex,
    longestLosingStreak: streak.longestLosingStreak,
    worstStreakLoss: streak.worstStreakLoss,
    top10PctPositiveContribution: positiveSum > 0 ? topPositive / positiveSum : null,
  };
}

export function clusterBootstrapMean(items, {
  value = (item) => item,
  cluster = (_item, index) => index,
  samples = 5000,
  seed = 20260816,
  confidence = 0.95,
} = {}) {
  if (!(samples > 0)) throw new Error('samples must be positive');
  if (!(confidence > 0 && confidence < 1)) throw new Error('confidence must be between 0 and 1');

  const groups = new Map();
  items.forEach((item, index) => {
    const key = cluster(item, index);
    const v = Number(value(item));
    if (!Number.isFinite(v)) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  });
  const clusters = [...groups.values()].filter((g) => g.length);
  if (!clusters.length) return { clusters: 0, observations: 0, mean: null, lower: null, upper: null, confidence, samples };

  const observations = clusters.flat();
  const pointMean = mean(observations);
  const rng = mulberry32(seed);
  const bootstrapMeans = [];
  for (let s = 0; s < samples; s++) {
    let total = 0;
    let count = 0;
    for (let i = 0; i < clusters.length; i++) {
      const picked = clusters[Math.floor(rng() * clusters.length)];
      total += picked.reduce((a, b) => a + b, 0);
      count += picked.length;
    }
    bootstrapMeans.push(total / count);
  }
  const alpha = (1 - confidence) / 2;
  return {
    clusters: clusters.length,
    observations: observations.length,
    mean: pointMean,
    lower: quantile(bootstrapMeans, alpha),
    upper: quantile(bootstrapMeans, 1 - alpha),
    confidence,
    samples,
  };
}

export function robustnessReport(items, {
  value = (item) => item,
  cluster = (_item, index) => index,
  bootstrapSamples = 5000,
  seed = 20260816,
} = {}) {
  const values = items.map(value);
  return {
    performance: summarizePerformance(values),
    clusteredMeanConfidence: clusterBootstrapMean(items, {
      value,
      cluster,
      samples: bootstrapSamples,
      seed,
    }),
  };
}
