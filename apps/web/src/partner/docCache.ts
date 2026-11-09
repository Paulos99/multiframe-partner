/**
 * PDF назначенных комнат на телефоне: свежие профиль и смета каждой незакрытой комнаты, назначенной
 * человеку, кладутся в Cache Storage «mf-room-docs-v1». Без связи документ открывается из этой копии.
 * Предел — 50 МБ, при превышении первыми уходят самые старые файлы.
 */
import type { JobObject, JobObjectDocument, SessionUser } from '../../../../packages/shared/partner';
import { ApiError, apiFetchObjectDocument } from './apiClient';
import { DOC_CACHE_LIMIT_BYTES, evictForLimit, roomsToPrecache } from './offlineQueue';

const CACHE_NAME = 'mf-room-docs-v1';
const INDEX_KEY = 'mf_room_docs_index_v1';

type Entry = { key: string; bytes: number; at: number };
type DocBody = { id: string; filename: string; kind: string; pdfBase64: string };

const keyFor = (objectId: string, docId: string) => `/__mf-room-doc/${encodeURIComponent(objectId)}/${encodeURIComponent(docId)}`;

function readIndex(): Entry[] {
  try {
    const rows = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') as Entry[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeIndex(rows: Entry[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(rows));
  } catch {
    /* индекс не обязателен */
  }
}

function cachesReady(): boolean {
  return typeof caches !== 'undefined';
}

/** Свежие профиль и смета комнаты (без демо и без локальных копий). */
export function docsToKeep(room: JobObject): JobObjectDocument[] {
  const newest = new Map<string, JobObjectDocument>();
  for (const doc of room.documents || []) {
    if (doc.demo || doc.dataBase64 || doc.kind === 'offer' || doc.id.startsWith('q_')) continue;
    const kind = doc.kind === 'spec' ? 'estimate' : doc.kind;
    const cur = newest.get(kind);
    if (!cur || doc.createdAt > cur.createdAt) newest.set(kind, doc);
  }
  return [...newest.values()];
}

async function store(objectId: string, docId: string, body: DocBody): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const text = JSON.stringify(body);
  const key = keyFor(objectId, docId);
  await cache.put(key, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
  const index = readIndex().filter((row) => row.key !== key);
  index.push({ key, bytes: text.length, at: Date.now() });
  const drop = evictForLimit(index, DOC_CACHE_LIMIT_BYTES);
  for (const old of drop) await cache.delete(old);
  writeIndex(index.filter((row) => !drop.includes(row.key)));
}

async function cached(objectId: string, docId: string): Promise<DocBody | null> {
  if (!cachesReady()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(keyFor(objectId, docId));
    return hit ? ((await hit.json()) as DocBody) : null;
  } catch {
    return null;
  }
}

/** Документ с сервера, а без связи — копия с телефона. Удачная загрузка обновляет копию. */
export async function fetchDocumentWithCache(objectId: string, docId: string): Promise<DocBody> {
  try {
    const body = await apiFetchObjectDocument(objectId, docId);
    if (cachesReady()) void store(objectId, docId, body).catch(() => undefined);
    return body;
  } catch (err) {
    if (err instanceof ApiError && err.status !== 0) throw err;
    const copy = await cached(objectId, docId);
    if (copy) return copy;
    throw new Error('Нет связи, а копии этого документа на телефоне нет. Подключитесь к интернету и откройте его ещё раз.');
  }
}

/** Предзагрузка «на сегодня»: PDF назначенных незакрытых комнат, которых ещё нет на телефоне. */
export async function precacheRoomDocuments(rooms: JobObject[], user: SessionUser): Promise<number> {
  if (!cachesReady() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
  const have = new Set(readIndex().map((row) => row.key));
  let loaded = 0;
  for (const room of roomsToPrecache(rooms, user)) {
    for (const doc of docsToKeep(room)) {
      if (have.has(keyFor(room.id, doc.id))) continue;
      try {
        await store(room.id, doc.id, await apiFetchObjectDocument(room.id, doc.id));
        loaded += 1;
      } catch {
        return loaded;
      }
    }
  }
  return loaded;
}
