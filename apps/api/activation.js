/**
 * Ссылка активации: одноразовый вход для нового сотрудника и сброс пароля.
 *
 * Сам токен нигде не хранится и не пишется в журнал: в записи пользователя лежит только его
 * sha256 и срок. Новая ссылка заменяет прежнюю, успешная активация удаляет запись.
 */
import { createHash, randomBytes } from 'node:crypto';
import { safeEqual } from './security.js';

export const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Случайный токен: 32 байта, 64 шестнадцатеричных символа. */
export function newActivationToken() {
  return randomBytes(32).toString('hex');
}

export function activationDigest(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function looksLikeActivationToken(token) {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

/** Записывает новую ссылку в пользователя (прежняя стирается) и возвращает токен для ответа. */
export function issueActivation(user, now = Date.now()) {
  const token = newActivationToken();
  user.activation = {
    hash: activationDigest(token),
    expiresAt: new Date(now + ACTIVATION_TTL_MS).toISOString(),
  };
  return { token, expiresAt: user.activation.expiresAt };
}

/** Пользователь с действующей ссылкой или null. Срок и вид токена проверяются здесь. */
export function findUserByActivation(users, token, now = Date.now()) {
  if (!looksLikeActivationToken(token)) return null;
  const digest = activationDigest(token);
  for (const user of users || []) {
    const row = user?.activation;
    if (!row || typeof row.hash !== 'string') continue;
    if (!safeEqual(row.hash, digest)) continue;
    if (!(Date.parse(row.expiresAt || '') > now)) return null;
    return user;
  }
  return null;
}

/** Ждёт ли пользователь первого пароля: пароля нет, войти нельзя. */
export function awaitsActivation(user) {
  return !(typeof user?.passwordHash === 'string' && user.passwordHash);
}
