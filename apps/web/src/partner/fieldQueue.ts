/**
 * Очередь заметок и фото, снятых без связи (IndexedDB, хранилище queue).
 * Фото сжимаются до постановки в очередь и лежат как Blob. Отправка — по одному, по порядку
 * (offlineQueue.orderQueue), с повторами 5 с / 30 с / 2 мин / 10 мин. Сервер узнаёт повтор по clientId.
 */
import type { PhotoStage } from '../../../../packages/shared/roomPhotos.js';
import type { SessionUser } from '../../../../packages/shared/partner';
import { ApiError, apiAddRoomNote, apiUploadRoomPhoto, type RoomPhoto } from './apiClient';
import { loadToken } from './localStore';
import { getStoredObject, listOutbox, listQueue, putObject, putQueueItem, removeQueueItem } from './offlineDb';
import {
  afterFailure,
  dueItems,
  newClientId,
  photoQueueBlock,
  type FieldQueueItem,
  type NotePayload,
  type PhotoPayload,
} from './offlineQueue';
import { blobToBase64, type PreparedBlobs } from './photos/imagePrep';

/** Событие окна: очередь изменилась (добавили, отправили, ошибка). */
export const QUEUE_EVENT = 'mf-field-queue';
/** Событие окна: фото из очереди дошло до сервера. detail: { objectId, clientId, photo }. */
export const PHOTO_SENT_EVENT = 'mf-photo-sent';

function announce(name: string, detail?: unknown) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export async function listMyQueue(userId: string): Promise<FieldQueueItem[]> {
  const rows = await listQueue().catch(() => [] as FieldQueueItem[]);
  return rows.filter((row) => row.userId === userId);
}

export async function enqueueNote(user: SessionUser, objectId: string, text: string): Promise<FieldQueueItem> {
  const item: FieldQueueItem = {
    id: newClientId('nt'),
    kind: 'note',
    objectId,
    userId: user.id,
    orgId: user.orgId || '',
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAt: 0,
    bytes: text.length * 2,
    payload: { text } satisfies NotePayload,
  };
  await putQueueItem(item);
  announce(QUEUE_EVENT);
  return item;
}

/** Свободное место на телефоне, байт; null — браузер не говорит. */
async function freeBytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || estimate.quota == null || estimate.usage == null) return null;
    return estimate.quota - estimate.usage;
  } catch {
    return null;
  }
}

/** Просим браузер не стирать очередь при нехватке места (Safari и Chrome это умеют). */
export async function askPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return;
    await navigator.storage?.persist?.();
  } catch {
    /* не обязательно */
  }
}

/** Можно ли взять в очередь ещё adding фото. Текст для человека или null. */
export async function photoQueueRoom(userId: string, adding: number): Promise<string | null> {
  const queued = (await listMyQueue(userId)).filter((row) => row.kind === 'photo').length;
  return photoQueueBlock({ queuedPhotos: queued, adding, freeBytes: await freeBytes() });
}

export async function enqueuePhoto(
  user: SessionUser,
  objectId: string,
  stage: PhotoStage,
  caption: string,
  prepared: PreparedBlobs,
): Promise<FieldQueueItem> {
  const item: FieldQueueItem = {
    id: newClientId('ph'),
    kind: 'photo',
    objectId,
    userId: user.id,
    orgId: user.orgId || '',
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAt: 0,
    bytes: prepared.bytes,
    payload: {
      stage,
      caption,
      image: prepared.image,
      thumb: prepared.thumb,
      width: prepared.width,
      height: prepared.height,
    } satisfies PhotoPayload,
  };
  await putQueueItem(item);
  void askPersistentStorage();
  announce(QUEUE_EVENT);
  return item;
}

export async function dropQueueItem(id: string): Promise<void> {
  await removeQueueItem(id);
  announce(QUEUE_EVENT);
}

/** Сетевой сбой или сервер недоступен: стоит повторить позже. */
function transient(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
}

export type FlushResult = 'ok' | 'auth' | 'offline' | 'idle';

/**
 * Отправка очереди. force — ручное «Отправить сейчас»: паузы и пометка «ошибка» не мешают.
 * Элемент комнаты, которая сама ещё ждёт отправки (outbox), пропускается до следующего раза.
 */
export async function flushFieldQueue(
  user: SessionUser,
  opts: { force?: boolean; onProgress?: (id: string, fraction: number) => void } = {},
): Promise<FlushResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (!loadToken()) return 'auth';
  const mine = await listMyQueue(user.id);
  if (!mine.length) return 'idle';
  const waitingRooms = new Set((await listOutbox().catch(() => [])).map((op) => op.id));
  const now = Date.now();
  let result: FlushResult = 'ok';
  for (const item of dueItems(mine, now, opts.force)) {
    if (waitingRooms.has(item.objectId)) continue;
    try {
      if (item.kind === 'note') {
        const payload = item.payload as NotePayload;
        const saved = await apiAddRoomNote(item.objectId, { text: payload.text, clientId: item.id, at: item.createdAt });
        const stored = await getStoredObject(item.objectId).catch(() => null);
        if (stored) await putObject({ ...stored, notes: saved.notes });
      } else {
        const payload = item.payload as PhotoPayload;
        const photo: RoomPhoto = await apiUploadRoomPhoto(
          item.objectId,
          {
            stage: payload.stage,
            caption: payload.caption,
            image: await blobToBase64(payload.image),
            thumb: await blobToBase64(payload.thumb),
            clientId: item.id,
          },
          (fraction) => opts.onProgress?.(item.id, fraction),
        );
        announce(PHOTO_SENT_EVENT, { objectId: item.objectId, clientId: item.id, photo });
      }
      await removeQueueItem(item.id);
      announce(QUEUE_EVENT);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return 'auth';
      const message = err instanceof Error ? err.message : 'Не удалось отправить';
      if (transient(err)) {
        await putQueueItem(afterFailure(item, Date.now(), message));
        announce(QUEUE_EVENT);
        // Связи нет: дальше по очереди не идём, порядок сохраняется.
        return 'offline';
      }
      // Сервер отказал (нет прав, комнату удалили): ждёт решения человека, остальные идут дальше.
      await putQueueItem({ ...item, attempts: item.attempts + 1, failed: true, lastError: message });
      announce(QUEUE_EVENT);
      result = 'ok';
    }
  }
  return result;
}

/**
 * Одна выгрузка на все вкладки: navigator.locks. Если выгрузка уже идёт, вторая не запускается.
 * Без navigator.locks — защита внутри вкладки.
 */
let localBusy = false;
export async function withSyncLock<T>(fn: () => Promise<T>): Promise<T | 'busy'> {
  const locks = (typeof navigator !== 'undefined' ? navigator.locks : undefined) as LockManager | undefined;
  if (locks?.request) {
    return locks.request('mf-partner-sync', { ifAvailable: true }, async (lock) => (lock ? fn() : ('busy' as const)));
  }
  if (localBusy) return 'busy';
  localBusy = true;
  try {
    return await fn();
  } finally {
    localBusy = false;
  }
}
