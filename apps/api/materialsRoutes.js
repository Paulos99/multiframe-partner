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
  addFile,
  createFolder,
  deleteMaterial,
  findMaterial,
  materialBase,
  publicMaterials,
  renameMaterial,
  replaceFile,
} from './materialsLib.js';
import {
  deleteMaterialBytes,
  materialsConfigError,
  putMaterialBytes,
  signMaterialUpload,
  signedMaterialGetUrl,
  statMaterialObject,
} from './materialsStorage.js';

const MAX_FILE_BYTES = 2_000_000;
const MAX_BASE64 = 2_800_000;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
]);

const READ_ROLES = ['admin', 'owner', 'sales', 'measurer', 'crew'];

function safeId(id) {
  return /^mat_[a-z0-9_]+$/i.test(String(id || ''));
}

function mimeOf(value, filename) {
  const raw = String(value || '').toLowerCase().split(';')[0].trim();
  if (ALLOWED_MIME.has(raw)) return raw;
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.txt')) return 'text/plain';
  return '';
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
  const mime = mimeOf(body.mime, body.name);
  if (!mime) return { error: 'Нужен PDF, презентация, видео, картинка или документ' };
  return { buf, mime };
}

function storageUnavailable(ctx) {
  const message = materialsConfigError();
  if (!message) return null;
  return ctx.json(503, { message });
}

/** Реальный Content-Type с объекта. application/octet-stream уточняем по имени файла. */
function mimeFromStored(contentType, filename) {
  const raw = String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (raw && raw !== 'application/octet-stream' && raw !== 'binary/octet-stream') {
    return ALLOWED_MIME.has(raw) ? raw : '';
  }
  return mimeOf('', filename);
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
    return ctx.json(413, { message: 'Файл больше 2 ГБ' });
  }
  const mime = mimeFromStored(head.contentType, body.name);
  if (!mime) return ctx.json(400, { message: 'Нужен PDF, презентация, видео, картинка или документ' });
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
  return ctx.json(200, { materials: publicMaterials(platform.materials) });
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
    /\/materials\/(folders|files)$/.test(path) ||
    /\/materials\/[^/]+$/.test(path) ||
    /\/materials\/[^/]+\/content$/.test(path);
  if (!isMaterials) return null;

  if (method === 'GET' && (path === '/materials' || path.endsWith('/materials'))) {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, READ_ROLES);
    return ctx.json(200, { materials: publicMaterials(platform.materials) });
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
    return ctx.json(200, { materials: publicMaterials(platform.materials) });
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
    return ctx.json(200, { materials: publicMaterials(platform.materials) });
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
      return ctx.json(200, { materials: publicMaterials(platform.materials) });
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
      return ctx.json(200, { materials: publicMaterials(platform.materials) });
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
      return ctx.json(200, { materials: publicMaterials(platform.materials) });
    }
  }

  return null;
}
