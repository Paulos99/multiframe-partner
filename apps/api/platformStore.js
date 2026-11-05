/**
 * Документы кабинета в Object Storage: platform-v2.json и analytics-events.json.
 *
 * Без бакета поведение прежнее: одна копия в памяти процесса и, если задан, локальный файл.
 * С бакетом память экземпляра — только кэш. Каждый запрос сверяет ETag через HeadObject
 * и при изменении перечитывает объект. Запись идёт с If-Match (или If-None-Match: * для
 * создания). Чужое изменение не затирается: diff от снимка на чтении накладывается на
 * свежую версию, при 412/409 цикл повторяется.
 *
 * Yandex Object Storage принимает If-Match на PutObject: запись проходит, только если
 * объект есть и его ETag совпал. Иначе 412, гонка во время загрузки — 409.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  headObject,
  isMissingObject,
  isStorageConflict,
  partnerBucket,
  putObject,
  readObjectText,
} from './objectStore.js';

const WRITE_ATTEMPTS = 8;
const ACTIVITY_CAP = 500;
const EVENTS_CAP = Number(process.env.ANALYTICS_EVENTS_CAP) || 20000;

const cacheSlots = new AsyncLocalStorage();
const rootCache = new Map();
/** @type {WeakMap<object, { base: any, etag: string | null }>} */
const origins = new WeakMap();
/** Значения из запасного варианта, которых нет в хранилище (локальный режим). */
const unsavedLocal = new WeakSet();

const ID_LISTS = new Set(['users', 'orgs', 'objects', 'projects', 'materials', 'roomShares']);
const LIST_CAPS = { history: 50, documents: 40, photos: 60 };

function cacheMap() {
  return cacheSlots.getStore() || rootCache;
}

function slot(key) {
  const map = cacheMap();
  let row = map.get(key);
  if (!row) {
    row = { loaded: false, etag: null, value: undefined, fallbackValue: undefined };
    map.set(key, row);
  }
  return row;
}

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function isPlain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlain(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
  return out;
}

function stable(value) {
  return JSON.stringify(canonicalize(value));
}

function same(a, b) {
  if (a === b) return true;
  // Копии одной записи сериализуются одинаково: канонический вид нужен только при расхождении порядка ключей.
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  return stable(a) === stable(b);
}

export function resetStoredDocumentsForTests() {
  cacheMap().clear();
}

/** Отдельная память экземпляра при общем хранилище. Контекст живёт через await. */
export function isolateDocumentCacheForTests() {
  const local = new Map();
  return {
    run(fn) {
      return cacheSlots.run(local, fn);
    },
  };
}

function indexById(list) {
  const map = new Map();
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    if (item && typeof item === 'object' && item.id != null && item.id !== '') map.set(item.id, item);
  }
  return map;
}

function itemKey(item) {
  if (item && typeof item === 'object' && item.id != null && item.id !== '') return `id:${item.id}`;
  return `json:${stable(item)}`;
}

function unionItems(base, desired, fresh, cap) {
  const baseArr = Array.isArray(base) ? base : [];
  const desiredArr = Array.isArray(desired) ? desired : [];
  const freshArr = Array.isArray(fresh) ? fresh : [];
  const baseKeys = new Set(baseArr.map(itemKey));
  const seen = new Set();
  const out = [];
  const push = (item) => {
    const key = itemKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  for (const item of desiredArr) {
    if (!baseKeys.has(itemKey(item))) push(item);
  }
  for (const item of freshArr) push(item);
  for (const item of desiredArr) push(item);
  return cap ? out.slice(0, cap) : out;
}

function stamp(row) {
  const t = Date.parse(row?.updatedAt || '');
  return Number.isNaN(t) ? null : t;
}

/** Равные метки пропускают входящую запись — так же, как incomingWins в API. */
function desiredWins(desired, fresh) {
  const left = stamp(desired);
  const right = stamp(fresh);
  if (left == null || right == null) return true;
  return left >= right;
}

function mergeFields(base, desired, fresh, desiredWinsConflicts) {
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(desired || {}),
    ...Object.keys(fresh || {}),
  ]);
  const out = {};
  for (const key of keys) {
    const b = base?.[key];
    const d = desired?.[key];
    const f = fresh?.[key];
    if (Object.prototype.hasOwnProperty.call(LIST_CAPS, key) && (Array.isArray(d) || Array.isArray(f))) {
      if (same(d, b)) out[key] = f;
      else if (f === undefined || same(f, b)) out[key] = d;
      else out[key] = unionItems(b, d, f, LIST_CAPS[key]);
      continue;
    }
    if (same(d, b)) {
      out[key] = f;
      continue;
    }
    if (f === undefined || same(f, b)) {
      out[key] = d;
      continue;
    }
    if (isPlain(d) && isPlain(f)) {
      out[key] = mergeFields(isPlain(b) ? b : {}, d, f, desiredWinsConflicts);
      continue;
    }
    out[key] = desiredWinsConflicts ? d : f;
  }
  return out;
}

function mergeRecord(base, desired, fresh) {
  if (!desired) return fresh;
  if (!fresh) return desired;
  if (!base) {
    if (same(desired, fresh)) return desired;
    return mergeFields({}, desired, fresh, desiredWins(desired, fresh));
  }
  if (same(desired, base)) return fresh;
  if (same(fresh, base)) return desired;
  return mergeFields(base, desired, fresh, desiredWins(desired, fresh));
}

function mergeIdList(base, desired, fresh, { cap, prependNew }) {
  if (base === undefined && desired === undefined) return fresh;
  if (!Array.isArray(base) && !Array.isArray(desired)) return Array.isArray(fresh) ? fresh : undefined;
  const baseArr = Array.isArray(base) ? base : [];
  const desiredArr = Array.isArray(desired) ? desired : [];
  const freshArr = Array.isArray(fresh) ? fresh : [];
  const baseMap = indexById(baseArr);
  const desiredMap = indexById(desiredArr);
  const freshMap = indexById(freshArr);
  const baseIds = new Set(baseMap.keys());
  const desiredIds = new Set(desiredMap.keys());
  const order = [];
  const seen = new Set();
  const pushId = (id) => {
    if (id == null || seen.has(id)) return;
    seen.add(id);
    order.push(id);
  };
  if (prependNew) {
    for (const item of desiredArr) {
      if (item?.id != null && !baseIds.has(item.id)) pushId(item.id);
    }
    for (const item of freshArr) {
      if (item?.id != null && !baseIds.has(item.id) && !desiredIds.has(item.id)) pushId(item.id);
    }
  }
  for (const item of freshArr) if (item?.id != null) pushId(item.id);
  for (const item of desiredArr) if (item?.id != null) pushId(item.id);

  const result = [];
  for (const id of order) {
    const b = baseMap.get(id);
    const d = desiredMap.get(id);
    const f = freshMap.get(id);
    const inBase = baseIds.has(id);
    const writerHas = desiredIds.has(id);
    if (inBase && !writerHas) {
      if (f && !same(f, b)) result.push(f);
      continue;
    }
    if (!writerHas) {
      if (f) result.push(f);
      continue;
    }
    result.push(mergeRecord(inBase ? b : undefined, d, f));
  }
  return cap ? result.slice(0, cap) : result;
}

export function mergePlatformDocument(base, desired, fresh) {
  const b = isPlain(base) ? base : {};
  const d = isPlain(desired) ? desired : {};
  const f = isPlain(fresh) ? fresh : {};
  const keys = new Set([...Object.keys(b), ...Object.keys(d), ...Object.keys(f)]);
  const out = {};
  for (const key of keys) {
    if (key === 'activity') {
      const merged = mergeIdList(b[key], d[key], f[key], { cap: ACTIVITY_CAP, prependNew: true });
      if (merged !== undefined) out[key] = merged;
      continue;
    }
    if (ID_LISTS.has(key)) {
      const merged = mergeIdList(b[key], d[key], f[key], {
        cap: null,
        prependNew: true,
      });
      if (merged !== undefined) out[key] = merged;
      continue;
    }
    if (d[key] === undefined && b[key] === undefined) {
      if (f[key] !== undefined) out[key] = f[key];
      continue;
    }
    if (same(d[key], b[key])) {
      if (f[key] !== undefined) out[key] = f[key];
      continue;
    }
    if (f[key] === undefined || same(f[key], b[key])) {
      out[key] = d[key];
      continue;
    }
    if (isPlain(d[key]) && isPlain(f[key])) {
      out[key] = mergeFields(isPlain(b[key]) ? b[key] : {}, d[key], f[key], desiredWins(d[key], f[key]));
      continue;
    }
    out[key] = desiredWins(d[key], f[key]) ? d[key] : f[key];
  }
  return out;
}

export function mergeEventList(base, desired, fresh, cap = EVENTS_CAP) {
  if (base === undefined && desired === undefined) return Array.isArray(fresh) ? fresh : [];
  return unionItems(base, desired, fresh, cap);
}

function assignMerged(target, merged) {
  if (target === merged) return target;
  if (Array.isArray(target) && Array.isArray(merged)) {
    target.splice(0, target.length, ...merged);
    return target;
  }
  if (isPlain(target) && isPlain(merged)) {
    for (const key of Object.keys(target)) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) delete target[key];
    }
    for (const key of Object.keys(merged)) target[key] = merged[key];
    return target;
  }
  return merged;
}

/**
 * Свежесть проверки версии. 0 — каждый запрос сверяет ETag (поведение по умолчанию и в тестах).
 * server.mjs ставит 300 мс: сотни запросов в секунду делят одну проверку и один разбор документа.
 */
function freshMs() {
  const n = Number(process.env.DOC_FRESH_MS);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseBody(spec, body) {
  const parsed = JSON.parse(body);
  return spec.normalize ? spec.normalize(parsed) : parsed;
}

/** Разобранное значение строки кэша. Общее для всех запросов и никем не меняется. */
function sharedValue(row, spec) {
  if (row.value === undefined || row.value === null) {
    row.value = parseBody(spec, row.body);
    if (process.env.MF_FREEZE_SHARED === '1') deepFreeze(row.value);
  }
  return row.value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

/**
 * Проверка версии в хранилище. Параллельные вызовы делят одну проверку (холодный старт:
 * двести запросов дают одно чтение документа, а не двести). { force } — не доверять свежести.
 * @returns {Promise<{ missing: true } | { missing: false, etag: string, row: object }>}
 */
async function readRemote(spec, { force = false } = {}) {
  const bucket = partnerBucket();
  const key = spec.key();
  const row = slot(key);
  if (!force && row.loaded && row.etag && row.checkedAt && Date.now() - row.checkedAt < freshMs()) {
    return { missing: false, etag: row.etag, row };
  }
  if (row.refreshing) {
    if (!force) return row.refreshing;
    await row.refreshing.catch(() => {});
    if (row.refreshing) return row.refreshing;
  }
  const run = (async () => {
    const head = await headObject({ bucket, key });
    if (head.missing) {
      row.loaded = false;
      row.etag = null;
      row.value = undefined;
      row.body = undefined;
      return { missing: true };
    }
    if (row.loaded && row.etag && head.etag && head.etag === row.etag) {
      row.checkedAt = Date.now();
      return { missing: false, etag: row.etag, row };
    }
    const got = await readObjectText({ bucket, key });
    if (got.missing || !got.body) return { missing: true };
    let value;
    try {
      value = parseBody(spec, got.body);
    } catch (error) {
      console.warn('document parse failed', key, error?.message || error);
      return { missing: true };
    }
    if (!spec.accept(value)) return { missing: true };
    const etag = head.etag || got.etag;
    row.loaded = true;
    row.body = got.body;
    row.value = value;
    if (process.env.MF_FREEZE_SHARED === '1') deepFreeze(value);
    row.etag = etag;
    row.checkedAt = Date.now();
    row.ownEtag = null;
    return { missing: false, etag, row };
  })();
  row.refreshing = run;
  try {
    return await run;
  } finally {
    if (row.refreshing === run) row.refreshing = null;
  }
}

async function loadLocal(spec) {
  const row = slot(spec.key());
  if (row.loaded) return row.value;
  const filePath = spec.filePath ? spec.filePath() : '';
  if (filePath) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      const value = spec.normalize ? spec.normalize(parsed) : parsed;
      if (spec.accept(value)) {
        row.value = value;
        row.loaded = true;
        return row.value;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn('document file load failed', error?.message || error);
    }
  }
  row.value = await spec.fallback();
  row.loaded = true;
  if (row.value && typeof row.value === 'object') unsavedLocal.add(row.value);
  return row.value;
}

/** Документ собран из запасного значения и ещё не записан в хранилище. */
export function isUnsavedDocument(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (unsavedLocal.has(doc)) return true;
  const origin = origins.get(doc);
  return Boolean(origin) && origin.etag === null;
}

function saveLocal(spec, value) {
  const row = slot(spec.key());
  row.value = value;
  row.loaded = true;
  row.etag = null;
  if (value && typeof value === 'object') unsavedLocal.delete(value);
  const filePath = spec.filePath ? spec.filePath() : '';
  if (!filePath) return;
  mkdirSync(dirname(filePath), { recursive: true });
  const body = spec.space ? JSON.stringify(value, null, spec.space) : JSON.stringify(value);
  writeFileSync(filePath, body);
}

/** Запасное значение для пустого хранилища: одно на всех, пока документ не появится. */
async function fallbackFor(spec, row) {
  if (row.fallbackValue !== undefined) return row.fallbackValue;
  if (!row.fallbackPromise) {
    row.fallbackPromise = Promise.resolve(spec.fallback()).then(
      (value) => {
        row.fallbackValue = value;
        row.fallbackPromise = null;
        return value;
      },
      (error) => {
        row.fallbackPromise = null;
        throw error;
      },
    );
  }
  return row.fallbackPromise;
}

/**
 * Общий разобранный документ для чтения: один экземпляр на версию, без копирования.
 * Менять его нельзя. Для изменений — loadStoredDocument (своя копия).
 * @returns {Promise<{ value: any, etag: string | null, own: boolean }>}
 */
export async function loadSharedDocument(spec) {
  if (!partnerBucket()) {
    return { value: await loadLocal(spec), etag: null, own: true, migrated: true, markMigrated() {}, runOnce: (fn) => Promise.resolve().then(fn) };
  }
  const remote = await readRemote(spec);
  const row = slot(spec.key());
  const describe = (value, etag) => ({
    value,
    etag,
    own: Boolean(etag) && row.ownEtag === etag,
    migrated: Boolean(etag) && row.migratedEtag === etag,
    markMigrated() {
      row.migratedEtag = etag;
    },
    /** Одна общая проверка миграций на версию документа: сотня запросов не разбирает файл заново. */
    runOnce(fn) {
      if (!row.flight || row.flight.etag !== etag) {
        const flight = { etag, promise: null };
        flight.promise = Promise.resolve()
          .then(fn)
          .catch((error) => {
            if (row.flight === flight) row.flight = null;
            throw error;
          });
        row.flight = flight;
      }
      return row.flight.promise;
    },
  });
  if (!remote.missing) return describe(sharedValue(remote.row, spec), remote.etag);
  if (row.loaded && row.etag && row.body !== undefined) return describe(sharedValue(row, spec), row.etag);
  return { ...describe(await fallbackFor(spec, row), null), own: false };
}

/** Версия документа без чтения тела (для ответов 304). */
export async function documentVersion(spec) {
  if (!partnerBucket()) return null;
  const remote = await readRemote(spec);
  return remote.missing ? null : remote.etag;
}

function makeOrigin(row, etag) {
  return { etag: etag || null, _body: row.body, _base: undefined };
}

function originBase(origin, spec) {
  if (origin._base === undefined) origin._base = origin._body ? parseBody(spec, origin._body) : undefined;
  return origin._base;
}

/** Свой изменяемый экземпляр документа. Разбор из строки в 3-4 раза дешевле structuredClone. */
export async function loadStoredDocument(spec) {
  if (!partnerBucket()) return loadLocal(spec);
  const remote = await readRemote(spec);
  if (!remote.missing) {
    const row = remote.row;
    const copy = parseBody(spec, row.body);
    origins.set(copy, { ...makeOrigin(row, remote.etag), base: sharedValue(row, spec) });
    return copy;
  }
  const row = slot(spec.key());
  if (row.loaded && row.etag && row.body !== undefined) {
    const copy = parseBody(spec, row.body);
    origins.set(copy, { ...makeOrigin(row, row.etag), base: sharedValue(row, spec) });
    return copy;
  }
  const fallback = await fallbackFor(spec, row);
  if (row.loaded && row.etag && row.body !== undefined) {
    const copy = parseBody(spec, row.body);
    origins.set(copy, { ...makeOrigin(row, row.etag), base: sharedValue(row, spec) });
    return copy;
  }
  const copy = clone(fallback);
  if (copy && typeof copy === 'object') origins.set(copy, { etag: null, base: clone(fallback), _body: undefined });
  return copy;
}

function retryableWrite(error) {
  return isStorageConflict(error) || isMissingObject(error);
}

/** Очередь записей одного документа внутри процесса: свои записи не мешают друг другу. */
function withWriteLock(row, fn) {
  const previous = row.writeChain || Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  row.writeChain = run.catch(() => {});
  return run;
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function saveStoredDocument(spec, value, loadedFrom) {
  if (!partnerBucket()) {
    saveLocal(spec, value);
    return value;
  }
  const origin = (loadedFrom && origins.get(loadedFrom)) || origins.get(value) || null;
  const bucket = partnerBucket();
  const key = spec.key();
  const row = slot(key);
  return withWriteLock(row, async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
      const remote = await readRemote(spec, { force: true });
      let next = value;
      if (!remote.missing && origin && (!origin.etag || origin.etag !== remote.etag)) {
        const fresh = parseBody(spec, remote.row.body);
        const base = origin.base !== undefined ? origin.base : originBase(origin, spec);
        next = spec.merge(base, value, fresh);
      }
      // В хранилище документ пишется без отступов: он вдвое меньше и быстрее читается.
      const body = JSON.stringify(next);
      try {
        const put = await putObject({
          bucket,
          key,
          body,
          contentType: 'application/json',
          ifMatch: remote.missing ? undefined : remote.etag,
          ifNoneMatch: remote.missing ? '*' : undefined,
        });
        const etag = put?.etag || null;
        const saved = assignMerged(value, next);
        row.loaded = true;
        row.etag = etag;
        row.body = body;
        row.value = undefined;
        row.checkedAt = Date.now();
        row.ownEtag = etag;
        row.fallbackValue = undefined;
        if (origin) {
          origin.etag = etag;
          origin._body = body;
          origin._base = undefined;
          origin.base = undefined;
        }
        return saved;
      } catch (error) {
        lastError = error;
        if (!retryableWrite(error) || attempt === WRITE_ATTEMPTS) throw error;
        console.warn('document write conflict, retry', key, attempt);
        // Запись из другого процесса: короткая пауза с разбросом, чтобы не биться синхронно.
        await pause(Math.floor(Math.random() * 40 * attempt));
      }
    }
    throw lastError || new Error('Не удалось записать документ');
  });
}
