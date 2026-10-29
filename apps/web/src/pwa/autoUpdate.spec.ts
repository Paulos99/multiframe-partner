import { describe, expect, it, vi } from 'vitest';
import {
  BUILD_RELOAD_KEY,
  SW_RELOAD_GUARD_MS,
  SW_RELOAD_KEY,
  bustedUrl,
  checkBuildVersion,
  cleanBustParam,
  reloadOnceAfterWorkerUpdate,
  type KeyValueStore,
} from './autoUpdate';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error('closed');
  },
  setItem: () => {
    throw new Error('closed');
  },
  removeItem: () => {
    throw new Error('closed');
  },
};

describe('перезагрузка после обновления service worker', () => {
  it('перезагружает один раз и пишет отметку', () => {
    const store = memoryStore();
    const reload = vi.fn();
    expect(reloadOnceAfterWorkerUpdate({ store, now: () => 1_000_000, reload })).toBe('reloaded');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.data.get(SW_RELOAD_KEY)).toBe('1000000');
  });

  it('не зацикливается: вторая перезагрузка в течение минуты пропускается', () => {
    const store = memoryStore();
    const reload = vi.fn();
    reloadOnceAfterWorkerUpdate({ store, now: () => 1_000_000, reload });
    expect(reloadOnceAfterWorkerUpdate({ store, now: () => 1_000_000 + SW_RELOAD_GUARD_MS - 1, reload })).toBe('skipped');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceAfterWorkerUpdate({ store, now: () => 1_000_000 + SW_RELOAD_GUARD_MS + 1, reload })).toBe('reloaded');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('без доступа к хранилищу не перезагружает вовсе', () => {
    const reload = vi.fn();
    expect(reloadOnceAfterWorkerUpdate({ store: brokenStore, now: () => 5, reload })).toBe('skipped');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('проверка номера сборки', () => {
  const base = () => ({ store: memoryStore(), reload: vi.fn(), bust: vi.fn() });

  it('тот же номер — ничего не делает и сбрасывает отметку', async () => {
    const d = base();
    d.store.setItem(BUILD_RELOAD_KEY, 'abc:1');
    expect(await checkBuildVersion({ ...d, currentId: 'abc', fetchLatest: async () => ({ id: 'abc' }) })).toBe('same');
    expect(d.reload).not.toHaveBeenCalled();
    expect(d.store.data.has(BUILD_RELOAD_KEY)).toBe(false);
  });

  it('новый номер — одна перезагрузка', async () => {
    const d = base();
    expect(await checkBuildVersion({ ...d, currentId: 'old', fetchLatest: async () => ({ id: 'new' }) })).toBe('reloaded');
    expect(d.reload).toHaveBeenCalledTimes(1);
    expect(d.store.data.get(BUILD_RELOAD_KEY)).toBe('new:1');
  });

  it('страница после перезагрузки всё ещё старая — один раз обходим кэш, затем останавливаемся', async () => {
    const d = base();
    const args = { ...d, currentId: 'old', fetchLatest: async () => ({ id: 'new' }) };
    expect(await checkBuildVersion(args)).toBe('reloaded');
    expect(await checkBuildVersion(args)).toBe('busted');
    expect(d.bust).toHaveBeenCalledWith('new');
    expect(await checkBuildVersion(args)).toBe('skipped');
    expect(await checkBuildVersion(args)).toBe('skipped');
    expect(d.reload).toHaveBeenCalledTimes(1);
    expect(d.bust).toHaveBeenCalledTimes(1);
  });

  it('следующая выкладка снова обновляется', async () => {
    const d = base();
    d.store.setItem(BUILD_RELOAD_KEY, 'new:2');
    expect(await checkBuildVersion({ ...d, currentId: 'old', fetchLatest: async () => ({ id: 'newer' }) })).toBe('reloaded');
  });

  it('сбой сети, мусор в ответе и дев-сборка не вызывают перезагрузку', async () => {
    for (const fetchLatest of [
      async () => {
        throw new Error('offline');
      },
      async () => '<html>',
      async () => ({}),
      async () => ({ id: 5 }),
    ]) {
      const d = base();
      expect(await checkBuildVersion({ ...d, currentId: 'old', fetchLatest })).toBe('error');
      expect(d.reload).not.toHaveBeenCalled();
    }
    const d = base();
    expect(await checkBuildVersion({ ...d, currentId: 'dev', fetchLatest: async () => ({ id: 'x' }) })).toBe('skipped');
  });

  it('если хранилище закрыто — не перезагружает (нет защиты от цикла)', async () => {
    const reload = vi.fn();
    const result = await checkBuildVersion({
      currentId: 'old',
      fetchLatest: async () => ({ id: 'new' }),
      store: brokenStore,
      reload,
      bust: vi.fn(),
    });
    expect(result).toBe('skipped');
    expect(reload).not.toHaveBeenCalled();
  });

  it('параметр обхода кэша ставится один раз и убирается', () => {
    const a = bustedUrl('https://x.test/app/?demo=1#company/about', 'n1');
    expect(a).toContain('_v=n1');
    expect(bustedUrl(a, 'n2').match(/_v=/g)).toHaveLength(1);
    expect(cleanBustParam(a)).toBe('https://x.test/app/?demo=1#company/about');
    expect(cleanBustParam('https://x.test/app/')).toBeNull();
  });
});
