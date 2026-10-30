/**
 * Офлайн-копии «Обучения» на устройстве.
 *
 * Файлы лежат в Cache Storage (есть во всех браузерах, включая iOS Safari; на диске, не в памяти).
 * Каждый файл качается кусками по 8 МБ запросами Range: обрыв связи — докачка с того же куска,
 * в памяти одновременно один кусок. Видео с лёгкой копией сохраняется копией (в разы меньше).
 * Открываем копию как Blob из кусков — браузер читает их с диска; видео перематывается.
 *
 * Только чтение: офлайн ничего не меняется на сервере, правка материалов остаётся у админа онлайн.
 */
import type { PublicMaterial } from '../../../../packages/shared/materialsLib.js';
import { apiMaterialContent } from './apiClient';
import {
  chunkCount,
  chunkRange,
  formatBytes,
  isOfflineFile,
  isQuotaError,
  offlineTarget,
  offlineVersion,
  OFFLINE_CHUNK_BYTES,
  planOfflineSync,
  type OfflineEntry,
} from './offlineMaterialsPlan';

export { formatBytes };

const CACHE = 'mf-offline-materials-v1';
const META_KEY = 'mf.offlineMaterials.v1';
const KEY_BASE = 'https://offline.mf-partner.local/materials';

type Meta = {
  enabled: boolean;
  list: PublicMaterial[] | null;
  listAt: string | null;
  syncedAt: string | null;
  entries: Record<string, OfflineEntry>;
};

export type OfflineState = {
  supported: boolean;
  enabled: boolean;
  running: boolean;
  /** Сейчас качается: имя файла. */
  current: string | null;
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
  /** Сколько займут все копии (для оценки до скачивания). */
  planBytes: number;
  planFiles: number;
  savedFiles: number;
  savedBytes: number;
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
  syncedAt: string | null;
  error: string | null;
};

export const QUOTA_MESSAGE =
  'На устройстве не хватило места для офлайн-копий. Освободите память или удалите офлайн-копии. На iPhone место для сайта ограничено: установите кабинет на экран «Домой» — так браузер даёт больше места.';

function supported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window && typeof fetch === 'function';
}

function readMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const meta = JSON.parse(raw) as Partial<Meta>;
      return {
        enabled: !!meta.enabled,
        list: Array.isArray(meta.list) ? meta.list : null,
        listAt: meta.listAt || null,
        syncedAt: meta.syncedAt || null,
        entries: meta.entries && typeof meta.entries === 'object' ? meta.entries : {},
      };
    }
  } catch {
    /* повреждённая запись — начинаем с чистого */
  }
  return { enabled: false, list: null, listAt: null, syncedAt: null, entries: {} };
}

let meta: Meta = typeof localStorage === 'undefined' ? { enabled: false, list: null, listAt: null, syncedAt: null, entries: {} } : readMeta();

function writeMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* localStorage переполнен — копии всё равно в кэше, состояние восстановится при следующей синхронизации */
  }
}

let state: OfflineState = baseState();
const listeners = new Set<() => void>();

function savedTotals() {
  const done = Object.values(meta.entries).filter((e) => e.done);
  return { savedFiles: done.length, savedBytes: done.reduce((sum, e) => sum + e.bytes, 0) };
}

function baseState(): OfflineState {
  const plan = meta.list ? planOfflineSync(meta.list, meta.entries) : null;
  return {
    supported: supported(),
    enabled: meta.enabled,
    running: false,
    current: null,
    filesDone: 0,
    filesTotal: 0,
    bytesDone: 0,
    bytesTotal: 0,
    planBytes: plan?.bytesTotal ?? 0,
    planFiles: plan?.files ?? 0,
    ...savedTotals(),
    usage: null,
    quota: null,
    persisted: null,
    syncedAt: meta.syncedAt,
    error: null,
  };
}

function set(patch: Partial<OfflineState>) {
  state = { ...state, ...patch, ...savedTotals(), enabled: meta.enabled, syncedAt: meta.syncedAt };
  listeners.forEach((fn) => fn());
}

export function subscribeOffline(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getOfflineState(): OfflineState {
  return state;
}

export function offlineEnabled(): boolean {
  return meta.enabled;
}

/** Размер куска; в dev-сборке тесты уменьшают его, чтобы проверить докачку на маленьком файле. */
function chunkSize(): number {
  if (import.meta.env?.DEV) {
    const n = Number(localStorage.getItem('mf.offlineChunkBytes'));
    if (n > 0) return n;
  }
  return OFFLINE_CHUNK_BYTES;
}

const chunkKey = (id: string, version: string, index: number) =>
  `${KEY_BASE}/${encodeURIComponent(id)}/${encodeURIComponent(version)}/${index}`;
const thumbKey = (id: string) => `${KEY_BASE}/${encodeURIComponent(id)}/thumb`;

async function openCache(): Promise<Cache> {
  return caches.open(CACHE);
}

export async function refreshStorageEstimate(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    set({ usage: usage ?? null, quota: quota ?? null, persisted });
  } catch {
    /* оценка недоступна — показываем без неё */
  }
}

/** Последний список с сервера: офлайн «Обучение» показывает его. */
export function rememberMaterialsList(list: PublicMaterial[]): void {
  if (!meta.enabled) return;
  meta.list = list.map((item) => ({ ...item, thumbnailUrl: null }));
  meta.listAt = new Date().toISOString();
  writeMeta();
  const plan = planOfflineSync(meta.list, meta.entries);
  set({ planBytes: plan.bytesTotal, planFiles: plan.files });
}

/** Сохранённый список с локальными миниатюрами (blob:) — для показа без сети. */
export async function offlineMaterialsList(): Promise<{ items: PublicMaterial[]; at: string | null } | null> {
  if (!meta.enabled || !meta.list) return null;
  const items = await Promise.all(
    meta.list.map(async (item) => {
      const entry = meta.entries[item.id];
      const thumb = entry?.thumb ? await offlineThumbUrl(item.id) : null;
      return { ...item, thumbnailUrl: thumb };
    }),
  );
  return { items, at: meta.listAt };
}

export function isAvailableOffline(id: string): boolean {
  return !!meta.entries[id]?.done;
}

const thumbUrls = new Map<string, string>();
async function offlineThumbUrl(id: string): Promise<string | null> {
  if (thumbUrls.has(id)) return thumbUrls.get(id)!;
  try {
    const res = await (await openCache()).match(thumbKey(id));
    if (!res) return null;
    const url = URL.createObjectURL(await res.blob());
    thumbUrls.set(id, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Файл из офлайн-копии. Blob собирается из кусков без копирования —
 * для <video> это полноценный источник с перемоткой.
 */
export async function offlineMaterialBlob(id: string): Promise<{ blob: Blob; mime: string; stream: boolean } | null> {
  const entry = meta.entries[id];
  if (!entry?.done || !supported()) return null;
  const cache = await openCache();
  const parts: Blob[] = [];
  for (let i = 0; i < entry.chunksDone; i += 1) {
    const res = await cache.match(chunkKey(id, entry.version, i));
    if (!res) return null;
    parts.push(await res.blob());
  }
  const blob = new Blob(parts, { type: entry.mime });
  if (entry.bytes && blob.size !== entry.bytes) return null;
  return { blob, mime: entry.mime, stream: entry.stream };
}

async function deleteEntry(cache: Cache, id: string) {
  const entry = meta.entries[id];
  if (entry) {
    const count = Math.max(entry.chunksDone, chunkCount(entry.bytes, entry.chunkBytes));
    for (let i = 0; i < count; i += 1) await cache.delete(chunkKey(id, entry.version, i));
  }
  await cache.delete(thumbKey(id));
  const url = thumbUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  thumbUrls.delete(id);
  delete meta.entries[id];
}

let abort: AbortController | null = null;
let runningSync: Promise<void> | null = null;

class StopError extends Error {}

/** Источник файла для скачивания: свежая подписанная ссылка или base64 (мелкие старые файлы). */
async function sourceOf(item: PublicMaterial, stream: boolean): Promise<{ url?: string; blob?: Blob; mime: string }> {
  const data = await apiMaterialContent(item.id);
  const mime = (stream ? 'video/mp4' : data.mime || item.mime) || 'application/octet-stream';
  const withStream = data as typeof data & { url?: string; streamUrl?: string };
  if (stream && withStream.streamUrl) return { url: withStream.streamUrl, mime };
  if (withStream.url) return { url: withStream.url, mime: data.mime || item.mime || 'application/octet-stream' };
  if (data.base64) {
    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return { blob: new Blob([bytes], { type: mime }), mime };
  }
  throw new Error('У файла нет содержимого');
}

async function putChunk(cache: Cache, key: string, body: BodyInit | null, mime: string) {
  // Cache API не хранит ответы 206, поэтому кусок кладём как обычный 200.
  await cache.put(key, new Response(body, { status: 200, headers: { 'Content-Type': mime } }));
}

async function downloadFile(cache: Cache, item: PublicMaterial, signal: AbortSignal, onBytes: (n: number) => void) {
  const target = offlineTarget(item);
  const version = offlineVersion(item);
  let entry = meta.entries[item.id];
  if (!entry || entry.version !== version) {
    if (entry) await deleteEntry(cache, item.id);
    entry = {
      id: item.id,
      version,
      name: item.name,
      mime: item.mime || 'application/octet-stream',
      bytes: target.bytes ?? 0,
      chunksDone: 0,
      chunkBytes: chunkSize(),
      done: false,
      stream: target.stream,
      thumb: false,
    };
    meta.entries[item.id] = entry;
    writeMeta();
  }
  let src = await sourceOf(item, target.stream);
  entry.mime = src.mime;
  if (src.blob) {
    await putChunk(cache, chunkKey(item.id, version, 0), src.blob, src.mime);
    entry.bytes = src.blob.size;
    entry.chunksDone = 1;
    onBytes(src.blob.size);
  } else {
    let total = entry.bytes;
    let refreshed = 0;
    while (!total || entry.chunksDone < chunkCount(total, entry.chunkBytes)) {
      if (signal.aborted) throw new StopError();
      const { start, end } = total ? chunkRange(entry.chunksDone, total, entry.chunkBytes) : { start: 0, end: entry.chunkBytes - 1 };
      const res = await fetch(src.url!, { headers: { Range: `bytes=${start}-${end}` }, signal, cache: 'no-store' });
      if (res.status === 403 && refreshed < 3) {
        // Подпись истекла за время скачивания — берём новую ссылку и продолжаем с этого же куска.
        refreshed += 1;
        src = await sourceOf(item, target.stream);
        continue;
      }
      if (res.status === 200) {
        // Сервер отдал файл целиком (без Range) — сохраняем потоком одним куском.
        const length = Number(res.headers.get('content-length')) || 0;
        await putChunk(cache, chunkKey(item.id, version, 0), res.body, src.mime);
        entry.chunkBytes = length || total || entry.chunkBytes;
        entry.bytes = length || total;
        entry.chunksDone = 1;
        onBytes(entry.bytes);
        break;
      }
      if (res.status !== 206) throw new Error(`Не удалось скачать «${item.name}» (${res.status})`);
      if (!total) {
        const range = res.headers.get('content-range');
        total = Number(range?.split('/')[1]) || 0;
        if (!total) throw new Error(`Не удалось узнать размер «${item.name}»`);
        entry.bytes = total;
      }
      const blob = await res.blob();
      if (blob.size !== end - start + 1) throw new Error(`Обрыв при скачивании «${item.name}»`);
      await putChunk(cache, chunkKey(item.id, version, entry.chunksDone), blob, src.mime);
      entry.chunksDone += 1;
      writeMeta();
      onBytes(blob.size);
    }
  }
  // Миниатюра — по желанию: без неё файл всё равно доступен.
  if (item.thumbnailUrl) {
    try {
      const res = await fetch(item.thumbnailUrl, { signal });
      if (res.ok) {
        await cache.put(thumbKey(item.id), new Response(await res.blob(), { headers: { 'Content-Type': res.headers.get('content-type') || 'image/webp' } }));
        entry.thumb = true;
      }
    } catch (error) {
      if (isQuotaError(error)) throw error;
    }
  }
  entry.done = true;
  writeMeta();
}

/**
 * Синхронизация: качает новые и изменённые файлы, удаляет копии удалённых.
 * Один запуск за раз; повторный вызов ждёт текущий.
 */
export function syncOfflineMaterials(list: PublicMaterial[]): Promise<void> {
  if (!meta.enabled || !supported()) return Promise.resolve();
  if (runningSync) return runningSync;
  rememberMaterialsList(list);
  runningSync = (async () => {
    abort = new AbortController();
    const signal = abort.signal;
    const plan = planOfflineSync(list, meta.entries);
    void warmOfflineViewers();
    set({ running: true, error: null, filesDone: 0, filesTotal: plan.download.length, bytesDone: 0, bytesTotal: plan.bytesToFetch, current: null });
    try {
      const cache = await openCache();
      for (const id of plan.remove) await deleteEntry(cache, id);
      writeMeta();
      await refreshStorageEstimate();
      let done = 0;
      let bytes = 0;
      for (const item of plan.download) {
        if (signal.aborted) throw new StopError();
        set({ current: item.name });
        await downloadFile(cache, item, signal, (n) => {
          bytes += n;
          set({ bytesDone: bytes });
        });
        done += 1;
        set({ filesDone: done });
      }
      meta.syncedAt = new Date().toISOString();
      writeMeta();
      set({ current: null });
    } catch (error) {
      if (error instanceof StopError || (error as Error)?.name === 'AbortError') set({ error: null });
      else if (isQuotaError(error)) set({ error: QUOTA_MESSAGE });
      else if (typeof navigator !== 'undefined' && navigator.onLine === false) set({ error: 'Нет сети. Докачаем, когда интернет появится.' });
      else set({ error: error instanceof Error ? error.message : 'Не удалось скачать материалы' });
    } finally {
      abort = null;
      runningSync = null;
      set({ running: false, current: null });
      await refreshStorageEstimate();
    }
  })();
  return runningSync;
}

export function stopOfflineSync(): void {
  abort?.abort();
}

/**
 * Просмотрщики PDF и Word грузятся лениво. Подгружаем их, пока есть сеть: модули попадают
 * в кэш service worker'а, и офлайн-копии потом открываются без интернета.
 */
export async function warmOfflineViewers(): Promise<void> {
  try {
    const [, , pdf] = await Promise.all([
      import('../ui/filePreview/PdfPreview'),
      import('../ui/filePreview/WordPreview'),
      import('../ui/filePreview/pdfjsLoader'),
    ]);
    await pdf.loadPdfJs();
    const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    await fetch(worker).catch(() => undefined);
  } catch {
    /* без сети или старый браузер — просмотр догрузится при следующем открытии */
  }
}

/** Включить офлайн-копии: просим браузер не стирать их при нехватке места. */
export async function enableOfflineMaterials(): Promise<void> {
  meta.enabled = true;
  writeMeta();
  void warmOfflineViewers();
  try {
    if (navigator.storage?.persist) set({ persisted: await navigator.storage.persist() });
  } catch {
    /* не все браузеры умеют */
  }
  set({});
}

/** Удалить все офлайн-копии и выключить автообновление. */
export async function disableOfflineMaterials(): Promise<void> {
  stopOfflineSync();
  if (runningSync) await runningSync.catch(() => {});
  if (supported()) await caches.delete(CACHE);
  thumbUrls.forEach((url) => URL.revokeObjectURL(url));
  thumbUrls.clear();
  meta = { enabled: false, list: null, listAt: null, syncedAt: null, entries: {} };
  writeMeta();
  set({ error: null, planBytes: 0, planFiles: 0 });
  await refreshStorageEstimate();
}

/** Для тестов. */
export function resetOfflineForTests(): void {
  meta = readMeta();
  state = baseState();
}

export { isOfflineFile };
