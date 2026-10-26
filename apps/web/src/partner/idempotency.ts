/**
 * Повторное нажатие «Сохранить» не должно создавать второй проект.
 * Флаг ставится синхронно, до первого await. Один и тот же ключ
 * уходит в Idempotency-Key и схлопывает параллельные создания.
 */

export type SaveLock = { current: boolean };

export function claimSave(lock: SaveLock): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseSave(lock: SaveLock): void {
  lock.current = false;
}

/** Стабильный ключ: те же поля черновика → тот же заголовок. */
export function creationIdempotencyKey(token: string): string {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mf-${(hash >>> 0).toString(16)}-${token.length}`;
}

const inflight = new Map<string, Promise<unknown>>();
const finished = new Map<string, unknown>();

export function dedupeByKey<T>(key: string, run: () => Promise<T>): Promise<T> {
  const done = finished.get(key);
  if (done !== undefined) return Promise.resolve(done as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const job = run().then(
    (value) => {
      finished.set(key, value);
      inflight.delete(key);
      return value;
    },
    (error) => {
      inflight.delete(key);
      throw error;
    },
  );
  inflight.set(key, job);
  return job;
}
