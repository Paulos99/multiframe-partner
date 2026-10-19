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
