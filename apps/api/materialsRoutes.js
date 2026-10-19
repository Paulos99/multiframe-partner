/**
 * HTTP для методических материалов.
 * Чтение — любая роль кабинета. Изменения — только admin.
 * Новые файлы пишутся только в MATERIALS_BUCKET, метаданные — в platform.materials.
 * Старый узел без поля bucket читается из PARTNERS_BUCKET и оттуда не удаляется.
 * Пока админ ничего не менял, отдаём демо-набор и не пишем его в бакет.
 */

import {
  MATERIAL_BUCKET_MARKER,
  MATERIAL_DIRECT_MAX_BYTES,
  MATERIAL_MAX_PARTS,
  addFile,
  materialPartSize,
  createFolder,
  deleteMaterial,
  findMaterial,
  materialBase,
  renameMaterial,
  replaceFile,
} from './materialsLib.js';
import {
  abortMaterialMultipart,
  completeMaterialMultipart,
  deleteMaterialBytes,
  listMaterialParts,
  signMaterialParts,
  startMaterialMultipart,
  materialsConfigError,
  putMaterialBytes,
  signMaterialUpload,
  signedMaterialGetUrl,
  signedPublicMaterials,
  statMaterialObject,
} from './materialsStorage.js';

const MAX_FILE_BYTES = 2_000_000;
const MAX_BASE64 = 2_800_000;

const READ_ROLES = ['admin', 'owner', 'sales', 'measurer', 'crew'];

/** Белого списка типов нет: загрузить можно любой файл. Тип только для показа. */
const EXT_MIME = {
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  txt: 'text/plain',
  zip: 'application/zip',
};

function safeId(id) {
  return /^mat_[a-z0-9_]+$/i.test(String(id || ''));
}

function mimeOf(value, filename) {
  const raw = String(value || '').toLowerCase().split(';')[0].trim();
  if (/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(raw) && raw !== 'application/octet-stream' && raw !== 'binary/octet-stream') {
    return raw;
  }
  const ext = String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return (ext && EXT_MIME[ext[1]]) || 'application/octet-stream';
}

function decodeFile(body) {
  const b64 = String(body.contentBase64 || '').replace(/^data:[^,]*,/, '');
  if (!b64) return { error: 'Файл пустой' };
  if (b64.length > MAX_BASE64) {
    return { error: 'Файл больше 2 МБ. Крупнее текущий шлюз API не примет.' };
  }
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) return { error: 'Файл пустой' };
  if (buf.length > MAX_FILE_BYTES) {
    return { error: 'Файл больше 2 МБ. Крупнее текущий шлюз API не примет.' };
  }
  return { buf, mime: mimeOf(body.mime, body.name) };
}

function storageUnavailable(ctx) {
  const message = materialsConfigError();
  if (!message) return null;
  return ctx.json(503, { message });
}

/** Реальный Content-Type с объекта; octet-stream уточняем по имени файла. */
function mimeFromStored(contentType, filename) {
  return mimeOf(contentType, filename);
}

async function registerUploadedMaterial(ctx, platform, body) {
  let head;
  try {
    head = await statMaterialObject(body.storageKey);
  } catch (error) {
    const status = error.status || 500;
    return ctx.json(status, { message: error.message || 'Некорректный ключ материала' });
  }
  if (head.missing) return ctx.json(404, { message: 'Файл не найден в хранилище' });
  if (head.contentLength == null) return ctx.json(502, { message: 'Не удалось прочитать размер файла' });
  if (head.contentLength < 1) return ctx.json(400, { message: 'Файл пустой' });
  if (head.contentLength > MATERIAL_DIRECT_MAX_BYTES) {
    return ctx.json(413, { message: 'Файл больше 5 ТБ' });
  }
  const mime = mimeFromStored(head.contentType, body.name);
  const key = String(body.storageKey);
  const id = key.slice('materials/'.length);
  if (!safeId(id)) return ctx.json(400, { message: 'Некорректный ключ материала' });
  if (materialBase(platform.materials).some((node) => node.storageKey === key)) {
    return ctx.json(409, { message: 'Файл уже зарегистрирован' });
  }
  const result = addFile(platform.materials, {
    name: body.name,
    parentId: body.parentId || null,
    id,
    mime,
    size: head.contentLength,
    storageKey: key,
    bucket: MATERIAL_BUCKET_MARKER,
    now: new Date().toISOString(),
  });
  if (!result.ok) return ctx.json(400, { message: result.message });
  platform.materials = result.nodes;
  await ctx.savePlatform(platform);
  return ctx.json(200, { materials: await signedPublicMaterials(platform.materials) });
}

async function signedContent(ctx, node) {
  try {
    const url = await signedMaterialGetUrl(node, { filename: node.name, mime: node.mime });
    if (!url) return ctx.json(404, { message: 'Файл не найден в хранилище' });
    return ctx.json(200, { name: node.name, mime: node.mime, url });
  } catch (error) {
    const status = error.status || 500;
    return ctx.json(status, { message: error.message || 'Не удалось выдать ссылку' });
  }
}

/**
 * @returns {Promise<null | {statusCode:number, headers:object, body:string}>}
 */
export async function handleMaterials(ctx) {
  const { path, method } = ctx;
  const isMaterials =
    path === '/materials' ||
    path.endsWith('/materials') ||
    /\/materials\/files\/upload-url$/.test(path) ||
    /\/materials\/files\/multipart(\/(parts|complete|abort))?$/.test(path) ||
    /\/materials\/(folders|files)$/.test(path) ||
    /\/materials\/[^/]+$/.test(path) ||
    /\/materials\/[^/]+\/content$/.test(path);
  if (!isMaterials) return null;

  if (method === 'GET' && (path === '/materials' || path.endsWith('/materials'))) {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, READ_ROLES);
    return ctx.json(200, { materials: await signedPublicMaterials(platform.materials) });
  }

  if (method === 'POST' && /\/materials\/folders$/.test(path)) {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, ['admin']);
    const body = ctx.getBody();
    const now = new Date().toISOString();
    const result = createFolder(platform.materials, {
      name: body.name,
      parentId: body.parentId || null,
      id: ctx.uid('mat'),
      now,
    });
    if (!result.ok) return ctx.json(400, { message: result.message });
    platform.materials = result.nodes;
    await ctx.savePlatform(platform);
    return ctx.json(200, { materials: await signedPublicMaterials(platform.materials) });
  }

  if (method === 'POST' && /\/materials\/files\/upload-url$/.test(path)) {
    const { user } = await ctx.requireAuth();
    ctx.assertRole(user, ['admin']);
    const unavailable = storageUnavailable(ctx);
    if (unavailable) return unavailable;
    const body = ctx.getBody() || {};
    const id = ctx.uid('mat');
    const key = `materials/${id}`;
    const signed = await signMaterialUpload(key);
    const hinted = mimeOf(body.mime, body.name);
    return ctx.json(200, {
      url: signed.url,
      method: 'PUT',
      storageKey: key,
      expiresIn: signed.expiresIn,
      headers: hinted ? { 'Content-Type': hinted } : {},
    });
  }


  const multipart = path.match(/\/materials\/files\/multipart(?:\/(parts|complete|abort))?$/);
  if (method === 'POST' && multipart) {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, ['admin']);
    const unavailable = storageUnavailable(ctx);
    if (unavailable) return unavailable;
    const body = ctx.getBody() || {};
    const step = multipart[1] || 'start';
    if (step === 'start') {
      const size = Number(body.size);
      if (!Number.isFinite(size) || size < 1) return ctx.json(400, { message: 'Файл пустой' });
      if (size > MATERIAL_DIRECT_MAX_BYTES) return ctx.json(413, { message: 'Файл больше 5 ТБ' });
      const id = ctx.uid('mat');
      const key = `materials/${id}`;
      const mime = mimeOf(body.mime, body.name);
      const uploadId = await startMaterialMultipart(key, mime);
      const partSize = materialPartSize(size);
      return ctx.json(200, {
        storageKey: key,
        uploadId,
        partSize,
        partCount: Math.ceil(size / partSize),
        mime,
      });
    }
    const key = String(body.storageKey || '');
    const uploadId = String(body.uploadId || '');
    if (!safeId(key.slice('materials/'.length)) || !key.startsWith('materials/')) {
      return ctx.json(400, { message: 'Некорректный ключ материала' });
    }
    if (!uploadId || uploadId.length > 1024) return ctx.json(400, { message: 'Нет uploadId' });
    if (step === 'parts') {
      const numbers = [...new Set((Array.isArray(body.partNumbers) ? body.partNumbers : []).map(Number))];
      if (!numbers.length || numbers.length > 100) {
        return ctx.json(400, { message: 'Нужно от 1 до 100 номеров частей' });
      }
      if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > MATERIAL_MAX_PARTS)) {
        return ctx.json(400, { message: 'Некорректный номер части' });
      }
      const signed = await signMaterialParts(key, uploadId, numbers);
      const uploaded = body.withUploaded ? await listMaterialParts(key, uploadId) : undefined;
      return ctx.json(200, { ...signed, ...(uploaded ? { uploaded } : {}) });
    }
    if (step === 'abort') {
      await abortMaterialMultipart(key, uploadId);
      return ctx.json(200, { ok: true });
    }
    // complete: части берём у S3 (ListParts), клиентским ETag не доверяем.
    const parts = (await listMaterialParts(key, uploadId))
      .filter((part) => part && part.partNumber && part.etag)
      .sort((a, b) => a.partNumber - b.partNumber);
    if (!parts.length) return ctx.json(400, { message: 'Ни одна часть не загружена' });
    const expected = Number(body.partCount) || parts.length;
    if (parts.length !== expected || parts.some((part, index) => part.partNumber !== index + 1)) {
      return ctx.json(409, { message: 'Загружены не все части', uploaded: parts.map((p) => p.partNumber) });
    }
    await completeMaterialMultipart(key, uploadId, parts);
    return registerUploadedMaterial(ctx, platform, { ...body, storageKey: key });
  }

  if (method === 'POST' && /\/materials\/files$/.test(path)) {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, ['admin']);
    const unavailable = storageUnavailable(ctx);
    if (unavailable) return unavailable;
    const body = ctx.getBody();
    if (body.storageKey && body.contentBase64) {
      return ctx.json(400, { message: 'Передайте либо файл, либо уже загруженный ключ' });
    }
    if (body.storageKey) return registerUploadedMaterial(ctx, platform, body);
    const decoded = decodeFile(body);
    if (decoded.error) return ctx.json(400, { message: decoded.error });
    const id = ctx.uid('mat');
    const key = `materials/${id}`;
    await putMaterialBytes(key, decoded.buf, decoded.mime);
    const now = new Date().toISOString();
    const result = addFile(platform.materials, {
      name: body.name,
      parentId: body.parentId || null,
      id,
      mime: decoded.mime,
      size: decoded.buf.length,
      storageKey: key,
      bucket: MATERIAL_BUCKET_MARKER,
      now,
    });
    if (!result.ok) {
      await deleteMaterialBytes(key);
      return ctx.json(400, { message: result.message });
    }
    platform.materials = result.nodes;
    await ctx.savePlatform(platform);
    return ctx.json(200, { materials: await signedPublicMaterials(platform.materials) });
  }

  const contentMatch = path.match(/\/materials\/([^/]+)\/content$/);
  if (contentMatch) {
    const id = contentMatch[1];
    if (!safeId(id)) return ctx.json(400, { message: 'Некорректный материал' });
    if (method === 'GET') {
      const { platform, user } = await ctx.requireAuth();
      ctx.assertRole(user, READ_ROLES);
      const node = findMaterial(platform.materials, id);
      if (!node || node.kind !== 'file') return ctx.json(404, { message: 'Файл не найден' });
      if (node.storageKey) return signedContent(ctx, node);
      if (node.contentBase64) {
        return ctx.json(200, {
          name: node.name,
          mime: node.mime,
          base64: node.contentBase64,
        });
      }
      if (node.stub) {
        return ctx.json(200, { name: node.name, mime: node.mime, stub: node.stub });
      }
      return ctx.json(404, { message: 'У файла нет содержимого' });
    }
    if (method === 'PUT' || method === 'POST') {
      const { platform, user } = await ctx.requireAuth();
      ctx.assertRole(user, ['admin']);
      const unavailable = storageUnavailable(ctx);
      if (unavailable) return unavailable;
      const body = ctx.getBody();
      const decoded = decodeFile(body);
      if (decoded.error) return ctx.json(400, { message: decoded.error });
      const current = findMaterial(platform.materials, id);
      if (!current || current.kind !== 'file') return ctx.json(404, { message: 'Файл не найден' });
      const key = safeId(id) ? `materials/${id}` : current.storageKey;
      await putMaterialBytes(key, decoded.buf, decoded.mime);
      const result = replaceFile(platform.materials, {
        id,
        mime: decoded.mime,
        size: decoded.buf.length,
        storageKey: key,
        bucket: MATERIAL_BUCKET_MARKER,
        name: body.name,
        now: new Date().toISOString(),
      });
      if (!result.ok) return ctx.json(400, { message: result.message });
      platform.materials = result.nodes;
      await ctx.savePlatform(platform);
      if (
        result.previousKey &&
        result.previousBucket === MATERIAL_BUCKET_MARKER &&
        result.previousKey !== key
      ) {
        await deleteMaterialBytes(result.previousKey);
      }
      return ctx.json(200, { materials: await signedPublicMaterials(platform.materials) });
    }
  }

  const itemMatch = path.match(/\/materials\/([^/]+)$/);
  if (itemMatch && !['folders', 'files'].includes(itemMatch[1])) {
    const id = itemMatch[1];
    if (!safeId(id)) return ctx.json(400, { message: 'Некорректный материал' });
    if (method === 'PATCH') {
      const { platform, user } = await ctx.requireAuth();
      ctx.assertRole(user, ['admin']);
      const body = ctx.getBody();
      const result = renameMaterial(platform.materials, {
        id,
        name: body.name,
        now: new Date().toISOString(),
      });
      if (!result.ok) return ctx.json(400, { message: result.message });
      platform.materials = result.nodes;
      await ctx.savePlatform(platform);
      return ctx.json(200, { materials: await signedPublicMaterials(platform.materials) });
    }
    if (method === 'DELETE') {
      const { platform, user } = await ctx.requireAuth();
      ctx.assertRole(user, ['admin']);
      const result = deleteMaterial(platform.materials, { id });
      if (!result.ok) return ctx.json(400, { message: result.message });
      const doomed = (result.storageObjects || []).filter(
        (item) => item.bucket === MATERIAL_BUCKET_MARKER,
      );
      if (doomed.length) {
        const unavailable = storageUnavailable(ctx);
        if (unavailable) return unavailable;
      }
      platform.materials = result.nodes;
      await ctx.savePlatform(platform);
      for (const item of doomed) {
        await deleteMaterialBytes(item.key);
      }
      return ctx.json(200, { materials: await signedPublicMaterials(platform.materials) });
    }
  }

  return null;
}
