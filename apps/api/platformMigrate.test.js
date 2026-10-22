import assert from 'node:assert/strict';
import test from 'node:test';
import { filterCombatEvents, migratePlatform } from './platformMigrate.js';
import { assertSameOrg, mergeAssignments, objectVisibleWithAssignments } from './routes/objects.js';
import { eventsForDashboard } from './routes/analytics.js';

test('migratePlatform добавляет коллекции и assignments без удаления objects', () => {
  const platform = {
    version: 2,
    users: [],
    orgs: [],
    objects: [
      {
        id: 'obj1',
        orgId: 'org_a',
        assignedTo: 'u_meas',
        status: 'draft',
      },
    ],
    activity: [],
  };
  const next = migratePlatform(platform);
  assert.ok(Array.isArray(next.deals));
  assert.ok(Array.isArray(next.quoteRevisions));
  assert.ok(Array.isArray(next.learningAttempts));
  assert.ok(Array.isArray(next.supportCases));
  assert.ok(Array.isArray(next.interventions));
  assert.equal(next.objects[0].id, 'obj1');
  assert.equal(next.objects[0].assignments.measurerUserId, 'u_meas');
  assert.equal(next.objects[0].assignedTo, 'u_meas');
  assert.ok(next.version >= 3);
});

test('чужая orgId недоступна', () => {
  const user = { role: 'sales', orgId: 'org_a', id: 'u1' };
  assert.equal(assertSameOrg(user, 'org_a'), true);
  assert.equal(assertSameOrg(user, 'org_b'), false);
  const obj = { orgId: 'org_b', assignedTo: 'u1', assignments: {} };
  assert.equal(objectVisibleWithAssignments(user, obj), false);
});

test('учебные события не попадают в боевой dashboard', () => {
  const events = [
    { id: '1', context: 'work', action: 'open', tool: 'calculator' },
    { id: '2', context: 'training', action: 'open', tool: 'calculator' },
    { id: '3', context: 'demo', action: 'result', tool: 'problemomer' },
  ];
  const combat = eventsForDashboard(events);
  assert.equal(combat.length, 1);
  assert.equal(combat[0].id, '1');
  assert.equal(filterCombatEvents(events).length, 1);
});

test('mergeAssignments сохраняет независимых ответственных', () => {
  const existing = {
    assignments: { salesUserId: 's1', measurerUserId: 'm1', crewUserId: null },
  };
  const merged = mergeAssignments(
    { assignments: { crewUserId: 'c1' } },
    existing,
  );
  assert.deepEqual(merged, {
    salesUserId: 's1',
    measurerUserId: 'm1',
    crewUserId: 'c1',
  });
});
