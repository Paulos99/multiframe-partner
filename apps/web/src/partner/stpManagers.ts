/**
 * Менеджеры StP: создаёт и ведёт только администратор StP.
 * С сервером — через /admin/stp-managers; без сервера (локальный режим) — в локальном хранилище.
 */
import { STP_MANAGER_ROLE, STP_ORG_ID, STP_ORG_NAME } from '../../../../packages/shared/rolePermissions.js';
import { normalizeOrgSettings } from '../../../../packages/shared/partner';
import { apiAdminResetPassword, hasRemoteApi, request } from './apiClient';
import { loadDb, loadSession, loadToken, saveDb } from './localStore';

export type StpManagerRow = {
  id: string;
  login: string;
  displayName: string;
  createdAt: string;
  lastLogin: string | null;
};

function talksToServer(): boolean {
  return hasRemoteApi() && Boolean(loadToken());
}

function needAdmin(): void {
  if (loadSession()?.role !== 'admin') throw new Error('Только администратор');
}

export async function listStpManagers(): Promise<StpManagerRow[]> {
  if (talksToServer()) {
    const data = await request<{ managers: StpManagerRow[] }>('/admin/stp-managers');
    return data.managers || [];
  }
  needAdmin();
  return loadDb()
    .users.filter((u) => u.role === STP_MANAGER_ROLE)
    .map((u) => ({
      id: u.id,
      login: u.login,
      displayName: u.displayName,
      createdAt: u.createdAt,
      lastLogin: null,
    }));
}

export async function createStpManager(input: {
  login: string;
  password: string;
  displayName: string;
}): Promise<{ login: string; password: string }> {
  const login = input.login.trim();
  const password = input.password.trim();
  const displayName = input.displayName.trim() || login;
  if (!login || !password) throw new Error('Укажите логин и пароль');
  if (talksToServer()) {
    const res = await request<{ login: string; password: string }>('/admin/stp-managers', {
      method: 'POST',
      body: JSON.stringify({ login, password, displayName }),
    });
    return { login: res.login, password: res.password };
  }
  needAdmin();
  const db = loadDb();
  if (db.users.some((u) => u.login === login)) throw new Error('Такой логин уже есть');
  const now = new Date().toISOString();
  const orgs = db.orgs.some((o) => o.id === STP_ORG_ID)
    ? db.orgs
    : [
        ...db.orgs,
        {
          id: STP_ORG_ID,
          createdAt: now,
          createdBy: loadSession()?.id || 'u_admin',
          settings: normalizeOrgSettings({ companyName: STP_ORG_NAME, city: '' }),
        },
      ];
  saveDb({
    ...db,
    orgs,
    users: [
      ...db.users,
      {
        id: `u_${Math.random().toString(36).slice(2, 10)}`,
        login,
        password,
        role: STP_MANAGER_ROLE,
        displayName,
        orgId: STP_ORG_ID,
        createdAt: now,
      },
    ],
  });
  return { login, password };
}

export async function resetStpManagerPassword(id: string, password: string): Promise<string> {
  if (talksToServer()) return apiAdminResetPassword(id, password);
  needAdmin();
  const db = loadDb();
  if (!db.users.some((u) => u.id === id && u.role === STP_MANAGER_ROLE)) {
    throw new Error('Менеджер не найден');
  }
  saveDb({ ...db, users: db.users.map((u) => (u.id === id ? { ...u, password } : u)) });
  return password;
}

export async function deleteStpManager(id: string): Promise<void> {
  if (talksToServer()) {
    await request(`/admin/stp-managers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return;
  }
  needAdmin();
  const db = loadDb();
  if (!db.users.some((u) => u.id === id && u.role === STP_MANAGER_ROLE)) {
    throw new Error('Менеджер не найден');
  }
  saveDb({ ...db, users: db.users.filter((u) => u.id !== id) });
}
