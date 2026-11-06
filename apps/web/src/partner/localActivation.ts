/**
 * Локальная имитация ссылки активации для демо/стенда без удалённого API.
 * TTL 24 часа, одноразовая; новая ссылка отменяет прежнюю — как на сервере.
 */
import { passwordProblem } from '../../../../packages/shared/passwordPolicy.js';
import { loadDb, saveDb, type StoredUser } from './localStore';

export const LOCAL_ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[a-f0-9]{64}$/;

function digest(token: string): string {
  // Браузерный sha256 через SubtleCrypto синхронно недоступен — для демо
  // достаточно детерминированного некриптографического отпечатка; токен сам случайный.
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `local_${(h >>> 0).toString(16)}_${token.slice(0, 16)}`;
}

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function looksLikeLocalActivationToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export function issueLocalActivation(userId: string): { path: string; expiresAt: string } {
  const db = loadDb();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx < 0) throw new Error('Сотрудник не найден');
  const token = newToken();
  const expiresAt = new Date(Date.now() + LOCAL_ACTIVATION_TTL_MS).toISOString();
  const users = [...db.users];
  const current = users[idx]!;
  users[idx] = {
    ...current,
    password: '',
    pendingActivation: true,
    activation: { hash: digest(token), expiresAt },
  };
  saveDb({ ...db, users });
  return { path: `?activate=${token}`, expiresAt };
}

function findByToken(users: StoredUser[], token: string, now = Date.now()): StoredUser | null {
  if (!looksLikeLocalActivationToken(token)) return null;
  const dig = digest(token);
  for (const user of users) {
    const row = user.activation;
    if (!row || row.hash !== dig) continue;
    if (!(Date.parse(row.expiresAt || '') > now)) return null;
    return user;
  }
  return null;
}

/**
 * Активация: пароль обязателен, логин — если передан (сотрудник выбирает сам).
 * Занятый логин → ошибка с текстом как на сервере (409).
 */
export function activateLocal(
  token: string,
  password: string,
  login?: string | null,
): { login: string } {
  const weak = passwordProblem(password);
  if (weak) throw new Error(weak);
  const db = loadDb();
  const found = findByToken(db.users, token);
  if (!found) throw new Error('Ссылка недействительна или срок истёк');
  const idx = db.users.findIndex((u) => u.id === found.id);
  if (idx < 0) throw new Error('Ссылка недействительна или срок истёк');
  let nextLogin = found.login;
  const wanted = String(login ?? '').trim();
  if (wanted) {
    if (wanted.length > 64) throw new Error('Логин слишком длинный');
    const taken = db.users.some((u) => u.id !== found.id && u.login === wanted);
    if (taken) throw Object.assign(new Error('Такой логин уже есть'), { status: 409 });
    nextLogin = wanted;
  } else if (found.pendingActivation && (!found.login || found.login.startsWith('inv_'))) {
    throw new Error('Укажите логин');
  }
  const users = [...db.users];
  const current = users[idx]!;
  const { activation: _a, pendingActivation: _p, ...rest } = current;
  users[idx] = {
    ...rest,
    login: nextLogin,
    password,
    pendingActivation: false,
  };
  saveDb({ ...db, users });
  return { login: nextLogin };
}
