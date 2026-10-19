/**
 * Хранилище методических материалов.
 * Пишет и удаляет только MATERIALS_BUCKET. PARTNERS_BUCKET доступен лишь
 * для чтения старых ключей materials/<id> без поля bucket.
 */

import { MATERIAL_BUCKET_MARKER, materialBase, toPublicMaterial } from './materialsLib.js';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  listUploadedParts,
  signUploadPart,
  deleteObject,
  headObject,
  materialsBucket,
  materialsConfigError,
  partnerBucket,
  putObject,
  signGetObject,
  signPutObject,
  SIGNED_GET_TTL_SECONDS,
  SIGNED_PUT_TTL_SECONDS,
} from './objectStore.js';

export { MATERIAL_BUCKET_MARKER, SIGNED_GET_TTL_SECONDS, SIGNED_PUT_TTL_SECONDS, materialsConfigError };

const MATERIAL_KEY = /^materials\/mat_[a-z0-9_]+$/i;

export function assertMaterialKey(key) {
  if (!MATERIAL_KEY.test(String(key || ''))) {
    throw Object.assign(new Error('Некорректный ключ материала'), { status: 400 });
  }
}

function writableMaterialsBucket() {
  const message = materialsConfigError();
  if (message) throw Object.assign(new Error(message), { status: 503 });
  const bucket = materialsBucket();
  if (!bucket || bucket === partnerBucket()) {
    throw Object.assign(
      new Error('Ошибка конфигурации: MATERIALS_BUCKET совпадает с PARTNERS_BUCKET'),
      { status: 503 },
    );
  }
  return bucket;
}

export async function putMaterialBytes(key, body, contentType) {
  assertMaterialKey(key);
  const bucket = writableMaterialsBucket();
  await putObject({ bucket, key, body, contentType });
}

export async function deleteMaterialBytes(key) {
  assertMaterialKey(key);
  const bucket = writableMaterialsBucket();
  await deleteObject({ bucket, key });
}

/**
 * Подписанный PUT в MATERIALS_BUCKET под ключом materials/mat_*.
 * Content-Type в подпись не входит.
 * Браузерный PUT с другого origin требует CORS на бакете материалов
 * (AllowedMethod PUT, AllowedHeader Content-Type). Бакет этот модуль не меняет.
 */
export async function signMaterialUpload(key) {
  assertMaterialKey(key);
  const bucket = writableMaterialsBucket();
  const url = await signPutObject({ bucket, key, expiresIn: SIGNED_PUT_TTL_SECONDS });
  return { url, bucket, key, expiresIn: SIGNED_PUT_TTL_SECONDS };
}

/** Фактический размер и Content-Type уже загруженного объекта. */
export async function statMaterialObject(key) {
  assertMaterialKey(key);
  const bucket = writableMaterialsBucket();
  return headObject({ bucket, key });
}

/**
 * Inline только для типов, которые браузер не исполняет: PDF, растровые
 * картинки, видео, аудио. SVG, HTML и всё неизвестное — attachment и
 * application/octet-stream, чтобы ничего не выполнялось в origin бакета.
 */
export function isInlineMime(mime) {
  const value = String(mime || '').toLowerCase().split(';')[0].trim();
  if (value === 'image/svg+xml') return false;
  return (
    value === 'application/pdf' ||
    value.startsWith('image/') ||
    value.startsWith('video/') ||
    value.startsWith('audio/')
  );
}

function contentDisposition(filename, mime) {
  const clean = String(filename || 'file').replace(/[\r\n"]/g, '').slice(0, 180) || 'file';
  const extMatch = clean.match(/(\.[A-Za-z0-9]{1,8})$/);
  const ext = extMatch ? extMatch[1] : '';
  const asciiBody = clean
    .slice(0, clean.length - ext.length)
    .replace(/[^\x20-\x7E]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ascii = `${asciiBody || 'file'}${ext}`;
  const kind = isInlineMime(mime) ? 'inline' : 'attachment';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/**
 * Видео и аудио смотрят долго, а плеер докачивает файл кусками (Range) всё время просмотра.
 * Ссылка на 15 минут обрывала бы просмотр на середине — для медиа подпись живёт 6 часов.
 */
export const MEDIA_URL_TTL_SECONDS = 6 * 60 * 60;

export function isMediaMime(mime) {
  const value = String(mime || '').toLowerCase().split(';')[0].trim();
  return value.startsWith('video/') || value.startsWith('audio/');
}

/**
 * Подписанный GET. Новый узел (bucket: "materials") — MATERIALS_BUCKET.
 * Узел без bucket — только чтение старого ключа из PARTNERS_BUCKET.
 * @returns {Promise<string | null>}
 */
export async function signedMaterialGetUrl(node, { filename, mime } = {}) {
  const key = node?.storageKey;
  if (!key) return null;
  assertMaterialKey(key);
  const name = filename || node.name || 'file';
  const type = mime || node.mime || 'application/octet-stream';
  const responseContentDisposition = contentDisposition(name, type);
  const responseContentType = isInlineMime(type) ? type : 'application/octet-stream';
  const expiresIn = isMediaMime(type) ? MEDIA_URL_TTL_SECONDS : undefined;
  if (!node.bucket) {
    const bucket = partnerBucket();
    if (!bucket) return null;
    return signGetObject({
      bucket,
      key,
      responseContentType,
      responseContentDisposition,
      ...(expiresIn ? { expiresIn } : {}),
    });
  }
  if (node.bucket !== MATERIAL_BUCKET_MARKER) {
    throw Object.assign(new Error('Неизвестный бакет материала'), { status: 500 });
  }
  const bucket = writableMaterialsBucket();
  return signGetObject({
    bucket,
    key,
    responseContentType,
    responseContentDisposition,
    ...(expiresIn ? { expiresIn } : {}),
  });
}

/**
 * Подписанный GET копии видео для просмотра (materials/<id>_stream в MATERIALS_BUCKET).
 * Всегда video/mp4 inline, ссылка живёт 6 часов.
 * @returns {Promise<string | null>}
 */
export async function signedMaterialStreamUrl(node) {
  const key = node?.streamKey;
  if (!key) return null;
  assertMaterialKey(key);
  const bucket = writableMaterialsBucket();
  const base = String(node.name || 'video').replace(/\.[A-Za-z0-9]{1,8}$/, '');
  return signGetObject({
    bucket,
    key,
    responseContentType: 'video/mp4',
    responseContentDisposition: contentDisposition(`${base}.mp4`, 'video/mp4'),
    expiresIn: MEDIA_URL_TTL_SECONDS,
  });
}

export async function startMaterialMultipart(key, contentType) {
  assertMaterialKey(key);
  const bucket = writableMaterialsBucket();
  return createMultipartUpload({ bucket, key, contentType });
}

export async function signMaterialParts(key, uploadId, partNumbers) {
  assertMaterialKey(key);
  const bucket = writableMaterialsBucket();
  const urls = {};
  for (const partNumber of partNumbers) {
    urls[partNumber] = await signUploadPart({ bucket, key, uploadId, partNumber });
  }
  return { urls, expiresIn: SIGNED_PUT_TTL_SECONDS };
}

export async function listMaterialParts(key, uploadId) {
  assertMaterialKey(key);
  return listUploadedParts({ bucket: writableMaterialsBucket(), key, uploadId });
}

export async function completeMaterialMultipart(key, uploadId, parts) {
  assertMaterialKey(key);
  return completeMultipartUpload({ bucket: writableMaterialsBucket(), key, uploadId, parts });
}

export async function abortMaterialMultipart(key, uploadId) {
  assertMaterialKey(key);
  return abortMultipartUpload({ bucket: writableMaterialsBucket(), key, uploadId });
}

/** Ссылка на миниатюру живёт 6 ч; подпись от начала часа — ссылка не меняется весь час и кэшируется браузером. */
export const THUMB_URL_TTL_SECONDS = 6 * 60 * 60;
const THUMB_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

export function thumbSigningDate(now = Date.now()) {
  return new Date(Math.floor(now / 3_600_000) * 3_600_000);
}

/**
 * Подписанный GET миниатюры (materials/<id>_thumb в MATERIALS_BUCKET).
 * @returns {Promise<string | null>}
 */
export async function signedThumbnailUrl(node, { now } = {}) {
  const key = node?.thumbKey;
  if (!key) return null;
  assertMaterialKey(key);
  const bucket = writableMaterialsBucket();
  const type = THUMB_TYPES.has(node.thumbType) ? node.thumbType : 'image/webp';
  const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
  return signGetObject({
    bucket,
    key,
    responseContentType: type,
    responseContentDisposition: `inline; filename="thumbnail.${ext}"`,
    expiresIn: THUMB_URL_TTL_SECONDS,
    signingDate: thumbSigningDate(now),
  });
}

/**
 * Список материалов для ответа API: публичные поля + thumbnailUrl у файлов с миниатюрой.
 * Хранилище не настроено или подпись не удалась — thumbnailUrl: null, список всё равно отдаётся.
 */
export async function signedPublicMaterials(stored, { now } = {}) {
  const nodes = materialBase(stored);
  const ready = !materialsConfigError();
  return Promise.all(
    nodes.map(async (node) => {
      const item = toPublicMaterial(node);
      if (!item.hasThumbnail) return item;
      let thumbnailUrl = null;
      if (ready) {
        try {
          thumbnailUrl = (await signedThumbnailUrl(node, { now })) || null;
        } catch {
          thumbnailUrl = null;
        }
      }
      return { ...item, thumbnailUrl };
    }),
  );
}
