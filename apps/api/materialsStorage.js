/**
 * Хранилище методических материалов.
 * Пишет и удаляет только MATERIALS_BUCKET. PARTNERS_BUCKET доступен лишь
 * для чтения старых ключей materials/<id> без поля bucket.
 */

import { MATERIAL_BUCKET_MARKER } from './materialsLib.js';
import {
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

function isInlineMime(mime) {
  const value = String(mime || '').toLowerCase();
  return value === 'application/pdf' || value.startsWith('image/') || value.startsWith('video/');
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
  const responseContentType = type;
  if (!node.bucket) {
    const bucket = partnerBucket();
    if (!bucket) return null;
    return signGetObject({
      bucket,
      key,
      responseContentType,
      responseContentDisposition,
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
  });
}
