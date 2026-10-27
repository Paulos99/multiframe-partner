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
  assert.equal(db.orgs.some((org) => org.id === 'org_demo_spb'), true);
  assert.equal(storage.getItem('mf_partner_db_v4'), null);
  assert.ok(storage.getItem('mf_partner_db_v5'));
});
