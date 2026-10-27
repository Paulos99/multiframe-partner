/**
 * Офлайн-копии «Обучения»: чистые функции (без браузерных API) — план синхронизации.
 */
import type { PublicMaterial } from '../../../api/materialsLib.js';

/** Кусок скачивания: 8 МБ. В памяти одновременно не больше одного куска. */
export const OFFLINE_CHUNK_BYTES = 8 * 1024 * 1024;

export type OfflineEntry = {
  id: string;
  /** Версия файла на сервере: если поменялась — копию качаем заново. */
  version: string;
  name: string;
  mime: string;
  /** Сколько байт должно быть в копии. */
  bytes: number;
  /** Сколько кусков уже лежит в кэше (для докачки с места обрыва). */
  chunksDone: number;
  chunkBytes: number;
  done: boolean;
  /** Видео: сохранена лёгкая копия для просмотра, а не оригинал. */
  stream: boolean;
  thumb: boolean;
};

/** Где живут кнопки офлайна: предложение, прогресс или шестерёнка в шапке. */
export type OfflineAccessMode = 'offer' | 'progress' | 'gear';

export function offlineAccessMode(input: { enabled: boolean; running: boolean }): OfflineAccessMode {
  if (input.running) return 'progress';
  if (input.enabled) return 'gear';
  return 'offer';
}

export function isOfflineFile(item: PublicMaterial): boolean {
  return item.kind === 'file' && item.hasFile;
}

/** Что именно сохраняем: у видео с готовой копией — копию (в разы меньше оригинала). */
export function offlineTarget(item: PublicMaterial): { bytes: number | null; stream: boolean } {
  if (item.hasStream && item.streamSize) return { bytes: item.streamSize, stream: true };
  return { bytes: item.size ?? null, stream: false };
}

export function offlineVersion(item: PublicMaterial): string {
  const t = offlineTarget(item);
  return [item.updatedAt || '', item.size ?? '', t.stream ? `s${t.bytes}` : ''].join('|');
}

export function chunkCount(bytes: number, chunkBytes = OFFLINE_CHUNK_BYTES): number {
  return Math.max(1, Math.ceil(Math.max(0, bytes) / chunkBytes));
}

export function chunkRange(index: number, bytes: number, chunkBytes = OFFLINE_CHUNK_BYTES): { start: number; end: number } {
  const start = index * chunkBytes;
  return { start, end: Math.min(bytes, start + chunkBytes) - 1 };
}

export type OfflinePlan = {
  /** Новые, изменённые и недокачанные файлы. */
  download: PublicMaterial[];
  /** Копии удалённых или изменённых файлов. */
  remove: string[];
  /** Сколько байт ещё скачать (по известным размерам). */
  bytesToFetch: number;
  /** Сколько займут все копии после синхронизации. */
  bytesTotal: number;
  files: number;
};

export function planOfflineSync(list: PublicMaterial[], entries: Record<string, OfflineEntry>): OfflinePlan {
  const files = list.filter(isOfflineFile);
  const ids = new Set(files.map((f) => f.id));
  const remove: string[] = [];
  for (const [id, entry] of Object.entries(entries)) {
    const item = files.find((f) => f.id === id);
    if (!ids.has(id) || !item || entry.version !== offlineVersion(item)) remove.push(id);
  }
  const download: PublicMaterial[] = [];
  let bytesToFetch = 0;
  let bytesTotal = 0;
  for (const item of files) {
    const size = offlineTarget(item).bytes ?? 0;
    bytesTotal += size;
    const entry = entries[item.id];
    const fresh = entry && entry.version === offlineVersion(item);
    if (fresh && entry.done) continue;
    download.push(item);
    bytesToFetch += fresh ? Math.max(0, size - entry.chunksDone * entry.chunkBytes) : size;
  }
  // Сначала мелкие файлы: документы появляются офлайн за секунды, большие видео — в конце.
  download.sort((a, b) => (offlineTarget(a).bytes ?? 0) - (offlineTarget(b).bytes ?? 0));
  return { download, remove, bytesToFetch, bytesTotal, files: files.length };
}

export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes || 0);
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} ГБ`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} МБ`;
  if (n >= 1024) return `${Math.round(n / 1024)} КБ`;
  return `${n} Б`;
}

/** Ошибка нехватки места: Chrome/Safari — QuotaExceededError, старый Safari — код 22. */
export function isQuotaError(error: unknown): boolean {
  const e = error as { name?: string; code?: number } | null;
  return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}
