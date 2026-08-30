import crypto from 'node:crypto';
import fs from 'node:fs';

const ACCESS_URL = 'https://api.groww.in/v1/token/api/access';

function decodeBase32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(input).replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
  let bits = '';
  for (const char of normalized) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('GROWW_TOTP_SECRET is not valid Base32');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotp(secret, nowMs = Date.now()) {
  const counter = Math.floor(nowMs / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export async function resolveGrowwAccessToken(env = process.env, fetchImpl = fetch, options = {}) {
  const manual = env.GROWW_ACCESS_TOKEN?.trim();
  const apiKey = env.GROWW_TOTP_TOKEN?.trim();
  const secret = env.GROWW_TOTP_SECRET?.trim();
  const preferTotp = env.GROWW_PREFER_TOTP === 'true';

  if (!preferTotp && manual) return { token: manual, source: 'manual' };
  if (!apiKey && !secret && manual) return { token: manual, source: 'manual' };
  if (Boolean(apiKey) !== Boolean(secret)) {
    throw new Error('TOTP configuration is incomplete; both GROWW_TOTP_TOKEN and GROWW_TOTP_SECRET are required.');
  }
  if (!apiKey || !secret) {
    throw new Error('GROWW_ACCESS_TOKEN is missing. Optional TOTP fallback requires both GROWW_TOTP_TOKEN and GROWW_TOTP_SECRET.');
  }

  const maxAttempts = options.maxAttempts ?? 6;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(ACCESS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ key_type: 'totp', totp: generateTotp(secret) }),
    });
    const body = await response.json().catch(() => ({}));
    const token = body?.token ?? body?.payload?.token;
    if (response.ok && token) return { token, source: 'totp' };
    if (response.status !== 429 || attempt === maxAttempts) {
      throw new Error(`Groww TOTP access-token request failed (${response.status}): ${body?.error?.message || body?.message || 'unknown error'}`);
    }
    const retryAfterSeconds = Number(response.headers?.get?.('retry-after'));
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1_000
      : Math.min(15_000 * attempt, 60_000);
    console.warn(`Groww TOTP rate limited; retrying in ${Math.ceil(delayMs / 1_000)}s (attempt ${attempt + 1}/${maxAttempts})`);
    await sleep(delayMs);
  }
  throw new Error('Groww TOTP access-token request exhausted retries');
}

async function main() {
  const { token, source } = await resolveGrowwAccessToken();
  console.log(`::add-mask::${token}`);
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) throw new Error('GITHUB_ENV is unavailable; run this resolver inside GitHub Actions');
  fs.appendFileSync(githubEnv, `GROWW_ACCESS_TOKEN=${token}\n`, { encoding: 'utf8' });
  console.log(`Groww authentication source: ${source}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
