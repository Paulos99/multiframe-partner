/**
 * Автообновление без вопросов: новая выкладка подхватывается при обычной перезагрузке страницы.
 * Два независимых механизма (оба с защитой от бесконечной перезагрузки):
 *  1) service worker (skipWaiting + clientsClaim): когда новый worker взял управление — перезагрузка один раз;
 *  2) проверка номера сборки (version.json): работает и там, где service worker выключен (демо-сборка, дев).
 */

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const SW_RELOAD_KEY = 'mf_sw_reload_at';
export const SW_RELOAD_GUARD_MS = 60_000;
export const BUILD_RELOAD_KEY = 'mf_build_reload';
export const BUILD_PARAM = '_v';

function safeGet(store: KeyValueStore, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: KeyValueStore, key: string, value: string): boolean {
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Новый service worker взял управление. Перезагружаем страницу не чаще раза в минуту:
 * если отметку записать не удалось (хранилище закрыто), лучше не перезагружать совсем, чем зациклить.
 */
export function reloadOnceAfterWorkerUpdate(deps: {
  store: KeyValueStore;
  now: () => number;
  reload: () => void;
}): 'reloaded' | 'skipped' {
  const last = Number(safeGet(deps.store, SW_RELOAD_KEY) || 0);
  const now = deps.now();
  if (last > 0 && now - last < SW_RELOAD_GUARD_MS) return 'skipped';
  if (!safeSet(deps.store, SW_RELOAD_KEY, String(now))) return 'skipped';
  deps.reload();
  return 'reloaded';
}

export type BuildCheckResult = 'same' | 'reloaded' | 'busted' | 'skipped' | 'error';

/**
 * Сверяем номер сборки в этой странице с актуальным version.json (всегда с сервера, мимо кэша).
 * Другой номер → перезагрузка. Если после неё страница всё ещё старая (кэш браузера или CDN) —
 * один раз открываем адрес с параметром, который обходит кэш. Дальше не пытаемся: цикла нет.
 */
export async function checkBuildVersion(deps: {
  currentId: string;
  fetchLatest: () => Promise<unknown>;
  store: KeyValueStore;
  reload: () => void;
  bust: (id: string) => void;
}): Promise<BuildCheckResult> {
  if (!deps.currentId || deps.currentId === 'dev') return 'skipped';
  let latest: unknown;
  try {
    latest = await deps.fetchLatest();
  } catch {
    return 'error';
  }
  const id = latest && typeof latest === 'object' ? (latest as { id?: unknown }).id : null;
  if (typeof id !== 'string' || !id) return 'error';
  if (id === deps.currentId) {
    try {
      deps.store.removeItem(BUILD_RELOAD_KEY);
    } catch {
      /* ignore */
    }
    return 'same';
  }
  const tried = safeGet(deps.store, BUILD_RELOAD_KEY);
  if (tried === `${id}:2`) return 'skipped';
  if (tried === `${id}:1`) {
    if (!safeSet(deps.store, BUILD_RELOAD_KEY, `${id}:2`)) return 'skipped';
    deps.bust(id);
    return 'busted';
  }
  if (!safeSet(deps.store, BUILD_RELOAD_KEY, `${id}:1`)) return 'skipped';
  deps.reload();
  return 'reloaded';
}

/** Адрес с параметром обхода кэша; повторный вызов заменяет параметр, а не копит их. */
export function bustedUrl(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set(BUILD_PARAM, id);
  return url.toString();
}

/** Убрать служебный параметр из адреса, когда страница уже свежая. */
export function cleanBustParam(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(BUILD_PARAM)) return null;
  url.searchParams.delete(BUILD_PARAM);
  return url.toString();
}
