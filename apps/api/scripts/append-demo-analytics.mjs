/**
 * Append the leadership demo analytics (Потолки Столицы and Северный Потолок)
 * to the server store. Does not read or write platform-v2.json, users, objects, or passwords.
 *
 * Usage: node apps/api/scripts/append-demo-analytics.mjs
 * Env: API_BASE (gateway URL)
 */
import { buildDemoAnalyticsEvents } from '../demoSeed.js';

const API_BASE = (
  process.env.API_BASE ||
  process.env.VITE_API_URL ||
  'https://d5dff69141o8r1ehqm09.l5v6loqa.apigw.yandexcloud.net'
).replace(/\/$/, '');

const events = buildDemoAnalyticsEvents();
const batchSize = 80;

async function postBatch(batch) {
  const res = await fetch(`${API_BASE}/analytics/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: batch }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`append failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log('API', API_BASE, 'events', events.length);
  let accepted = 0;
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const body = await postBatch(batch);
    accepted += Number(body.accepted) || 0;
    console.log('batch', i, 'accepted', body.accepted);
  }
  console.log(JSON.stringify({ ok: true, posted: events.length, accepted }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
