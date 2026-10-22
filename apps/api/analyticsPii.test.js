import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-pii';
process.env.ANALYTICS_ADMIN_KEY = process.env.ANALYTICS_ADMIN_KEY || 'test-admin-key';

const { handler, resetPlatformMemoryForTests } = await import('./index.js');

function decode(res) {
  return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
}

test('analytics events strip client PII and pdf payloads', async () => {
  resetPlatformMemoryForTests();
  const login = await handler({
    httpMethod: 'POST',
    path: '/auth/login',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'sales1', password: 'exec1234' }),
  });
  const { token, user } = decode(login).body;
  const res = await handler({
    httpMethod: 'POST',
    path: '/analytics/events',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events: [
        {
          id: 'ae_pii_1',
          tool: 'calculator',
          action: 'calc_done',
          login: 'sales1',
          role: 'sales',
          orgId: user.orgId,
          userId: user.id,
          companyName: 'x',
          object: {
            areaM2: 12,
            clientName: 'Иван',
            clientPhone: '+7999',
            pdfBase64: 'AAA',
            label: 'ok',
          },
        },
      ],
    }),
  });
  assert.equal(decode(res).status, 200);

  const adminLogin = await handler({
    httpMethod: 'POST',
    path: '/auth/login',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', password: 'admin1234' }),
  });
  const adminToken = decode(adminLogin).body.token;
  const dash = await handler({
    httpMethod: 'GET',
    path: '/analytics/dashboard?journal=1',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'X-Analytics-Key': process.env.ANALYTICS_ADMIN_KEY,
    },
  });
  const body = decode(dash).body;
  const hit = (body.events || []).find((e) => e.id === 'ae_pii_1');
  assert.ok(hit, 'event stored');
  assert.equal(hit.object?.clientName, undefined);
  assert.equal(hit.object?.clientPhone, undefined);
  assert.equal(hit.object?.pdfBase64, undefined);
  assert.equal(hit.object?.areaM2, 12);
});
