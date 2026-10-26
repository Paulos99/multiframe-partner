/** Повтор POST с тем же Idempotency-Key возвращает уже созданный ответ. */

const seen = new Map();

export function idempotencyKeyFrom(headers) {
  const bag = headers && typeof headers === 'object' ? headers : {};
  const raw = bag['idempotency-key'] || bag['Idempotency-Key'] || '';
  const key = String(raw).trim();
  if (!key || key.length > 200) return '';
  return key;
}

export function replayIdempotent(userId, key) {
  if (!userId || !key) return null;
  return seen.get(`${userId}\0${key}`) || null;
}

export function rememberIdempotent(userId, key, response) {
  if (!userId || !key || !response) return;
  seen.set(`${userId}\0${key}`, response);
  if (seen.size > 400) seen.delete(seen.keys().next().value);
}
