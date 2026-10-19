/**
 * PDF-копия материала для предпросмотра (например, для старого Word .doc,
 * который браузер показать не может).
 *
 * Копия лежит в MATERIALS_BUCKET под ключом materials/<id>_pdfpreview,
 * в узле материала хранится только previewKey (+ размер и дата).
 * Оригинал файла не меняется и по-прежнему скачивается через /content.
 *
 *   GET    /materials/:id/preview  — любая роль кабинета: подписанная ссылка на PDF-копию
 *   POST   /materials/:id/preview  — только admin:
 *            { upload: true }        → подписанный PUT для загрузки PDF напрямую в хранилище
 *            { storageKey }          → подтвердить загруженную копию (ключ строго materials/<id>_pdfpreview)
 *            { contentBase64 }       → небольшая копия (до 2 МБ) прямо через API
 *   DELETE /materials/:id/preview  — только admin: убрать копию
 */

import { MATERIAL_BUCKET_MARKER, findMaterial, materialBase } from './materialsLib.js';
import {
  deleteMaterialBytes,
  materialsConfigError,
  putMaterialBytes,
  signMaterialUpload,
  signedMaterialGetUrl,
  signedPublicMaterials,
  statMaterialObject,
} from './materialsStorage.js';

const READ_ROLES = ['admin', 'owner', 'sales', 'measurer', 'crew'];
const PREVIEW_PATH = /\/materials\/([^/]+)\/preview$/;
export const PREVIEW_MAX_BYTES = 300 * 1024 * 1024;
const DIRECT_MAX_BYTES = 2_000_000;

function safeId(id) {
  return /^mat_[a-z0-9_]+$/i.test(String(id || ''));
}

export function previewKeyFor(id) {
  return `materials/${id}_pdfpreview`;
}

function pdfName(name) {
  const base = String(name || 'file').replace(/\.[A-Za-z0-9]{1,8}$/, '');
  return `${base || 'file'}.pdf`;
}

function storageUnavailable(ctx) {
  const message = materialsConfigError();
  return message ? ctx.json(503, { message }) : null;
}

function isPdfType(contentType) {
  const raw = String(contentType || '').toLowerCase().split(';')[0].trim();
  return !raw || raw === 'application/pdf' || raw === 'application/x-pdf' || raw === 'application/octet-stream' || raw === 'binary/octet-stream';
}

async function savePreview(ctx, platform, id, fields) {
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
export async function handleMaterialPreview(ctx) {
  const match = String(ctx.path || '').match(PREVIEW_PATH);
  if (!match) return null;
  const id = match[1];
  if (!safeId(id)) return ctx.json(400, { message: 'Некорректный материал' });
  const { method } = ctx;

  if (method === 'GET') {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, READ_ROLES);
    const node = findMaterial(platform.materials, id);
    if (!node || node.kind !== 'file') return ctx.json(404, { message: 'Файл не найден' });
    if (!node.previewKey) return ctx.json(404, { message: 'У файла нет PDF-копии для просмотра' });
    try {
      const name = pdfName(node.name);
      const url = await signedMaterialGetUrl(
        { storageKey: node.previewKey, bucket: MATERIAL_BUCKET_MARKER, name, mime: 'application/pdf' },
        { filename: name, mime: 'application/pdf' },
      );
      if (!url) return ctx.json(404, { message: 'PDF-копия не найдена в хранилище' });
      return ctx.json(200, { name, mime: 'application/pdf', url });
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
    const key = previewKeyFor(id);

    if (body.upload === true) {
      const signed = await signMaterialUpload(key);
      return ctx.json(200, {
        url: signed.url,
        method: 'PUT',
        storageKey: key,
        expiresIn: signed.expiresIn,
        headers: { 'Content-Type': 'application/pdf' },
      });
    }

    if (body.storageKey) {
      if (String(body.storageKey) !== key) {
        return ctx.json(400, { message: `Ключ PDF-копии должен быть ${key}` });
      }
      let head;
      try {
        head = await statMaterialObject(key);
      } catch (error) {
        return ctx.json(error.status || 500, { message: error.message || 'Некорректный ключ' });
      }
      if (head.missing) return ctx.json(404, { message: 'PDF-копия не найдена в хранилище' });
      if (!head.contentLength || head.contentLength < 1) return ctx.json(400, { message: 'PDF-копия пустая' });
      if (head.contentLength > PREVIEW_MAX_BYTES) return ctx.json(413, { message: 'PDF-копия больше 300 МБ' });
      if (!isPdfType(head.contentType)) return ctx.json(400, { message: 'PDF-копия должна быть в формате PDF' });
      return savePreview(ctx, platform, id, {
        previewKey: key,
        previewSize: head.contentLength,
        previewUpdatedAt: new Date().toISOString(),
      });
    }

    if (body.contentBase64) {
      const buf = Buffer.from(String(body.contentBase64).replace(/^data:[^,]*,/, ''), 'base64');
      if (!buf.length) return ctx.json(400, { message: 'PDF-копия пустая' });
      if (buf.length > DIRECT_MAX_BYTES) {
        return ctx.json(413, { message: 'Больше 2 МБ — загрузите через { upload: true }' });
      }
      if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return ctx.json(400, { message: 'PDF-копия должна быть в формате PDF' });
      }
      await putMaterialBytes(key, buf, 'application/pdf');
      return savePreview(ctx, platform, id, {
        previewKey: key,
        previewSize: buf.length,
        previewUpdatedAt: new Date().toISOString(),
      });
    }
    return ctx.json(400, { message: 'Передайте { upload: true }, { storageKey } или { contentBase64 }' });
  }

  if (method === 'DELETE') {
    const { platform, user } = await ctx.requireAuth();
    ctx.assertRole(user, ['admin']);
    const node = findMaterial(platform.materials, id);
    if (!node || node.kind !== 'file') return ctx.json(404, { message: 'Файл не найден' });
    if (node.previewKey) {
      const unavailable = storageUnavailable(ctx);
      if (unavailable) return unavailable;
      await deleteMaterialBytes(node.previewKey);
    }
    return savePreview(ctx, platform, id, { previewKey: null, previewSize: null, previewUpdatedAt: null });
  }

  return ctx.json(405, { message: 'Метод не поддерживается' });
}
