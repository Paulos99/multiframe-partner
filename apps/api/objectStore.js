/**
 * Низкоуровневый доступ к Yandex Object Storage.
 * Кабинет всегда передаёт PARTNERS_BUCKET. Материалы выбирают бакет отдельно.
 */
import { createHash } from 'node:crypto';

/** Адрес S3-совместимого хранилища. По умолчанию Yandex Object Storage; для MinIO/Selectel/Ceph задайте S3_ENDPOINT. */
export const DEFAULT_S3_ENDPOINT = 'https://storage.yandexcloud.net';
export const S3_ENDPOINT = DEFAULT_S3_ENDPOINT;

function envText(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}
export const SIGNED_GET_TTL_SECONDS = 15 * 60;
/** Прямая загрузка крупного файла: час на PUT, шлюз API этот объём не везёт. */
export const SIGNED_PUT_TTL_SECONDS = 60 * 60;

export function partnerBucket() {
  return String(process.env.PARTNERS_BUCKET || '').trim();
}

export function materialsBucket() {
  return String(process.env.MATERIALS_BUCKET || '').trim();
}

/** @returns {string | null} */
export function materialsConfigError() {
  const materials = materialsBucket();
  if (!materials) return 'Хранилище материалов не настроено';
  const partners = partnerBucket();
  if (partners && materials === partners) {
    return 'Ошибка конфигурации: MATERIALS_BUCKET совпадает с PARTNERS_BUCKET';
  }
  return null;
}

export function s3ClientConfig() {
  const forcePathStyle = ['1', 'true'].includes(envText('S3_FORCE_PATH_STYLE').toLowerCase());
  return {
    region: envText('S3_REGION', 'YC_REGION') || 'ru-central1',
    endpoint: envText('S3_ENDPOINT') || DEFAULT_S3_ENDPOINT,
    ...(forcePathStyle ? { forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: envText('S3_ACCESS_KEY_ID', 'YC_ACCESS_KEY_ID'),
      secretAccessKey: envText('S3_SECRET_ACCESS_KEY', 'YC_SECRET_ACCESS_KEY'),
    },
  };
}

/** @type {null | ((op: Record<string, any>) => Promise<any>)} */
let transportForTests = null;

export function setObjectStoreTransportForTests(fn) {
  transportForTests = fn;
}

/**
 * Своё хранилище только для двух документов платформы (platform-v2.json, analytics-events.json), например PostgreSQL.
 * Фото, PDF и материалы остаются в S3. Объект store:
 *   handles(key) -> boolean                       — берёт ли хранилище этот ключ
 *   head({ bucket, key })  -> { missing, etag }
 *   read({ bucket, key })  -> { missing, body, etag }
 *   put({ bucket, key, body, ifMatch, ifNoneMatch }) -> { etag }
 *       при несовпадении ifMatch (или если объект уже есть при ifNoneMatch '*') бросает ошибку со status 412
 * См. docs/handover/DATA_LAYER.md.
 */
let documentStore = null;

export function setDocumentStore(store) {
  documentStore = store || null;
}

function ownDocument(key) {
  return Boolean(documentStore && documentStore.handles(key));
}

/**
 * Точка подключения собственного хранилища (вместо S3): функция получает операцию
 * { action: 'get' | 'head' | 'put' | 'delete' | 'sign-get' | 'sign-put' | 'mpu-*', bucket, key, ... }.
 * См. docs/handover/DATA_LAYER.md. Для обычного S3-совместимого хранилища не нужна: хватит S3_ENDPOINT.
 */
export const setObjectStoreTransport = setObjectStoreTransportForTests;

/** ETag как у одиночного PutObject: MD5 в кавычках. Для тестов и запасного значения. */
export function documentEtag(body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''), 'utf8');
  return `"${createHash('md5').update(buf).digest('hex')}"`;
}

/** Head/Get/Put отдают ETag то с кавычками, то без. If-Match ждёт значение в кавычках. */
export function normalizeEtag(etag) {
  if (etag == null) return null;
  let raw = String(etag).trim();
  if (!raw) return null;
  if (/^W\//i.test(raw)) raw = raw.slice(2).trim();
  if (raw.startsWith('"') && raw.endsWith('"')) return raw;
  return `"${raw.replace(/"/g, '')}"`;
}

export function isMissingObject(error) {
  const status = Number(error?.status || error?.statusCode || error?.$metadata?.httpStatusCode || 0);
  const name = String(error?.name || '');
  const code = String(error?.Code || error?.code || '');
  return status === 404 || name === 'NotFound' || name === 'NoSuchKey' || code === 'NoSuchKey' || code === 'NotFound';
}

/** 412 — условие If-Match/If-None-Match не выполнено. 409 — объект изменился во время загрузки. */
export function isStorageConflict(error) {
  const status = Number(error?.status || error?.statusCode || error?.$metadata?.httpStatusCode || 0);
  const name = String(error?.name || '');
  const code = String(error?.Code || error?.code || '');
  return (
    status === 412 ||
    status === 409 ||
    name === 'PreconditionFailed' ||
    name === 'ConditionalRequestConflict' ||
    code === 'PreconditionFailed' ||
    code === 'ConditionalRequestConflict'
  );
}

export async function putObject({ bucket, key, body, contentType, ifMatch, ifNoneMatch }) {
  if (ownDocument(key)) {
    const out = await documentStore.put({ bucket, key, body, ifMatch: normalizeEtag(ifMatch), ifNoneMatch });
    return { etag: normalizeEtag(out?.etag) || documentEtag(body) };
  }
  if (transportForTests) {
    const out = await transportForTests({
      action: 'put',
      bucket,
      key,
      body,
      contentType,
      ifMatch,
      ifNoneMatch,
    });
    if (out && typeof out === 'object' && out.etag) return { etag: normalizeEtag(out.etag) };
    return { etag: documentEtag(body) };
  }
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  const res = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      ...(ifMatch ? { IfMatch: normalizeEtag(ifMatch) } : {}),
      ...(ifNoneMatch ? { IfNoneMatch: ifNoneMatch } : {}),
    }),
  );
  return { etag: normalizeEtag(res.ETag) || documentEtag(body) };
}

export async function getObjectText({ bucket, key }) {
  const got = await readObjectText({ bucket, key });
  return got.missing ? null : got.body;
}

export async function readObjectText({ bucket, key }) {
  if (ownDocument(key)) {
    const out = await documentStore.read({ bucket, key });
    if (!out || out.missing) return { missing: true, body: null, etag: null };
    return { missing: false, body: String(out.body), etag: normalizeEtag(out.etag) || documentEtag(out.body) };
  }
  if (transportForTests) {
    const out = await transportForTests({ action: 'get', bucket, key, encoding: 'utf8' });
    if (out == null) return { missing: true, body: null, etag: null };
    const body = Buffer.isBuffer(out) ? out.toString('utf8') : String(out);
    return { missing: false, body, etag: documentEtag(body) };
  }
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await res.Body.transformToString();
    return { missing: false, body, etag: normalizeEtag(res.ETag) || documentEtag(body) };
  } catch (error) {
    if (isMissingObject(error)) return { missing: true, body: null, etag: null };
    throw error;
  }
}

export async function headObject({ bucket, key }) {
  if (ownDocument(key)) {
    const out = await documentStore.head({ bucket, key });
    if (!out || out.missing) return { missing: true, etag: null, contentLength: null, contentType: null };
    return { missing: false, etag: normalizeEtag(out.etag), contentLength: null, contentType: 'application/json' };
  }
  if (transportForTests) {
    const out = await transportForTests({ action: 'head', bucket, key });
    if (out && typeof out === 'object') {
      return {
        missing: Boolean(out.missing),
        etag: out.missing ? null : normalizeEtag(out.etag),
        contentLength: out.missing ? null : numberOrNull(out.contentLength),
        contentType: out.missing ? null : out.contentType || null,
      };
    }
    return { missing: true, etag: null, contentLength: null, contentType: null };
  }
  const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      missing: false,
      etag: normalizeEtag(res.ETag),
      contentLength: numberOrNull(res.ContentLength),
      contentType: res.ContentType || null,
    };
  } catch (error) {
    if (isMissingObject(error)) {
      return { missing: true, etag: null, contentLength: null, contentType: null };
    }
    throw error;
  }
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getObjectBuffer({ bucket, key }) {
  if (transportForTests) {
    const out = await transportForTests({ action: 'get', bucket, key });
    if (out == null) return null;
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  }
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function deleteObject({ bucket, key }) {
  if (transportForTests) {
    return transportForTests({ action: 'delete', bucket, key });
  }
  const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function signGetObject({
  bucket,
  key,
  responseContentType,
  responseContentDisposition,
  expiresIn,
  signingDate,
}) {
  if (transportForTests) {
    const out = await transportForTests({
      action: 'sign-get',
      bucket,
      key,
      responseContentType,
      responseContentDisposition,
      ...(expiresIn ? { expiresIn } : {}),
      ...(signingDate ? { signingDate } : {}),
    });
    return out == null ? '' : String(out);
  }
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    ...s3ClientConfig(),
    // Yandex Object Storage не принимает контрольные суммы, которые SDK добавляет по умолчанию.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(responseContentType ? { ResponseContentType: responseContentType } : {}),
    ...(responseContentDisposition
      ? { ResponseContentDisposition: responseContentDisposition }
      : {}),
  });
  return getSignedUrl(client, command, {
    expiresIn: expiresIn || SIGNED_GET_TTL_SECONDS,
    ...(signingDate ? { signingDate } : {}),
  });
}

/**
 * Подписанный PUT без Content-Type в каноническом запросе.
 * Клиент передаёт тип сам, подтверждение читает его через HeadObject.
 * Иначе подпись не сойдётся, если браузер подставит свой Content-Type.
 */
export async function signPutObject({ bucket, key, expiresIn }) {
  if (transportForTests) {
    const out = await transportForTests({
      action: 'sign-put',
      bucket,
      key,
      expiresIn: expiresIn || SIGNED_PUT_TTL_SECONDS,
    });
    return out == null ? '' : String(out);
  }
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    ...s3ClientConfig(),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const command = new PutObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresIn || SIGNED_PUT_TTL_SECONDS });
}

function multipartClientConfig() {
  return {
    ...s3ClientConfig(),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
}

/** Начать multipart-загрузку. @returns {Promise<string>} uploadId */
export async function createMultipartUpload({ bucket, key, contentType }) {
  if (transportForTests) {
    const out = await transportForTests({ action: 'mpu-create', bucket, key, contentType });
    return String(out?.uploadId || out || '');
  }
  const { S3Client, CreateMultipartUploadCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(multipartClientConfig());
  const res = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    }),
  );
  return String(res.UploadId || '');
}

/** Подписанный PUT одной части. */
export async function signUploadPart({ bucket, key, uploadId, partNumber, expiresIn }) {
  if (transportForTests) {
    const out = await transportForTests({ action: 'mpu-sign-part', bucket, key, uploadId, partNumber });
    return out == null ? '' : String(out);
  }
  const { S3Client, UploadPartCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client(multipartClientConfig());
  const command = new UploadPartCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(client, command, { expiresIn: expiresIn || SIGNED_PUT_TTL_SECONDS });
}

/** Уже загруженные части (для докачки). */
export async function listUploadedParts({ bucket, key, uploadId }) {
  if (transportForTests) {
    const out = await transportForTests({ action: 'mpu-list', bucket, key, uploadId });
    return Array.isArray(out) ? out : [];
  }
  const { S3Client, ListPartsCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(multipartClientConfig());
  const parts = [];
  let marker;
  for (;;) {
    const res = await client.send(
      new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }),
    );
    for (const part of res.Parts || []) {
      parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size });
    }
    if (!res.IsTruncated) break;
    marker = res.NextPartNumberMarker;
  }
  return parts;
}

export async function completeMultipartUpload({ bucket, key, uploadId, parts }) {
  if (transportForTests) {
    await transportForTests({ action: 'mpu-complete', bucket, key, uploadId, parts });
    return;
  }
  const { S3Client, CompleteMultipartUploadCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(multipartClientConfig());
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }),
  );
}

export async function abortMultipartUpload({ bucket, key, uploadId }) {
  if (transportForTests) {
    await transportForTests({ action: 'mpu-abort', bucket, key, uploadId });
    return;
  }
  const { S3Client, AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(multipartClientConfig());
  await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
}
