/**
 * Ссылка для клиента: адрес страницы результатов комнаты.
 * Токен ставит сервер; в адресе только он, без имени, телефона и цен.
 */
import { apiCreateRoomShare, apiGetRoomShare, hasRemoteApi } from './apiClient';
import type { UserRole } from '../../../../packages/shared/partner';

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

/** #r/<токен> или #/r/<токен>. Другие адреса — null. */
export function parseClientLinkHash(hash: string): string | null {
  const raw = hash.replace(/^#/, '').replace(/^\/+/, '');
  const [head, token, ...rest] = raw.split('/');
  if (head !== 'r' || rest.length > 0) return null;
  return token && TOKEN_RE.test(token) ? token : null;
}

/** Адрес вида …/#/r/<токен>, когда токен выглядит не как наш (неверная ссылка). */
export function isClientLinkHash(hash: string): boolean {
  const raw = hash.replace(/^#/, '').replace(/^\/+/, '');
  return raw.split('/')[0] === 'r';
}

export function clientLinkUrl(token: string, origin = window.location.origin): string {
  const base = new URL(import.meta.env?.BASE_URL || '/', origin);
  return `${base.origin}${base.pathname}#/r/${token}`;
}

/** Создавать и обновлять ссылку могут владелец, менеджер и замерщик. Монтажник только читает. */
export function canCreateClientLink(role: UserRole | undefined): boolean {
  return role === 'owner' || role === 'sales' || role === 'measurer';
}

export function canDisableClientLink(role: UserRole | undefined): boolean {
  return role === 'owner' || role === 'sales';
}

/**
 * Ссылка для PDF-отчёта: создаёт, если её ещё нет (отключённую вручную не трогает), и не мешает отчёту, если сервер недоступен.
 * Монтажнику только читает уже созданную.
 */
export async function ensureClientLinkUrl(
  objectId: string | null | undefined,
  role: UserRole | undefined,
  answers: Record<string, unknown>,
): Promise<string | null> {
  if (!objectId || !hasRemoteApi() || !role) return null;
  try {
    let link = await apiGetRoomShare(objectId);
    // Отключённую вручную ссылку отчёт заново не включает.
    if (canCreateClientLink(role) && !link.disabled) link = await apiCreateRoomShare(objectId, answers);
    return link.enabled && link.token ? clientLinkUrl(link.token) : null;
  } catch {
    return null;
  }
}
