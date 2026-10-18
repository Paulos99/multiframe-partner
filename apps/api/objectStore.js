/**
 * Низкоуровневый доступ к Yandex Object Storage.
 * Кабинет всегда передаёт PARTNERS_BUCKET. Материалы выбирают бакет отдельно.
 */

export const S3_ENDPOINT = 'https://storage.yandexcloud.net';
export const SIGNED_GET_TTL_SECONDS = 15 * 60;

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
  return {
    region: process.env.YC_REGION || 'ru-central1',
    endpoint: S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.YC_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.YC_SECRET_ACCESS_KEY || '',
    },
  };
}

/** @type {null | ((op: Record<string, any>) => Promise<any>)} */
let transportForTests = null;

export function setObjectStoreTransportForTests(fn) {
  transportForTests = fn;
}

export async function putObject({ bucket, key, body, contentType }) {
  if (transportForTests) {
    return transportForTests({ action: 'put', bucket, key, body, contentType });
  }
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }),
  );
}

export async function getObjectText({ bucket, key }) {
  if (transportForTests) {
    const out = await transportForTests({ action: 'get', bucket, key, encoding: 'utf8' });
    return out == null ? null : String(out);
  }
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return res.Body.transformToString();
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
}) {
  if (transportForTests) {
    const out = await transportForTests({
      action: 'sign-get',
      bucket,
      key,
      responseContentType,
      responseContentDisposition,
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
  return getSignedUrl(client, command, { expiresIn: SIGNED_GET_TTL_SECONDS });
}
