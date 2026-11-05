/**
 * Миниатюра материала для списков «Обучения» (картинка ~480 px, webp/jpeg/png).
 *
 * Лежит в MATERIALS_BUCKET под ключом materials/<id>_thumb, в узле — thumbKey (+ размер,
 * тип, дата). Сам файл материала не меняется. В списке материалов приходит готовая
 * подписанная ссылка thumbnailUrl (см. signedPublicMaterials в materialsStorage.js).
 *
 *   GET    /materials/:id/thumbnail — любая роль кабинета: подписанная ссылка
 *   POST   /materials/:id/thumbnail — только admin:
 *            { upload: true }   → подписанный PUT напрямую в хранилище
 *            { storageKey }     → подтвердить загруженную миниатюру (ключ строго materials/<id>_thumb)
 *            { contentBase64 }  → маленькая миниатюра прямо через API
 *   DELETE /materials/:id/thumbnail — только admin: убрать миниатюру
 */

import { findMaterial, materialBase, toPublicMaterial } from '../../packages/shared/materialsLib.js';
import {
  deleteMaterialBytes,
  materialsConfigError,
  putMaterialBytes,
  signMaterialUpload,
  signedPublicMaterials,
  signedThumbnailUrl,
  statMaterialObject,
} from './materialsStorage.js';

const READ_ROLES = ['admin', 'owner', 'sales', 'measurer', 'crew', 'stp_manager'];
const THUMB_PATH = /\/materials\/([^/]+)\/thumbnail$/;
export const THUMB_MAX_BYTES = 1024 * 1024;
const DIRECT_MAX_BYTES = 700 * 1024;
export const THUMB_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

function safeId(id) {
  return /^mat_[a-z0-9_]+$/i.test(String(id || ''));
}

export function thumbKeyFor(id) {
  return `materials/${id}_thumb`;
}

function normType(value) {
  const raw = String(value || '').toLowerCase().split(';')[0].trim();
  return raw === 'image/jpg' ? 'image/jpeg' : raw;
}

/** Тип картинки по первым байтам: webp, jpeg, png или null. */
export function sniffThumbType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function storageUnavailable(ctx) {
  const message = materialsConfigError();
  return message ? ctx.json(503, { message }) : null;
}

async function saveThumb(ctx, platform, id, fields) {
  const nodes = materialBase(platform.materials);
  const idx = nodes.findIndex((node) => node.id === id);
  if (idx < 0) return ctx.json(404, { message: 'Файл не найден' });
  nodes[idx] = { ...nodes[idx], ...fields };
  platform.materials = nodes;
  await ctx.savePlatform(platform);
  return ctx.json(200, { materials: await signedPublicMaterials(platform.materials) });
}

/**
 * @returns {Promise<null | {statusCode:number, headers:object, body:string}>}
 */
export async function handleMaterialThumbnail(ctx) {
  const match = String(ctx.path || '').match(THUMB_PATH);
  if (!match) return null;
  const id = match[1];
  if (!safeId(id)) return ctx.json(400, { message: 'Некорректный материал' });
  const { method } = ctx;

  if (method === 'GET') {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, READ_ROLES);
    const node = findMaterial(platform.materials, id);
    if (!node || node.kind !== 'file') return ctx.json(404, { message: 'Файл не найден' });
    if (!node.thumbKey) return ctx.json(404, { message: 'У файла нет миниатюры' });
    try {
      const url = await signedThumbnailUrl(node);
      if (!url) return ctx.json(404, { message: 'Миниатюра не найдена в хранилище' });
      return ctx.json(200, { url, mime: node.thumbType || 'image/webp', material: toPublicMaterial(node) });
    } catch (error) {
      return ctx.json(error.status || 500, { message: error.message || 'Не удалось выдать ссылку' });
    }
  }

  if (method === 'POST') {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, ['admin']);
    const unavailable = storageUnavailable(ctx);
    if (unavailable) return unavailable;
    const node = findMaterial(platform.materials, id);
    if (!node || node.kind !== 'file') return ctx.json(404, { message: 'Файл не найден' });
    const body = ctx.getBody() || {};
    const key = thumbKeyFor(id);

    if (body.upload === true) {
      const type = normType(body.mime) || 'image/webp';
      if (!THUMB_TYPES.includes(type)) return ctx.json(400, { message: 'Миниатюра — webp, jpeg или png' });
      const signed = await signMaterialUpload(key);
      return ctx.json(200, {
        url: signed.url,
        method: 'PUT',
        storageKey: key,
        expiresIn: signed.expiresIn,
        headers: { 'Content-Type': type },
        maxBytes: THUMB_MAX_BYTES,
      });
    }

    if (body.storageKey) {
      if (String(body.storageKey) !== key) {
        return ctx.json(400, { message: `Ключ миниатюры должен быть ${key}` });
      }
      let head;
      try {
        head = await statMaterialObject(key);
      } catch (error) {
        return ctx.json(error.status || 500, { message: error.message || 'Некорректный ключ' });
      }
      if (head.missing) return ctx.json(404, { message: 'Миниатюра не найдена в хранилище' });
      if (!head.contentLength || head.contentLength < 1) return ctx.json(400, { message: 'Миниатюра пустая' });
      if (head.contentLength > THUMB_MAX_BYTES) {
        await deleteMaterialBytes(key);
        return ctx.json(413, { message: 'Миниатюра больше 1 МБ' });
      }
      const type = normType(head.contentType);
      if (!THUMB_TYPES.includes(type)) {
        await deleteMaterialBytes(key);
        return ctx.json(400, { message: 'Миниатюра — webp, jpeg или png' });
      }
      return saveThumb(ctx, platform, id, {
        thumbKey: key,
        thumbSize: head.contentLength,
        thumbType: type,
        thumbUpdatedAt: new Date().toISOString(),
      });
    }

    if (body.contentBase64) {
      const buf = Buffer.from(String(body.contentBase64).replace(/^data:[^,]*,/, ''), 'base64');
      if (!buf.length) return ctx.json(400, { message: 'Миниатюра пустая' });
      if (buf.length > DIRECT_MAX_BYTES) {
        return ctx.json(413, { message: 'Больше 700 КБ — загрузите через { upload: true }' });
      }
      const type = sniffThumbType(buf);
      if (!type) return ctx.json(400, { message: 'Миниатюра — webp, jpeg или png' });
      await putMaterialBytes(key, buf, type);
      return saveThumb(ctx, platform, id, {
        thumbKey: key,
        thumbSize: buf.length,
        thumbType: type,
        thumbUpdatedAt: new Date().toISOString(),
      });
    }
    return ctx.json(400, { message: 'Передайте { upload: true }, { storageKey } или { contentBase64 }' });
  }

  if (method === 'DELETE') {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, ['admin']);
    const node = findMaterial(platform.materials, id);
    if (!node || node.kind !== 'file') return ctx.json(404, { message: 'Файл не найден' });
    if (node.thumbKey) {
      const unavailable = storageUnavailable(ctx);
      if (unavailable) return unavailable;
      await deleteMaterialBytes(node.thumbKey);
    }
    return saveThumb(ctx, platform, id, { thumbKey: null, thumbSize: null, thumbType: null, thumbUpdatedAt: null });
  }

  return ctx.json(405, { message: 'Метод не поддерживается' });
}
