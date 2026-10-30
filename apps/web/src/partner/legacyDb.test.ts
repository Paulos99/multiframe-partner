import assert from 'node:assert/strict';
import test from 'node:test';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

test('v4 с кликом проблемомера переезжает в v5, а не заменяется сидом', async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  const legacy = {
    users: [
      {
        id: 'u_partner1',
        login: 'partner1',
        password: 'x',
        role: 'owner',
        displayName: 'Владелец',
        orgId: 'org_demo',
        createdAt: '2026-10-19T00:00:00.000Z',
      },
    ],
    orgs: [
      {
        id: 'org_demo',
        createdAt: '2026-10-19T00:00:00.000Z',
        createdBy: 'u_partner1',
        settings: { companyName: 'Потолки Столицы', city: 'Москва' },
      },
    ],
    links: [],
    activity: [],
    projects: [
      {
        id: 'prj_clicked',
        orgId: 'org_demo',
        name: 'Клиент',
        createdAt: '2026-10-27T00:00:00.000Z',
        updatedAt: '2026-10-27T00:00:00.000Z',
        createdBy: 'u_partner1',
      },
    ],
    objects: [
      {
        id: 'obj_clicked',
        orgId: 'org_demo',
        status: 'install',
        assignedTo: null,
        projectId: 'prj_clicked',
        roomName: 'Кухня',
        updatedAt: '2026-10-27T00:00:00.000Z',
        createdAt: '2026-10-27T00:00:00.000Z',
        createdBy: 'u_partner1',
        room: { areaM2: 18 },
        estimate: { panels: 12 },
        history: [{ at: '2026-10-27T00:00:00.000Z', userId: 'u_partner1', login: 'partner1', action: 'status', detail: 'measured→install' }],
      },
    ],
  };
  storage.setItem('mf_partner_db_v4', JSON.stringify(legacy));
  const { loadDb } = await import('./localStore');
  const db = loadDb();
  assert.equal(db.objects.some((object) => object.id === 'obj_clicked'), true);
  assert.equal((db.projects || []).some((project) => project.id === 'prj_clicked'), true);
  assert.equal(db.orgs.some((org) => org.id === 'org_demo_spb'), false);
  assert.equal(db.orgs.some((org) => org.id === 'org_demo'), true);
  assert.equal(storage.getItem('mf_partner_db_v4'), null);
  assert.ok(storage.getItem('mf_partner_db_v5'));
});

test('сохранённая база с «Северным Потолком» очищается: остаётся одна демо-компания', async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  const { buildLocalDemoUsers, buildLocalDemoOrgs, buildLocalDemoObjects } = await import('./demoSeed');
  const users = buildLocalDemoUsers();
  const orgs = buildLocalDemoOrgs();
  const objects = buildLocalDemoObjects();
  const north = {
    id: 'org_demo_spb',
    createdAt: '2026-10-19T00:00:00.000Z',
    createdBy: 'u_admin',
    settings: { companyName: 'Северный Потолок', city: 'Санкт-Петербург' },
  };
  const stored = {
    users: [
      ...users,
      { id: 'u_partner2', login: 'partner2', password: 'x', role: 'owner', displayName: 'Ольга', orgId: 'org_demo_spb', createdAt: '2026-10-19T00:00:00.000Z' },
    ],
    orgs: [...orgs, north],
    links: [],
    activity: [{ id: 'a1', at: '2026-10-20T00:00:00.000Z', orgId: 'org_demo_spb', userId: 'u_partner2', login: 'partner2', action: 'login' }],
    objects: [...objects, { ...objects[0], id: 'obj_b01', orgId: 'org_demo_spb' }],
    projects: [],
  };
  storage.setItem('mf_partner_db_v5', JSON.stringify(stored));
  storage.setItem(
    'mf_partner_analytics_v1',
    JSON.stringify([
      { id: 'e1', orgId: 'org_demo', companyName: 'Потолки Столицы' },
      { id: 'e2', orgId: 'org_demo_spb', companyName: 'Северный Потолок' },
    ]),
  );
  storage.setItem('mf_partner_session_v2', JSON.stringify({ id: 'u_partner2', login: 'partner2', role: 'owner', orgId: 'org_demo_spb' }));
  const store = await import('./localStore');
  const db = store.loadDb();
  assert.deepEqual(db.orgs.map((org) => org.id).sort(), ['org_demo', 'org_stp']);
  assert.equal(db.users.some((user) => user.orgId === 'org_demo_spb'), false);
  assert.equal(db.objects.some((object) => object.orgId === 'org_demo_spb'), false);
  assert.equal(db.activity.length, 0);
  assert.deepEqual(store.loadAnalyticsEvents().map((event) => event.id), ['e1']);
  assert.equal(store.loadSession(), null);
});

test('демо-данные: одна компания во всех выдачах', async () => {
  const { DEMO_ACCOUNTS, buildLocalDemoUsers, buildLocalDemoOrgs, buildLocalDemoObjects, buildLocalDemoAnalytics } =
    await import('./demoSeed');
  const companies = new Set(DEMO_ACCOUNTS.filter((account) => account.role !== 'admin' && account.role !== 'stp_manager').map((a) => a.company));
  assert.deepEqual([...companies], ['Потолки Столицы']);
  assert.deepEqual(buildLocalDemoOrgs().map((org) => org.id), ['org_stp', 'org_demo']);
  assert.equal(buildLocalDemoUsers().some((user) => user.orgId === 'org_demo_spb'), false);
  assert.equal(buildLocalDemoObjects().every((object) => object.orgId === 'org_demo'), true);
  const events = buildLocalDemoAnalytics();
  assert.equal(events.some((event) => event.orgId === 'org_demo_spb' || event.companyName === 'Северный Потолок'), false);
  assert.ok(events.length > 100);
});
