import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
let quotaFull = false;
let quotaStaysFull = false;

beforeEach(() => {
  store.clear();
  quotaFull = false;
  quotaStaysFull = false;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (quotaFull) throw new DOMException('quota', 'QuotaExceededError');
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
      if (!quotaStaysFull) quotaFull = false;
    },
  });
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

describe('saveToken при переполненном хранилище', () => {
  it('освобождает пересоздаваемые кэши и сохраняет токен', async () => {
    const ls = await import('./localStore');
    store.set('mf_partner_objects_v1', 'x'.repeat(10));
    quotaFull = true;
    ls.saveToken('abc');
    expect(ls.loadToken()).toBe('abc');
    expect(store.get('mf_partner_token_v1')).toBe('abc');
    expect(store.has('mf_partner_objects_v1')).toBe(false);
  });

  it('если места нет совсем, токен живёт в памяти вкладки и вход не теряется', async () => {
    const ls = await import('./localStore');
    quotaFull = true;
    quotaStaysFull = true;
    ls.saveToken('mem-token');
    expect(store.has('mf_partner_token_v1')).toBe(false);
    expect(ls.loadToken()).toBe('mem-token');
  });

  it('выход очищает и память, и хранилище', async () => {
    const ls = await import('./localStore');
    quotaFull = true;
    quotaStaysFull = true;
    ls.saveToken('mem-token');
    ls.saveToken(null);
    expect(ls.loadToken()).toBeNull();
  });

  it('флаг входа без сервера включается и выключается', async () => {
    const ls = await import('./localStore');
    expect(ls.isLocalOnlySession()).toBe(false);
    ls.setLocalOnlySession(true);
    expect(ls.isLocalOnlySession()).toBe(true);
    ls.setLocalOnlySession(false);
    expect(ls.isLocalOnlySession()).toBe(false);
  });
});
