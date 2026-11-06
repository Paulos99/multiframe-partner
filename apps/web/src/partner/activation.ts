/**
 * Ссылка активации: выдача и задание логина/пароля по ссылке.
 * Без удалённого API (или когда ссылка локальная) — имитация в браузере, TTL 24 часа.
 */
import { passwordProblem } from '../../../../packages/shared/passwordPolicy.js';
import { hasRemoteApi, request } from './apiClient';
import { activateLocal, issueLocalActivation } from './localActivation';
import { loadToken } from './localStore';

export const ACTIVATE_PARAM = 'activate';
export const ACTIVATED_MESSAGE = 'Аккаунт активирован. Войдите в кабинет.';
export { passwordProblem };

/** Ссылки доступны и на сервере, и в локальном демо. */
export function canIssueLinks(): boolean {
  return true;
}

export function activationTokenFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(ACTIVATE_PARAM);
  return value ? value.trim() : null;
}

export function activationUrl(
  path: string,
  where: { origin: string; pathname: string } = window.location,
): string {
  const query = path.startsWith('?') ? path : `?${path}`;
  return `${where.origin}${where.pathname}${query}`;
}

export function removeActivationFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(ACTIVATE_PARAM)) return;
  url.searchParams.delete(ACTIVATE_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export async function apiIssueActivation(userId: string): Promise<{ path: string; expiresAt: string }> {
  if (hasRemoteApi() && loadToken()) {
    try {
      return await request('/auth/invite', { method: 'POST', body: JSON.stringify({ userId }) });
    } catch {
      /* демо/стенд без живого API */
    }
  }
  return issueLocalActivation(userId);
}

export async function apiActivate(
  token: string,
  password: string,
  login?: string | null,
): Promise<void> {
  const body = JSON.stringify({ token, password, ...(login ? { login } : {}) });
  if (hasRemoteApi()) {
    try {
      await request('/auth/activate', { method: 'POST', body, token: null });
      return;
    } catch (remoteError) {
      try {
        activateLocal(token, password, login);
        return;
      } catch {
        throw remoteError;
      }
    }
  }
  activateLocal(token, password, login);
}
