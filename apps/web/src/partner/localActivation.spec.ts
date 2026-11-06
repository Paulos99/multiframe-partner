import { beforeEach, expect, test, vi } from 'vitest';
import { activateLocal, issueLocalActivation } from './localActivation';
import { createStaffAccount, localLogin, saveDb } from './localStore';

const memory = new Map<string, string>();
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
});

test('локальная ссылка: создаёт сотрудника без пароля, активирует логин и пароль, занятый логин — ошибка', () => {
  const owner = {
    id: 'u_owner',
    login: 'owner1',
    password: 'owner-pass-99',
    role: 'owner' as const,
    displayName: 'Владелец',
    orgId: 'org1',
    createdAt: '2026-01-01T00:00:00Z',
  };
  saveDb({
    users: [owner],
    orgs: [
      {
        id: 'org1',
        settings: {
          companyName: 'Тест',
          city: 'Москва',
          panelPriceRub: 1,
          pricePerM2: 1,
          installPricePerM2: null,
          dowelsPerPanel: 2,
          dowelPriceRub: null,
        },
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'u_owner',
      },
    ],
    links: [],
    activity: [],
    objects: [],
  });
  const created = createStaffAccount({
    login: '',
    password: '',
    displayName: 'Иван',
    role: 'sales',
    owner: { ...owner, org: null },
  });
  expect(created.user.pendingActivation).toBe(true);
  expect(created.password).toBe('');
  const link = issueLocalActivation(created.user.id);
  expect(link.path).toMatch(/^\?activate=[a-f0-9]{64}$/);
  const token = link.path.slice('?activate='.length);
  expect(() => localLogin(created.user.login, 'anything')).toThrow(/активируйте/i);
  activateLocal(token, 'good-password-1', 'ivan.sales');
  const session = localLogin('ivan.sales', 'good-password-1');
  expect(session.displayName).toBe('Иван');
  expect(() => activateLocal(token, 'good-password-1', 'other')).toThrow(/недействительна|истёк/i);
  const again = createStaffAccount({
    login: '',
    password: '',
    displayName: 'Пётр',
    role: 'crew',
    owner: { ...owner, org: null },
  });
  const link2 = issueLocalActivation(again.user.id);
  const token2 = link2.path.slice('?activate='.length);
  expect(() => activateLocal(token2, 'good-password-1', 'ivan.sales')).toThrow(/уже есть/);
});
