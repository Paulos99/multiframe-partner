/**
 * Обратная связь партнёров для администраторов StP.
 *
 * Записи лежат в platform JSON (список feedback), фото — в PARTNERS_BUCKET, как фото комнат
 * (без бакета — в памяти процесса: демо и тесты). Ключи: feedback/<компания>/<обращение>/<фото>.jpg и _t.jpg.
 * Фото отдаются короткоживущими ссылками: подписанный GET в бакет или подписанный адрес /feedback-file/<id>.
 *
 * Права (packages/shared/feedback.js), проверяются здесь:
 *  - роли партнёра создают обращения, добавляют к своим до 5 фото и видят только свои;
 *  - администратор StP видит все, фильтрует, меняет статус и пишет ответ;
 *  - остальным (менеджер StP, без компании) — 403.
 * Компанию, сотрудника, роль и время сервер подставляет сам: из тела запроса они не берутся.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  FEEDBACK_PHOTO_LIMIT,
  canManageFeedback,
  canSendFeedback,
  cleanFeedbackContext,
  cleanFeedbackReply,
  cleanFeedbackText,
  countNewFeedback,
  filterFeedback,
  isFeedbackStatus,
  isFeedbackType,
} from '../../packages/shared/feedback.js';
import { cleanJpeg } from './jpegClean.js';
import { partnerBucket, signGetObject } from './objectStore.js';

export const FEEDBACK_URL_TTL_SECONDS = 10 * 60;
const IMAGE_MAX_BYTES = 1_800_000;
const THUMB_MAX_BYTES = 120_000;
const IMAGE_MAX_SIDE = 4096;
const THUMB_MAX_SIDE = 800;
/** Чтобы platform JSON не разрастался: обращений одного сотрудника в сутки. */
const DAILY_LIMIT_PER_USER = 30;

const LIST_PATH = /\/feedback$/;
const SUMMARY_PATH = /\/feedback\/summary$/;
const ONE_PATH = /\/feedback\/([^/]+)$/;
const PHOTOS_PATH = /\/feedback\/([^/]+)\/photos$/;
const FILE_PATH = /\/feedback-file\/([^/]+)$/;

function decode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return '';
  }
}

function secret() {
  const key = process.env.JWT_SECRET;
  if (!key) throw new Error('JWT_SECRET must be configured');
  return `feedback-photo:${key}`;
}

function sign(photoId, variant, exp) {
  return createHmac('sha256', secret()).update(`${photoId}.${variant}.${exp}`).digest('base64url');
}

function verifySignature(photoId, variant, exp, sig) {
  const want = Buffer.from(sign(photoId, variant, exp));
  const got = Buffer.from(String(sig || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

function decodeJpeg(raw, maxBytes, maxSide) {
  const clean = String(raw || '').replace(/^data:image\/jpeg;base64,/, '');
  if (!clean) return { error: 'Нет файла' };
  let bytes;
  try {
    bytes = Buffer.from(clean, 'base64');
  } catch {
    return { error: 'Не удалось прочитать фото' };
  }
  if (bytes.length > maxBytes) return { error: 'Фото слишком большое', status: 413 };
  const cleaned = cleanJpeg(bytes);
  if (!cleaned) return { error: 'Файл не похож на фото JPEG' };
  if (cleaned.width > maxSide || cleaned.height > maxSide) {
    return { error: 'Фото слишком большое по размеру', status: 413 };
  }
  return cleaned;
}

async function urlFor(photo, variant) {
  const bucket = partnerBucket();
  const key = variant === 'thumb' ? photo.thumbKey : photo.storageKey;
  if (bucket && key) {
    return signGetObject({ bucket, key, responseContentType: 'image/jpeg', expiresIn: FEEDBACK_URL_TTL_SECONDS });
  }
  const exp = Math.floor(Date.now() / 1000) + FEEDBACK_URL_TTL_SECONDS;
  return `/feedback-file/${encodeURIComponent(photo.id)}?v=${variant}&e=${exp}&s=${sign(photo.id, variant, exp)}`;
}

function rows(platform) {
  return Array.isArray(platform.feedback) ? platform.feedback : [];
}

/** Запись для экрана: без ключей хранилища. Отправителю логин и служебные поля не нужны, но вреда нет: это он сам. */
async function view(item) {
  const photos = [];
  for (const photo of Array.isArray(item.photos) ? item.photos : []) {
    photos.push({
      id: photo.id,
      width: photo.width || null,
      height: photo.height || null,
      createdAt: photo.createdAt,
      url: await urlFor(photo, 'image'),
      thumbUrl: await urlFor(photo, 'thumb'),
    });
  }
  return {
    id: item.id,
    type: item.type,
    status: item.status,
    text: item.text,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt || item.createdAt,
    orgId: item.orgId,
    companyName: item.companyName || '',
    userId: item.userId,
    authorName: item.authorName || '',
    authorLogin: item.authorLogin || '',
    authorRole: item.authorRole || '',
    context: item.context || cleanFeedbackContext(null),
    photos,
    reply: item.reply || '',
    repliedAt: item.repliedAt || null,
    repliedBy: item.repliedBy || null,
    replyAuthorName: item.replyAuthorName || '',
  };
}

function fileResponse(ctx, bytes) {
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
      ...ctx.cors,
    },
    body: Buffer.from(bytes).toString('base64'),
  };
}

export async function handleFeedback(ctx) {
  const { path, method } = ctx;

  /* —— Файл по подписанной ссылке (без бакета) —— */
  const fileMatch = path.match(FILE_PATH);
  if (fileMatch) {
    if (method !== 'GET') return null;
    const notFound = () => ctx.json(404, { message: 'Файл недоступен' });
    const photoId = decode(fileMatch[1]);
    const q = ctx.getQuery();
    const variant = q.v === 'thumb' ? 'thumb' : 'image';
    const exp = Number(q.e);
    if (!photoId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return notFound();
    if (!verifySignature(photoId, variant, exp, q.s)) return notFound();
    const platform = await ctx.loadPlatform();
    let found = null;
    for (const item of rows(platform)) {
      found = (item.photos || []).find((photo) => photo.id === photoId) || null;
      if (found) break;
    }
    if (!found) return notFound();
    const bytes = await ctx.storage.get(variant === 'thumb' ? found.thumbKey : found.storageKey);
    if (!bytes?.length) return notFound();
    return fileResponse(ctx, bytes);
  }

  const summaryMatch = path.match(SUMMARY_PATH);
  const photosMatch = summaryMatch ? null : path.match(PHOTOS_PATH);
  const oneMatch = summaryMatch || photosMatch ? null : path.match(ONE_PATH);
  const listMatch = summaryMatch || photosMatch || oneMatch ? null : path.match(LIST_PATH);
  if (!summaryMatch && !photosMatch && !oneMatch && !listMatch) return null;

  /* —— Значок у администратора: сколько новых —— */
  if (summaryMatch) {
    if (method !== 'GET') return null;
    const { platform, user } = await ctx.requireAuth();
    if (!canManageFeedback(user.role)) return ctx.json(403, { message: 'Недостаточно прав' });
    return ctx.json(200, { newCount: countNewFeedback(rows(platform)) });
  }

  if (listMatch && method === 'GET') {
    const { platform, user } = await ctx.requireAuth();
    if (canManageFeedback(user.role)) {
      const q = ctx.getQuery();
      const all = rows(platform);
      const list = filterFeedback(all, {
        status: isFeedbackStatus(q.status) ? q.status : null,
        type: isFeedbackType(q.type) ? q.type : null,
        orgId: String(q.orgId || '').trim() || null,
      }).slice(0, 300);
      const items = [];
      for (const item of list) items.push(await view(item));
      const partners = new Map();
      for (const item of all) if (item.orgId) partners.set(item.orgId, item.companyName || item.orgId);
      return ctx.json(200, {
        items,
        newCount: countNewFeedback(all),
        partners: [...partners.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      });
    }
    if (!canSendFeedback(user.role) || !user.orgId) return ctx.json(403, { message: 'Недостаточно прав' });
    const mine = filterFeedback(
      rows(platform).filter((item) => item.userId === user.id),
      {},
    ).slice(0, 100);
    const items = [];
    for (const item of mine) items.push(await view(item));
    return ctx.json(200, { items });
  }

  if (listMatch && method === 'POST') {
    const { platform, user } = await ctx.requireAuth();
    if (!canSendFeedback(user.role) || !user.orgId) return ctx.json(403, { message: 'Недостаточно прав' });
    const body = ctx.getBody() || {};
    if (!isFeedbackType(body.type)) return ctx.json(400, { message: 'Выберите тип обращения' });
    const text = cleanFeedbackText(body.text);
    if (text.error) return ctx.json(400, { message: text.error });
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const today = rows(platform).filter((item) => item.userId === user.id && item.createdAt >= dayAgo).length;
    if (today >= DAILY_LIMIT_PER_USER) {
      return ctx.json(429, { message: 'Слишком много обращений за сутки. Допишите в уже отправленное или подождите.' });
    }
    const org = (platform.orgs || []).find((item) => item.id === user.orgId);
    const now = new Date().toISOString();
    const item = {
      id: ctx.uid('fb'),
      type: body.type,
      status: 'new',
      text: text.value,
      createdAt: now,
      updatedAt: now,
      orgId: user.orgId,
      companyName: String(org?.settings?.companyName || '').slice(0, 120),
      userId: user.id,
      authorName: String(user.displayName || user.login || '').slice(0, 80),
      authorLogin: String(user.login || '').slice(0, 80),
      authorRole: user.role,
      context: cleanFeedbackContext(body.context),
      photos: [],
      reply: '',
      repliedAt: null,
      repliedBy: null,
      replyAuthorName: '',
    };
    platform.feedback = [item, ...rows(platform)];
    ctx.pushActivity?.(platform, {
      orgId: user.orgId,
      userId: user.id,
      login: user.login,
      action: 'feedback_send',
      detail: item.type,
    });
    await ctx.savePlatform(platform);
    return ctx.json(200, { item: await view(item) });
  }

  if (photosMatch) {
    if (method !== 'POST') return null;
    const { platform, user } = await ctx.requireAuth();
    const id = decode(photosMatch[1]);
    const list = rows(platform);
    const idx = list.findIndex((item) => item.id === id);
    const item = idx >= 0 ? list[idx] : null;
    // Чужое обращение для отправителя не существует.
    if (!item || item.userId !== user.id || !canSendFeedback(user.role)) {
      return ctx.json(404, { message: 'Обращение не найдено' });
    }
    const photos = Array.isArray(item.photos) ? item.photos : [];
    if (photos.length >= FEEDBACK_PHOTO_LIMIT) {
      return ctx.json(409, { message: `К обращению можно приложить не больше ${FEEDBACK_PHOTO_LIMIT} фото` });
    }
    const body = ctx.getBody() || {};
    const image = decodeJpeg(body.image, IMAGE_MAX_BYTES, IMAGE_MAX_SIDE);
    if (image.error) return ctx.json(image.status || 400, { message: image.error });
    const thumb = decodeJpeg(body.thumb, THUMB_MAX_BYTES, THUMB_MAX_SIDE);
    if (thumb.error) return ctx.json(thumb.status || 400, { message: thumb.error });
    const photoId = ctx.uid('fbp');
    const base = `feedback/${item.orgId}/${item.id}/${photoId}`;
    const photo = {
      id: photoId,
      createdAt: new Date().toISOString(),
      width: image.width,
      height: image.height,
      bytes: image.buffer.length,
      storageKey: `${base}.jpg`,
      thumbKey: `${base}_t.jpg`,
    };
    await ctx.storage.put(photo.storageKey, image.buffer, 'image/jpeg');
    await ctx.storage.put(photo.thumbKey, thumb.buffer, 'image/jpeg');
    platform.feedback[idx] = { ...item, photos: [...photos, photo] };
    await ctx.savePlatform(platform);
    return ctx.json(200, { item: await view(platform.feedback[idx]) });
  }

  if (oneMatch && method === 'GET') {
    const { platform, user } = await ctx.requireAuth();
    const item = rows(platform).find((row) => row.id === decode(oneMatch[1]));
    const allowed = item && (canManageFeedback(user.role) || (canSendFeedback(user.role) && item.userId === user.id));
    if (!allowed) return ctx.json(404, { message: 'Обращение не найдено' });
    return ctx.json(200, { item: await view(item) });
  }

  if (oneMatch && method === 'PATCH') {
    const { platform, user } = await ctx.requireAuth();
    if (!canManageFeedback(user.role)) return ctx.json(403, { message: 'Недостаточно прав' });
    const list = rows(platform);
    const idx = list.findIndex((row) => row.id === decode(oneMatch[1]));
    if (idx < 0) return ctx.json(404, { message: 'Обращение не найдено' });
    const body = ctx.getBody() || {};
    const item = list[idx];
    const next = { ...item };
    if (body.status !== undefined) {
      if (!isFeedbackStatus(body.status)) return ctx.json(400, { message: 'Неизвестный статус' });
      next.status = body.status;
    }
    if (body.reply !== undefined) {
      const reply = cleanFeedbackReply(body.reply);
      if (reply !== (item.reply || '')) {
        next.reply = reply;
        next.repliedAt = reply ? new Date().toISOString() : null;
        next.repliedBy = reply ? user.id : null;
        next.replyAuthorName = reply ? String(user.displayName || user.login || '').slice(0, 80) : '';
      }
    }
    next.updatedAt = new Date().toISOString();
    platform.feedback[idx] = next;
    await ctx.savePlatform(platform);
    return ctx.json(200, { item: await view(next) });
  }

  /* —— Удаление обращения (только администратор StP), вместе с фото в хранилище —— */
  if (oneMatch && method === 'DELETE') {
    const { platform, user } = await ctx.requireAuth();
    if (!canManageFeedback(user.role)) return ctx.json(403, { message: 'Недостаточно прав' });
    const list = rows(platform);
    const id = decode(oneMatch[1]);
    const item = list.find((row) => row.id === id);
    if (!item) return ctx.json(404, { message: 'Обращение не найдено' });
    platform.feedback = list.filter((row) => row.id !== id);
    await ctx.savePlatform(platform);
    // Запись уже удалена: файлы чистим после, сбой одного файла не возвращает обращение.
    for (const photo of Array.isArray(item.photos) ? item.photos : []) {
      for (const key of [photo.storageKey, photo.thumbKey]) {
        if (!key) continue;
        try {
          await ctx.storage.del(key);
        } catch {
          /* файл уже недоступен */
        }
      }
    }
    try {
      ctx.pushActivity?.(platform, {
        orgId: item.orgId || null,
        userId: user.id,
        login: user.login,
        action: 'feedback_deleted',
        detail: `Удалено обращение ${id}`,
      });
    } catch {
      /* журнал не обязателен */
    }
    return ctx.json(200, { ok: true, id });
  }

  return null;
}
