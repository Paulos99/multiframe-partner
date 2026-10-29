/**
 * Защитные помощники API: ограничение частоты, пароли, сравнение ключей, заголовки.
 * Без внешних зависимостей. Состояние лимитов — в памяти экземпляра функции;
 * общий лимит на входе обеспечивает шлюз/прокси (см. docs/handover/SECURITY_CHECKLIST.md),
 * а блокировка учётной записи после серии неверных паролей хранится в данных платформы.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** Стоимость bcrypt для новых паролей. Проверка принимает любые хеши. */
export const BCRYPT_COST = Math.min(14, Math.max(10, Number(process.env.BCRYPT_COST) || 12));
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX_BYTES = 72;

export function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_COST);
}

/** Пустая строка, если пароль подходит, иначе текст ошибки для пользователя. */
export function passwordProblem(password) {
  const value = String(password ?? '');
  if (value.length < PASSWORD_MIN) return `Пароль: не короче ${PASSWORD_MIN} символов`;
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX_BYTES) return `Пароль: не более ${PASSWORD_MAX_BYTES} байт`;
  if (/^\s|\s$/.test(value)) return 'Пароль не должен начинаться или заканчиваться пробелом';
  return '';
}

/** Случайный пароль без похожих символов (для временных паролей). */
export function generatePassword(length = 16) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Сравнение секретов за постоянное время. */
export function safeEqual(a, b) {
  const left = createHash('sha256').update(String(a ?? '')).digest();
  const right = createHash('sha256').update(String(b ?? '')).digest();
  return timingSafeEqual(left, right) && Boolean(a) && Boolean(b);
}

/** Хеш-пустышка: вход с неизвестным логином тратит столько же времени, сколько с известным. */
let dummyHash = null;
export async function dummyCompare(password) {
  if (!dummyHash) dummyHash = await bcrypt.hash(randomBytes(16).toString('hex'), BCRYPT_COST);
  await bcrypt.compare(String(password ?? ''), dummyHash);
}

/* —— Ограничение частоты в памяти —— */

const windows = new Map();
const MAX_KEYS = 20000;

function prune(now) {
  if (windows.size < MAX_KEYS) return;
  for (const [key, row] of windows) {
    if (row.reset <= now) windows.delete(key);
  }
  if (windows.size >= MAX_KEYS) windows.clear();
}

/**
 * Считает обращение. @returns {{ allowed: boolean, retryAfter: number }}
 * retryAfter — секунды до сброса окна.
 */
export function rateHit(key, { limit, windowMs }, now = Date.now()) {
  prune(now);
  let row = windows.get(key);
  if (!row || row.reset <= now) {
    row = { count: 0, reset: now + windowMs };
    windows.set(key, row);
  }
  row.count += 1;
  return { allowed: row.count <= limit, retryAfter: Math.max(1, Math.ceil((row.reset - now) / 1000)) };
}

/** Проверка без увеличения счётчика. */
export function rateCheck(key, { limit }, now = Date.now()) {
  const row = windows.get(key);
  if (!row || row.reset <= now) return { allowed: true, retryAfter: 0 };
  return { allowed: row.count < limit, retryAfter: Math.max(1, Math.ceil((row.reset - now) / 1000)) };
}

export function rateReset(key) {
  windows.delete(key);
}

export function resetRateLimitsForTests() {
  windows.clear();
}

/** Адрес клиента: из шлюза Yandex, иначе из X-Forwarded-For (первый), иначе пусто. */
export function clientIp(event) {
  const fromGateway = event?.requestContext?.identity?.sourceIp;
  if (fromGateway) return String(fromGateway);
  const headers = event?.headers || {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'x-forwarded-for' && value) return String(value).split(',')[0].trim();
  }
  return '';
}

/** Блокировка учётной записи после серии неверных паролей. */
export const LOGIN_LOCK = { failures: 10, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };

/** Заголовки для всех ответов API. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
};

/** Список разрешённых origin из CORS_ORIGIN (через запятую). */
export function allowedOrigins() {
  return String(process.env.CORS_ORIGIN || 'https://paulos99.github.io')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/** Origin запроса, если он в списке. Иначе первый из списка (браузер всё равно отклонит чужой). */
export function corsOriginFor(requestOrigin) {
  const list = allowedOrigins();
  const origin = String(requestOrigin || '').replace(/\/$/, '');
  if (origin && list.includes(origin)) return origin;
  return list[0] || '';
}
