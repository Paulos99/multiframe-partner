/**
 * Wipe remote platform + analytics and load leadership demo seed.
 * Usage: node apps/api/scripts/reset-and-seed-demo.mjs
 * Env: API_BASE (gateway URL), ADMIN_LOGIN, ADMIN_PASSWORD
 */
const API_BASE = (
  process.env.API_BASE ||
  process.env.VITE_API_URL ||
  'https://d5dff69141o8r1ehqm09.l5v6loqa.apigw.yandexcloud.net'
).replace(/\/$/, '');
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

async function main() {
  console.log('API', API_BASE);
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: ADMIN_LOGIN, password: ADMIN_PASSWORD }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    throw new Error(`login failed ${loginRes.status}: ${JSON.stringify(loginBody)}`);
  }
  const token = loginBody.token;
  if (!token) throw new Error('no token in login response');

  const resetRes = await fetch(`${API_BASE}/admin/demo/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: '{}',
  });
  const resetBody = await resetRes.json().catch(() => ({}));
  if (!resetRes.ok) {
    throw new Error(`reset failed ${resetRes.status}: ${JSON.stringify(resetBody)}`);
  }
  console.log('Demo seed applied:', resetBody);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
