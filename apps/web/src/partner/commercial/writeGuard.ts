/** Синхронный замок записи. Второй вызов в том же заходе не уходит в сеть. */

export function beginWrite(
  lock: { current: boolean },
  keys: Map<string, string>,
  intent: string,
): string | null {
  if (lock.current) return null;
  lock.current = true;
  let key = keys.get(intent);
  if (!key) {
    key = globalThis.crypto.randomUUID();
    keys.set(intent, key);
  }
  return key;
}

export function endWrite(
  lock: { current: boolean },
  keys: Map<string, string>,
  intent: string,
  ok: boolean,
): void {
  if (ok) keys.delete(intent);
  lock.current = false;
}
