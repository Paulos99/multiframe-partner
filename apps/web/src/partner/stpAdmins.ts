/**
 * Администраторы StP: создаёт и ведёт только администратор StP.
 * С сервером — через /admin/stp-admins; без сервера (локальный режим) — в локальном хранилище.
 */
import { hasRemoteApi, request } from './apiClient';
import { generatePassword, loadDb, loadSession, loadToken, saveDb } from './localStore';

export type StpAdminRow = {
  id: string;
  login: string;
  displayName: string;
  createdAt: string;
  lastLogin: string | null;
  loginDisabled?: boolean;
  pendingActivation?: boolean;
  isSelf?: boolean;
};

function talksToServer(): boolean {
  return hasRemoteApi() && Boolean(loadToken());
}

function needAdmin(): void {
  if (loadSession()?.role !== 'admin') throw new Error('Только администратор');
}

function localAdmins(selfId: string | undefined): StpAdminRow[] {
  return loadDb()
    .users.filter((u) => u.role === 'admin')
    .map((u) => ({
      id: u.id,
      login: u.login,
      displayName: u.displayName,
      createdAt: u.createdAt,
      lastLogin: null,
      loginDisabled: Boolean((u as { loginDisabled?: boolean }).loginDisabled),
      isSelf: selfId ? u.id === selfId : false,
    }));
}

export async function listStpAdmins(): Promise<StpAdminRow[]> {
  if (talksToServer()) {
    const data = await request<{ admins: StpAdminRow[] }>('/admin/stp-admins');
    return data.admins || [];
  }
  needAdmin();
  return localAdmins(loadSession()?.id);
}

export async function createStpAdmin(input: {
  login: string;
  password: string;
  displayName: string;
}): Promise<{ login: string; password: string; pendingActivation?: boolean }> {
  const login = input.login.trim();
  const typed = input.password.trim();
  const displayName = input.displayName.trim() || login;
  if (!login) throw new Error('Укажите логин');
  if (talksToServer()) {
    const res = await request<{ login: string; password?: string; pendingActivation?: boolean }>('/admin/stp-admins', {
      method: 'POST',
      body: JSON.stringify({ login, password: typed, displayName }),
    });
    return { login: res.login, password: res.password ?? '', pendingActivation: res.pendingActivation };
  }
  const password = typed || generatePassword();
  needAdmin();
  const db = loadDb();
  if (db.users.some((u) => u.login === login)) throw new Error('Такой логин уже есть');
  const now = new Date().toISOString();
  saveDb({
    ...db,
    users: [
      ...db.users,
      {
        id: `u_${Math.random().toString(36).slice(2, 10)}`,
        login,
        password,
        role: 'admin',
        displayName,
        orgId: null,
        createdAt: now,
      },
    ],
  });
  return { login, password };
}

export async function resetStpAdminPassword(id: string, password: string): Promise<string> {
  if (talksToServer()) {
    const res = await request<{ password: string }>('/admin/stp-admins/reset-password', {
      method: 'POST',
      body: JSON.stringify({ adminUserId: id, password }),
    });
    return res.password;
  }
  needAdmin();
  const db = loadDb();
  if (!db.users.some((u) => u.id === id && u.role === 'admin')) {
    throw new Error('Администратор не найден');
  }
  saveDb({ ...db, users: db.users.map((u) => (u.id === id ? { ...u, password } : u)) });
  return password;
}

export async function setStpAdminDisabled(id: string, loginDisabled: boolean): Promise<void> {
  if (talksToServer()) {
    await request(`/admin/stp-admins/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ loginDisabled }),
    });
    return;
  }
  needAdmin();
  const session = loadSession();
  if (session?.id === id) throw new Error('Нельзя отключить самого себя');
  const db = loadDb();
  const target = db.users.find((u) => u.id === id && u.role === 'admin');
  if (!target) throw new Error('Администратор не найден');
  if (loginDisabled) {
    const activeOthers = db.users.filter(
      (u) => u.role === 'admin' && u.id !== id && !(u as { loginDisabled?: boolean }).loginDisabled,
    );
    if (!activeOthers.length) throw new Error('Нельзя отключить последнего администратора');
  }
  saveDb({
    ...db,
    users: db.users.map((u) => {
      if (u.id !== id) return u;
      const next = { ...u } as typeof u & { loginDisabled?: boolean };
      if (loginDisabled) next.loginDisabled = true;
      else delete next.loginDisabled;
      return next;
    }),
  });
}

export async function deleteStpAdmin(id: string): Promise<void> {
  if (talksToServer()) {
    await request(`/admin/stp-admins/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return;
  }
  needAdmin();
  const session = loadSession();
  if (session?.id === id) throw new Error('Нельзя удалить самого себя');
  const db = loadDb();
  if (!db.users.some((u) => u.id === id && u.role === 'admin')) {
    throw new Error('Администратор не найден');
  }
  const others = db.users.filter((u) => u.role === 'admin' && u.id !== id);
  if (!others.length) throw new Error('Нельзя удалить последнего администратора');
  saveDb({ ...db, users: db.users.filter((u) => u.id !== id) });
}
