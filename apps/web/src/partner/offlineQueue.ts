/**
 * Работа без связи: правила очереди, пределов и предупреждений. Здесь только чистые функции
 * без IndexedDB и сети, их проверяет offlineQueue.test.ts.
 *
 * Что лежит в очередях на телефоне:
 *  • outbox (IndexedDB) — правки комнат: площадь, ответы, этап;
 *  • projectOutbox — правки проектов;
 *  • queue — заметки и фото (фото как Blob, уже сжатые);
 *  • очередь PDF калькулятора (localStorage, до переноса — этап 3 плана).
 * Порядок отправки: комнаты и проекты, потом заметки, потом фото, потом PDF.
 */
import type { PhotoStage } from '../../../../packages/shared/roomPhotos.js';

export type NotePayload = { text: string };
export type PhotoPayload = {
  stage: PhotoStage;
  caption: string;
  image: Blob;
  thumb: Blob;
  width: number;
  height: number;
};

export type FieldQueueItem = {
  /** Клиентский идентификатор, он же ключ повтора на сервере. */
  id: string;
  kind: 'note' | 'photo';
  objectId: string;
  userId: string;
  orgId: string;
  createdAt: string;
  attempts: number;
  /** Не раньше этого времени (мс) пробовать снова. */
  nextAt: number;
  lastError?: string;
  /** После MAX_ATTEMPTS неудач элемент ждёт ручного «Повторить». */
  failed?: boolean;
  bytes: number;
  payload: NotePayload | PhotoPayload;
};

/** Паузы между попытками: 5 с, 30 с, 2 мин, 10 мин. */
export const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000] as const;
export const MAX_ATTEMPTS = 5;
/** Сколько фото может ждать отправки на телефоне. */
export const QUEUE_PHOTO_LIMIT = 300;
/** Если на телефоне свободно меньше, новые фото в очередь не берём. */
export const MIN_FREE_BYTES = 50 * 1024 * 1024;
/** Предел кэша PDF назначенных комнат. */
export const DOC_CACHE_LIMIT_BYTES = 50 * 1024 * 1024;
/** Без связи дольше суток — предупреждение. */
export const STALE_SYNC_MS = 24 * 60 * 60 * 1000;
/** Повтор выгрузки, пока что-то ждёт отправки. */
export const AUTO_SYNC_INTERVAL_MS = 60_000;

const KIND_ORDER: Record<FieldQueueItem['kind'], number> = { note: 0, photo: 1 };

export function newClientId(prefix: 'ph' | 'nt'): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** Порядок отправки: заметки раньше фото, внутри вида — по времени создания. */
export function orderQueue<T extends Pick<FieldQueueItem, 'kind' | 'createdAt'>>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0),
  );
}

/** Что пора отправлять сейчас. force — ручное «Отправить сейчас»: паузы и пометка «ошибка» не мешают. */
export function dueItems<T extends Pick<FieldQueueItem, 'kind' | 'createdAt' | 'nextAt' | 'failed'>>(
  items: T[],
  now: number,
  force = false,
): T[] {
  return orderQueue(items.filter((item) => force || (!item.failed && item.nextAt <= now)));
}

/** Следующая попытка после неудачи. */
export function afterFailure<T extends Pick<FieldQueueItem, 'attempts' | 'nextAt' | 'failed' | 'lastError'>>(
  item: T,
  now: number,
  error: string,
): T {
  const attempts = item.attempts + 1;
  const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]!;
  return { ...item, attempts, nextAt: now + delay, failed: attempts >= MAX_ATTEMPTS, lastError: error };
}

/** Можно ли взять ещё фото в очередь. Возвращает текст для человека или null. */
export function photoQueueBlock(input: {
  queuedPhotos: number;
  adding: number;
  freeBytes: number | null;
}): string | null {
  if (input.queuedPhotos + input.adding > QUEUE_PHOTO_LIMIT) {
    const room = Math.max(0, QUEUE_PHOTO_LIMIT - input.queuedPhotos);
    return room > 0
      ? `На телефоне уже ${input.queuedPhotos} ${plural(input.queuedPhotos, 'фото', 'фото', 'фото')} ждут отправки, можно добавить ещё ${room}. Подключитесь к интернету, чтобы отправить их.`
      : `На телефоне уже ${QUEUE_PHOTO_LIMIT} фото ждут отправки — это предел. Подключитесь к интернету, чтобы отправить их, потом снимайте дальше.`;
  }
  if (input.freeBytes != null && input.freeBytes < MIN_FREE_BYTES) {
    return 'На телефоне заканчивается память: свободно меньше 50 МБ. Освободите место или подключитесь к интернету, чтобы отправить фото.';
  }
  return null;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export type PendingCounts = { rooms: number; projects: number; notes: number; photos: number; documents: number };

export function pendingTotal(counts: PendingCounts): number {
  return counts.rooms + counts.projects + counts.notes + counts.photos + counts.documents;
}

/** «3 фото, 1 комната» — для подсказки индикатора. */
export function pendingSummary(counts: PendingCounts): string {
  const parts: string[] = [];
  if (counts.photos) parts.push(`${counts.photos} фото`);
  if (counts.rooms) parts.push(`${counts.rooms} ${plural(counts.rooms, 'комната', 'комнаты', 'комнат')}`);
  if (counts.notes) parts.push(`${counts.notes} ${plural(counts.notes, 'заметка', 'заметки', 'заметок')}`);
  if (counts.projects) parts.push(`${counts.projects} ${plural(counts.projects, 'проект', 'проекта', 'проектов')}`);
  if (counts.documents) parts.push(`${counts.documents} PDF`);
  return parts.join(', ');
}

export type SyncState = 'offline' | 'pending' | 'done';

/** Три состояния индикатора: «Нет связи», «Ждёт отправки», «Всё отправлено». */
export function syncState(online: boolean, pending: number): SyncState {
  if (!online) return 'offline';
  return pending > 0 ? 'pending' : 'done';
}

export function syncLabel(state: SyncState, pending: number): string {
  if (state === 'offline') return pending > 0 ? `Нет связи · ждёт отправки: ${pending}` : 'Нет связи';
  if (state === 'pending') return `Ждёт отправки: ${pending}`;
  return 'Всё отправлено';
}

/**
 * Полоса-напоминание. Показывается, когда ждут отправки 2 и больше объектов или последняя удачная
 * отправка была больше суток назад. null — ничего не показывать.
 */
export function syncBanner(input: {
  pending: number;
  lastSyncAt: string | null;
  now: number;
  online: boolean;
}): { tone: 'warn'; text: string } | null {
  const last = input.lastSyncAt ? Date.parse(input.lastSyncAt) : NaN;
  const stale = Number.isFinite(last) && input.now - last > STALE_SYNC_MS;
  if (input.pending < 2 && !stale) return null;
  if (input.pending > 0) {
    const what = `${input.pending} ${plural(input.pending, 'объект', 'объекта', 'объектов')}`;
    return {
      tone: 'warn',
      text: input.online
        ? `Данные ещё не отправлены: ждут отправки ${what}. Повторим сами, можно нажать «Отправить сейчас».`
        : `Подключитесь к интернету, чтобы отправить данные: ждут отправки ${what}.`,
    };
  }
  return {
    tone: 'warn',
    text: 'Вы больше суток не были на связи. Подключитесь к интернету, чтобы получить свежие данные по комнатам.',
  };
}

const LAST_SYNC_KEY = 'mf_partner_last_sync_v1';

/** Время последней удачной отправки и загрузки с сервера. Хранится на телефоне, по пользователю. */
export function readLastSync(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return typeof map[userId] === 'string' ? map[userId]! : null;
  } catch {
    return null;
  }
}

export function writeLastSync(userId: string, at: string): void {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[userId] = at;
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(map));
  } catch {
    /* хранилище недоступно */
  }
}

/** «обновлено в 08:40» или «обновлено 8 ноября в 08:40». */
export function lastSyncLine(lastSyncAt: string | null, now: number): string {
  if (!lastSyncAt) return 'С сервером ещё не связывались';
  const at = new Date(lastSyncAt);
  if (Number.isNaN(at.getTime())) return 'С сервером ещё не связывались';
  const time = at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const sameDay = new Date(now).toDateString() === at.toDateString();
  if (sameDay) return `Данные с сервера: сегодня в ${time}`;
  const day = at.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return `Данные с сервера: ${day} в ${time}`;
}

/** Комнаты «на сегодня» для предзагрузки: назначенные человеку и не закрытые. */
export function roomsToPrecache<T extends { assignedTo: string | null; status: string }>(
  rooms: T[],
  user: { id: string; role: string },
): T[] {
  return rooms.filter(
    (room) => room.status !== 'closed' && (room.assignedTo === user.id || user.role === 'measurer' || user.role === 'crew'),
  );
}

/** Какие файлы выкинуть из кэша документов, чтобы уложиться в предел: сначала самые старые. */
export function evictForLimit<T extends { key: string; bytes: number; at: number }>(
  entries: T[],
  limit = DOC_CACHE_LIMIT_BYTES,
): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const drop: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.at - b.at)) {
    if (total <= limit) break;
    total -= entry.bytes;
    drop.push(entry.key);
  }
  return drop;
}
