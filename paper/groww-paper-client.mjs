import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { timeOf } from './paper-engine.mjs';

const BASE_URL = 'https://api.groww.in/v1';
const DEFAULT_CACHE_DIR = '/tmp/nifty-paper-groww-cache';
const DEFAULT_LOCK_DIR = '/tmp/nifty-paper-groww-api-lock';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function indiaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export function normalizeTimestamp(value) {
  const text = String(value).replace(' ', 'T');
  return /([zZ]|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}+05:30`;
}

export function normalizeCandles(raw = []) {
  const fragments = raw.map((c) => ({
    timestamp: normalizeTimestamp(c[0]), open: Number(c[1]), high: Number(c[2]),
    low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] ?? 0),
  })).filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite));
  const merged = new Map();
  for (const candle of fragments) {
    const previous = merged.get(candle.timestamp);
    merged.set(candle.timestamp, previous ? {
      timestamp: candle.timestamp,
      open: previous.open,
      high: Math.max(previous.high, candle.high),
      low: Math.min(previous.low, candle.low),
      close: candle.close,
      volume: Math.max(previous.volume, candle.volume),
    } : candle);
  }
  return [...merged.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function completedCandles(candles, currentClock) {
  return candles.filter((candle) => {
    const clock = timeOf(candle.timestamp);
    return clock && clock < currentClock;
  });
}

export function candleAt(candles, clock) {
  return candles.find((candle) => timeOf(candle.timestamp) === clock) ?? null;
}

function cacheKey(endpoint, params) {
  return crypto.createHash('sha256').update(JSON.stringify([endpoint, Object.entries(params).sort()])).digest('hex');
}

function cacheTtl(endpoint) {
  if (endpoint === '/historical/expiries' || endpoint === '/historical/contracts') return 300_000;
  if (endpoint === '/historical/candles') return 10_000;
  return 0;
}

function readCache(cacheDir, endpoint, params) {
  const ttl = cacheTtl(endpoint);
  if (!ttl) return null;
  const file = path.join(cacheDir, `${cacheKey(endpoint, params)}.json`);
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > ttl) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(cacheDir, endpoint, params, payload) {
  if (!cacheTtl(endpoint)) return;
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `${cacheKey(endpoint, params)}.json`);
  fs.writeFileSync(file, JSON.stringify(payload));
}

async function acquireSharedThrottle({ spacingMs, lockDir }) {
  const stamp = `${lockDir}.last`;
  const startedAt = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      const last = Number(fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8') : 0);
      const wait = Math.max(0, spacingMs - (Date.now() - last));
      if (wait) await sleep(wait);
      return () => {
        fs.writeFileSync(stamp, String(Date.now()));
        fs.rmdirSync(lockDir);
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - fs.statSync(lockDir).mtimeMs > 120_000) fs.rmdirSync(lockDir);
      } catch (cleanupError) {
        if (!['ENOENT', 'ENOTEMPTY'].includes(cleanupError?.code)) throw cleanupError;
      }
      if (Date.now() - startedAt > 180_000) throw new Error('Timed out waiting for shared Groww API throttle lock');
      await sleep(50);
    }
  }
}

export function createGrowwPaperClient({
  token,
  spacingMs = Number(process.env.GROWW_REQUEST_SPACING_MS || 1500),
  cacheDir = process.env.GROWW_PAPER_CACHE_DIR || DEFAULT_CACHE_DIR,
  lockDir = process.env.GROWW_PAPER_LOCK_DIR || DEFAULT_LOCK_DIR,
  fetchImpl = fetch,
} = {}) {
  if (!token) throw new Error('GROWW_ACCESS_TOKEN is required');

  async function apiGet(endpoint, params, maxRetries = 6) {
    const cached = readCache(cacheDir, endpoint, params);
    if (cached) return cached;
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const release = await acquireSharedThrottle({ spacingMs, lockDir });
      let response;
      let body;
      try {
        const refreshed = readCache(cacheDir, endpoint, params);
        if (refreshed) return refreshed;
        response = await fetchImpl(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-API-VERSION': '1.0' } });
        body = await response.json().catch(() => ({}));
      } finally {
        release();
      }
      if (response.ok && body.status !== 'FAILURE') {
        const payload = body.payload ?? body;
        writeCache(cacheDir, endpoint, params, payload);
        return payload;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        await sleep(Math.min(5000 * (2 ** attempt), 60000));
        continue;
      }
      throw new Error(`Groww ${endpoint} failed (${response.status}): ${body?.error?.message || body?.message || JSON.stringify(body)}`);
    }
    throw new Error(`Groww ${endpoint} exhausted retries`);
  }

  async function fetchCandles(segment, symbol, date, startClock, endClock) {
    const payload = await apiGet('/historical/candles', {
      exchange: 'NSE', segment, groww_symbol: symbol,
      start_time: `${date} ${startClock}:00`, end_time: `${date} ${endClock}:00`, candle_interval: '1minute',
    });
    return normalizeCandles(payload.candles ?? []);
  }

  return { apiGet, fetchCandles };
}

export async function waitUntil(clock, now = () => indiaParts().time) {
  while (now() < clock) await sleep(15_000);
}

export { sleep };
