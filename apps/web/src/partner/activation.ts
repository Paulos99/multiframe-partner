/**
 * Ссылка активации: выдача (для владельца и админа) и задание пароля по ссылке (для сотрудника).
 * Токен живёт только в адресе и в теле запроса. В журнал, хранилище браузера и текст ошибок он не попадает.
 */
import { passwordProblem } from '../../../../packages/shared/passwordPolicy.js';
import { hasRemoteApi, request } from './apiClient';
import { loadToken } from './localStore';

export const ACTIVATE_PARAM = 'activate';
export const ACTIVATED_MESSAGE = 'Пароль задан. Войдите в аккаунт.';
export { passwordProblem };

/** Ссылки выдаёт сервер, поэтому без сервера и без входа кнопка не нужна. */
export function canIssueLinks(): boolean {
  return hasRemoteApi() && Boolean(loadToken());
}

/** Токен из адреса или null. Без сервера ссылка активации не имеет смысла. */
export function activationTokenFromSearch(search: string): string | null {
  if (!hasRemoteApi()) return null;
  const value = new URLSearchParams(search).get(ACTIVATE_PARAM);
  return value ? value.trim() : null;
}

/** Полный адрес по ответу сервера. Адрес страницы берётся из текущего окна, поэтому путь /cabinet/ сохраняется. */
export function activationUrl(
  path: string,
  where: { origin: string; pathname: string } = window.location,
): string {
  const query = path.startsWith('?') ? path : `?${path}`;
  return `${where.origin}${where.pathname}${query}`;
}

/** Убирает токен из адресной строки, остальное (путь, другие параметры, #) остаётся. */
export function removeActivationFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(ACTIVATE_PARAM)) return;
  url.searchParams.delete(ACTIVATE_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export async function apiIssueActivation(userId: string): Promise<{ path: string; expiresAt: string }> {
  return request('/auth/invite', { method: 'POST', body: JSON.stringify({ userId }) });
}

export async function apiActivate(token: string, password: string): Promise<void> {
  await request('/auth/activate', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
    token: null,
  });
}
