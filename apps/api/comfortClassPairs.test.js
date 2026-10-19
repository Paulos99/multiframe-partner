import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { buildDemoAnalyticsEvents, buildDemoPlatform, DEMO_CLASS_PAIRS } from './demoSeed.js';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-comfort-pairs-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
process.env.JWT_SECRET = 'comfort-class-pairs-test-only';
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
after(() => rmSync(dir, { recursive: true, force: true }));

const { aggregateAnalyticsDashboard } = await import('./index.js');

/** СП 51: А > Б > В > ниже В. MultiFrame may keep or raise the class, never lower it. */
const RANK = { below: 0, V: 1, B: 2, A: 3 };

function resultEvent(id, classBefore, classAfter) {
  return {
    id,
    at: new Date().toISOString(),
    orgId: 'org_x',
    userId: 'u_x',
    login: 'x',
    role: 'sales',
    companyName: 'X',
    tool: 'problemomer',
    action: 'result',
    object: { classBefore, classAfter },
  };
}

test('class transition key is «before→after», never swapped', () => {
  const dash = aggregateAnalyticsDashboard(
    [resultEvent('a', 'below', 'V'), resultEvent('b', 'below', 'V'), resultEvent('c', 'V', 'B')],
    { source: 'api', journalAll: true },
  );
  const keys = Object.fromEntries(dash.breakdowns.classTransition.map((r) => [r.key, r.count]));
  assert.deepEqual(keys, { 'below→V': 2, 'V→B': 1 });
});

test('demo pairs never lower the comfort class', () => {
  for (const [before, after] of DEMO_CLASS_PAIRS) {
    assert.ok(RANK[after] >= RANK[before], `${before}→${after}`);
  }
});

test('seeded analytics and objects never show MultiFrame lowering the class', () => {
  const events = buildDemoAnalyticsEvents();
  const results = events.filter((e) => e.tool === 'problemomer' && e.action === 'result');
  assert.ok(results.length > 0);
  for (const e of results) {
    const { classBefore, classAfter } = e.object;
    assert.ok(RANK[classAfter] >= RANK[classBefore], `${e.id}: ${classBefore}→${classAfter}`);
  }
  const dash = aggregateAnalyticsDashboard(events, { source: 'api', journalAll: true });
  for (const { key } of dash.breakdowns.classTransition) {
    const [b, a] = key.split('→');
    assert.ok(RANK[a] >= RANK[b], key);
  }
  for (const o of buildDemoPlatform().objects) {
    if (!o.room?.classBefore) continue;
    assert.ok(RANK[o.room.classAfter] >= RANK[o.room.classBefore], o.id);
  }
});
