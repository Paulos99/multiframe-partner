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
const OBJECTS_CAP = 5000;
const ACTIVITY_CAP = 500;
const EVENTS_CAP = 5000;

const cacheSlots = new AsyncLocalStorage();
const rootCache = new Map();
/** @type {WeakMap<object, { base: any, etag: string | null }>} */
const origins = new WeakMap();

const ID_LISTS = new Set(['users', 'orgs', 'objects', 'projects', 'materials', 'roomShares']);
const LIST_CAPS = { history: 50, documents: 40 };

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
  return stable(a) === stable(b);
}

function handout(value, etag) {
  const base = clone(value);
  const copy = clone(value);
  if (copy && typeof copy === 'object') origins.set(copy, { base, etag: etag || null });
  return copy;
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
        cap: key === 'objects' ? OBJECTS_CAP : null,
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

export function mergeEventList(base, desired, fresh) {
  if (base === undefined && desired === undefined) return Array.isArray(fresh) ? fresh : [];
  return unionItems(base, desired, fresh, EVENTS_CAP);
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

async function readRemote(spec) {
  const bucket = partnerBucket();
  const key = spec.key();
  const row = slot(key);
  const head = await headObject({ bucket, key });
  if (head.missing) {
    row.loaded = false;
    row.etag = null;
    row.value = undefined;
    return { missing: true };
  }
  if (row.loaded && row.etag && head.etag && head.etag === row.etag) {
    return { missing: false, value: row.value, etag: row.etag };
  }
  const got = await readObjectText({ bucket, key });
  if (got.missing || !got.body) return { missing: true };
  let parsed;
  try {
    parsed = JSON.parse(got.body);
  } catch (error) {
    console.warn('document parse failed', key, error?.message || error);
    return { missing: true };
  }
  const value = spec.normalize ? spec.normalize(parsed) : parsed;
  if (!spec.accept(value)) return { missing: true };
  const etag = head.etag || got.etag;
  row.loaded = true;
  row.value = value;
  row.etag = etag;
  return { missing: false, value, etag };
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
  return row.value;
}

function saveLocal(spec, value) {
  const row = slot(spec.key());
  row.value = value;
  row.loaded = true;
  row.etag = null;
  const filePath = spec.filePath ? spec.filePath() : '';
  if (!filePath) return;
  mkdirSync(dirname(filePath), { recursive: true });
  const body = spec.space ? JSON.stringify(value, null, spec.space) : JSON.stringify(value);
  writeFileSync(filePath, body);
}

export async function loadStoredDocument(spec) {
  if (!partnerBucket()) return loadLocal(spec);
  const remote = await readRemote(spec);
  if (!remote.missing) return handout(remote.value, remote.etag);
  const row = slot(spec.key());
  if (row.loaded && row.etag) return handout(row.value, row.etag);
  if (row.fallbackValue === undefined) {
    row.fallbackValue = await spec.fallback();
    if (row.loaded && row.etag) return handout(row.value, row.etag);
  }
  return handout(row.fallbackValue, null);
}

function retryableWrite(error) {
  return isStorageConflict(error) || isMissingObject(error);
}

export async function saveStoredDocument(spec, value, loadedFrom) {
  if (!partnerBucket()) {
    saveLocal(spec, value);
    return value;
  }
  const origin = (loadedFrom && origins.get(loadedFrom)) || origins.get(value) || null;
  const bucket = partnerBucket();
  const key = spec.key();
  let lastError = null;
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
    const remote = await readRemote(spec);
    let next = value;
    if (!remote.missing && origin && (!origin.etag || origin.etag !== remote.etag)) {
      next = spec.merge(origin.base, value, remote.value);
    }
    const body = spec.space ? JSON.stringify(next, null, spec.space) : JSON.stringify(next);
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
      const row = slot(key);
      row.loaded = true;
      row.etag = etag;
      row.value = clone(next);
      row.fallbackValue = undefined;
      if (origin) {
        origin.base = clone(next);
        origin.etag = etag;
      }
      return saved;
    } catch (error) {
      lastError = error;
      if (!retryableWrite(error) || attempt === WRITE_ATTEMPTS) throw error;
      console.warn('document write conflict, retry', key, attempt);
    }
  }
  throw lastError || new Error('Не удалось записать документ');
}
