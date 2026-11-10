import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// Кабинет с сервером (как боевой partner.stp-multiframe.ru): демо-сид браузера в аналитику не попадает.
const memory = new Map<string, string>();
const DEMO_NAMES = /Крылова|Лебедев|Орлов|Волков|Соколов/;

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
  });
  vi.stubGlobal('window', { location: { search: '' } });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function load(apiUrl: string) {
  vi.stubEnv('VITE_API_URL', apiUrl);
  const store = await import('./localStore');
  // Демо-база браузера уже лежит на устройстве (её создаёт первый же loadDb).
  store.loadDb();
  const analytics = await import('./analytics');
  return { store, analytics };
}

const admin = { id: 'u_admin', login: 'admin', displayName: 'Администратор', role: 'admin', orgId: null };

test('с сервером: пустая сеть — ни демо-людей, ни демо-комнат, ни демо-событий', async () => {
  const { analytics } = await load('https://partner.example/cabinet-api');
  expect(analytics.localDemoAllowed()).toBe(false);
  expect(await analytics.loadSharedAnalyticsEvents(null)).toEqual([]);
  expect(analytics.resolveCompanyRooms([], null)).toEqual([]);
  const { dash, drill } = analytics.composeCabinetAnalytics({
    events: [],
    objects: [],
    projects: [],
    users: [admin],
    mode: 'admin',
    orgId: null,
  });
  expect(drill.ranking).toEqual([]);
  expect(JSON.stringify(drill)).not.toMatch(DEMO_NAMES);
  expect(dash.kpi.executors).toBe(0);
  expect(dash.kpi.partners).toBe(0);
});

test('с сервером: в рейтинге только сотрудники, которых прислал сервер', async () => {
  const { analytics } = await load('https://partner.example/cabinet-api');
  const real = { id: 'u_real_sales', login: 'm1', displayName: 'Мария Иванова', role: 'sales', orgId: 'org_real' };
  const { drill } = analytics.composeCabinetAnalytics({
    events: [],
    objects: [],
    projects: [],
    users: [admin, real],
    mode: 'admin',
    orgId: null,
  });
  const names = drill.ranking.map((row) => row.displayName).join('|');
  expect(names).not.toMatch(DEMO_NAMES);
  expect(drill.ranking.every((row) => row.userId === 'u_real_sales')).toBe(true);
});

test('без сервера (демо-сборка) демо-компания по-прежнему на месте', async () => {
  const { analytics } = await load('');
  expect(analytics.localDemoAllowed()).toBe(true);
  const { drill } = analytics.composeCabinetAnalytics({ events: [], mode: 'admin', orgId: null });
  expect(JSON.stringify(drill)).toMatch(DEMO_NAMES);
});
