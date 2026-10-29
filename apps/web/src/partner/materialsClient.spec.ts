import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('listMaterials with a remote API', () => {
  it('never falls back to the local demo library when the session token is gone', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { listMaterials, MATERIALS_SESSION_EXPIRED } = await import('./materialsClient');
    await expect(listMaterials()).rejects.toThrow(MATERIALS_SESSION_EXPIRED);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not turn a 404 into demo materials', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const { saveToken } = await import('./localStore');
    saveToken('t');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })));
    const { listMaterials } = await import('./materialsClient');
    await expect(listMaterials()).rejects.toThrow(/not found/i);
  });

  it('still uses the local library when no API is configured (offline demo build)', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const { listMaterials } = await import('./materialsClient');
    const items = await listMaterials();
    expect(items.some((m) => m.id === 'mat_fld_mount')).toBe(true);
  });
  it('shows the session-expired message when the server rejects the stored token', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const { saveToken } = await import('./localStore');
    saveToken('expired');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })));
    const { listMaterials, MATERIALS_SESSION_EXPIRED } = await import('./materialsClient');
    await expect(listMaterials()).rejects.toThrow(MATERIALS_SESSION_EXPIRED);
  });
});

describe('listMaterials: понятное сообщение для каждой причины сбоя', () => {
  async function failWith(respond: () => Promise<Response>) {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const { saveToken } = await import('./localStore');
    saveToken('t');
    vi.stubGlobal('fetch', vi.fn(respond));
    const mod = await import('./materialsClient');
    const error = await mod.listMaterials().then(() => null, (e: unknown) => e);
    return { mod, error: error as InstanceType<typeof mod.MaterialsError> };
  }

  it('нет связи: не «сессия истекла», а просьба проверить интернет', async () => {
    const { mod, error } = await failWith(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(error.kind).toBe('network');
    expect(error.message).not.toContain('Сессия истекла');
    expect(error.message).toContain('Нет связи');
    expect(mod.materialsNeedRelogin(error)).toBe(false);
  });

  it('сервер недоступен (5xx): свой текст, без кнопки повторного входа', async () => {
    const { mod, error } = await failWith(async () => new Response('{}', { status: 502 }));
    expect(error.kind).toBe('server');
    expect(error.message).toBe(mod.MATERIALS_SERVER_DOWN);
    expect(mod.materialsNeedRelogin(error)).toBe(false);
  });

  it('роль без доступа (403): свой текст', async () => {
    const { mod, error } = await failWith(async () => new Response('{}', { status: 403 }));
    expect(error.kind).toBe('forbidden');
    expect(error.message).toBe(mod.MATERIALS_FORBIDDEN);
    expect(mod.materialsNeedRelogin(error)).toBe(false);
  });

  it('401: сессия истекла, нужна кнопка «Войти заново»', async () => {
    const { mod, error } = await failWith(async () => new Response('{}', { status: 401 }));
    expect(error.kind).toBe('session');
    expect(mod.materialsNeedRelogin(error)).toBe(true);
  });

  it('вход без сервера (токена нет, флаг локального входа): объясняет причину, а не «истекла»', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    vi.stubGlobal('fetch', vi.fn());
    const { setLocalOnlySession } = await import('./localStore');
    setLocalOnlySession(true);
    const mod = await import('./materialsClient');
    const error = (await mod.listMaterials().then(() => null, (e: unknown) => e)) as InstanceType<typeof mod.MaterialsError>;
    expect(error.kind).toBe('no-session');
    expect(error.message).toBe(mod.MATERIALS_NO_SERVER_SESSION);
    expect(mod.materialsNeedRelogin(error)).toBe(true);
  });

  it('тексты ошибок не заканчиваются двумя точками', async () => {
    const mod = await import('./materialsClient');
    for (const text of [mod.MATERIALS_SESSION_EXPIRED, mod.MATERIALS_NO_SERVER_SESSION, mod.MATERIALS_FORBIDDEN, mod.MATERIALS_SERVER_DOWN]) {
      expect(text.endsWith('.')).toBe(true);
      expect(text.endsWith('..')).toBe(false);
    }
  });
});
