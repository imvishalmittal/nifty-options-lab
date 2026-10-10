import crypto from 'node:crypto';
import fs from 'node:fs';

const apiKey = process.env.GROWW_TOTP_API_KEY;
const totpSecret = process.env.GROWW_TOTP_SECRET;
if (!apiKey || !totpSecret) {
  console.error('Missing GROWW_TOTP_API_KEY or GROWW_TOTP_SECRET. Add both as GitHub Actions secrets to enable automatic daily token generation.');
  process.exit(2);
}

function decodeBase32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = '';
  for (const ch of normalized) {
    const value = alphabet.indexOf(ch);
    if (value < 0) throw new Error('GROWW_TOTP_SECRET is not valid Base32.');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function currentTotp(secret) {
  const counter = BigInt(Math.floor(Date.now() / 1000 / 30));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

const response = await fetch('https://api.groww.in/v1/token/api/access', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify({ key_type: 'totp', totp: currentTotp(totpSecret) }),
});
const body = await response.json().catch(() => ({}));
const token = body.token ?? body.payload?.token;
if (!response.ok || !token) {
  console.error(`Groww token generation failed (HTTP ${response.status}). Check the API key/TOTP secrets and whether daily approval is required in Groww Cloud API Keys. Response: ${JSON.stringify(body).slice(0, 700)}`);
  process.exit(1);
}

// Append the token only to the Actions environment file; never print it to logs.
if (!process.env.GITHUB_ENV) {
  console.error('GITHUB_ENV is unavailable; run this script inside GitHub Actions.');
  process.exit(2);
}
fs.appendFileSync(process.env.GITHUB_ENV, `GROWW_ACCESS_TOKEN=${token.replace(/\r|\n/g, '')}\n`, { mode: 0o600 });
console.log('Fresh Groww access token generated successfully; token value withheld from logs.');
