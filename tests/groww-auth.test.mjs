import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTotp, resolveGrowwAccessToken } from '../scripts/resolve-groww-token.mjs';

test('generates RFC 6238-compatible 6-digit TOTP', () => {
  // RFC 6238 SHA-1 secret: ASCII "12345678901234567890" in Base32.
  assert.equal(generateTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000), '287082');
});

test('manual Groww access token takes precedence by default', async () => {
  let called = false;
  const result = await resolveGrowwAccessToken({
    GROWW_ACCESS_TOKEN: 'manual-token',
    GROWW_TOTP_TOKEN: 'totp-api-key',
    GROWW_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  }, async () => {
    called = true;
    throw new Error('should not call Groww token endpoint');
  });
  assert.deepEqual(result, { token: 'manual-token', source: 'manual' });
  assert.equal(called, false);
});

test('TOTP is used when manual access token is absent', async () => {
  const result = await resolveGrowwAccessToken({
    GROWW_TOTP_TOKEN: 'totp-api-key',
    GROWW_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  }, async (url, options) => {
    assert.equal(url, 'https://api.groww.in/v1/token/api/access');
    assert.equal(options.headers.Authorization, 'Bearer totp-api-key');
    const body = JSON.parse(options.body);
    assert.equal(body.key_type, 'totp');
    assert.match(body.totp, /^\d{6}$/);
    return { ok: true, status: 200, json: async () => ({ token: 'generated-token' }) };
  });
  assert.deepEqual(result, { token: 'generated-token', source: 'totp' });
});

test('paper automation can prefer TOTP while keeping manual fallback until provisioning', async () => {
  const generated = await resolveGrowwAccessToken({
    GROWW_ACCESS_TOKEN: 'manual-token',
    GROWW_TOTP_TOKEN: 'totp-api-key',
    GROWW_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    GROWW_PREFER_TOTP: 'true',
  }, async () => ({ ok: true, status: 200, json: async () => ({ token: 'generated-token' }) }));
  assert.deepEqual(generated, { token: 'generated-token', source: 'totp' });

  const fallback = await resolveGrowwAccessToken({
    GROWW_ACCESS_TOKEN: 'manual-token',
    GROWW_PREFER_TOTP: 'true',
  }, async () => { throw new Error('should not call Groww token endpoint'); });
  assert.deepEqual(fallback, { token: 'manual-token', source: 'manual' });
});
