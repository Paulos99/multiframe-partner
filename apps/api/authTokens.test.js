import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { SignJWT, decodeProtectedHeader } from 'jose';
import { signToken, verifyToken, keyId } from './authTokens.js';

const current = randomBytes(32).toString('hex');
const previous = randomBytes(32).toString('hex');
const foreign = randomBytes(32).toString('hex');
process.env.JWT_SECRET = current;
process.env.JWT_SECRET_PREVIOUS = previous;
delete process.env.PARTNERS_BUCKET;
delete process.env.PLATFORM_FILE;
const { handler } = await import('./index.js');
const user = { id: 'unit-user', login: 'unit', role: 'owner' };
const encode = (key) => new TextEncoder().encode(key);
const legacy = (key, exp = '12h', alg = 'HS256') => new SignJWT({ login: user.login })
  .setSubject(user.id).setIssuedAt().setExpirationTime(exp)
  .setProtectedHeader({ alg }).sign(encode(key));
const call = async (path, token, body) => {
  const response = await handler({ path, httpMethod: body ? 'POST' : 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.statusCode, body: JSON.parse(response.body) };
};

test('current and previous keys, legacy tokens, rejection and retirement', async () => {
  const token = await signToken(user);
  assert.equal(decodeProtectedHeader(token).kid, keyId(current));
  assert.equal((await verifyToken(token)).usedPreviousKey, false);
  assert.equal((await verifyToken(await legacy(current))).usedPreviousKey, false);
  assert.equal((await verifyToken(await legacy(previous))).usedPreviousKey, true);
  process.env.JWT_SECRET = previous;
  const old = await signToken(user);
  process.env.JWT_SECRET = current;
  assert.equal((await verifyToken(old)).usedPreviousKey, true);
  await assert.rejects(verifyToken(await legacy(foreign)), { status: 401 });
  await assert.rejects(verifyToken(await legacy(previous, '1 second ago')), { status: 401 });
  await assert.rejects(verifyToken(await legacy(current, '12h', 'HS384')), { status: 401 });
  const parts = token.split('.');
  parts[1] = Buffer.from(JSON.stringify({ sub: 'attacker', exp: 9999999999 })).toString('base64url');
  await assert.rejects(verifyToken(parts.join('.')), { status: 401 });
  delete process.env.JWT_SECRET_PREVIOUS;
  await assert.rejects(verifyToken(old), { status: 401 });
  assert.equal((await verifyToken(token)).usedPreviousKey, false);
  process.env.JWT_SECRET_PREVIOUS = previous;
});

test('/auth/me renews previous-key tokens only after authenticating the session', async () => {
  process.env.JWT_SECRET = previous;
  const login = await call('/auth/login', null, { login: 'partner1', password: 'demo1234' });
  assert.equal(login.status, 200);
  process.env.JWT_SECRET = current;
  const me = await call('/auth/me', login.body.token);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, login.body.user.id);
  assert.equal((await verifyToken(me.body.token)).usedPreviousKey, false);
  assert.equal((await call('/auth/me', me.body.token)).body.token, undefined);
  const claims = (await verifyToken(login.body.token)).payload;
  const oldLegacy = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(encode(previous));
  assert.ok((await call('/auth/me', oldLegacy)).body.token);
  const invalidSession = await new SignJWT({ ...claims, sessionVersion: 999 })
    .setProtectedHeader({ alg: 'HS256' }).sign(encode(previous));
  assert.equal((await call('/auth/me', invalidSession)).status, 401);
  const forged = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(encode(foreign));
  assert.equal((await call('/auth/me', forged)).status, 401);
});

test('missing current key fails closed', async () => {
  delete process.env.JWT_SECRET;
  await assert.rejects(signToken(user), /JWT_SECRET must be configured/);
  process.env.JWT_SECRET = current;
});
