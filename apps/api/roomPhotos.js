/**
 * Фотоотчёт комнаты: до, в процессе, после.
 *
 * Файлы лежат там же, где PDF комнат: в PARTNERS_BUCKET (без бакета — в памяти процесса,
 * это демо и тесты). Новых бакетов нет. Ключи: photos/<компания>/<комната>/<id>.jpg и <id>_t.jpg
 * (миниатюра). В platform JSON у комнаты лежит только список записей (без байтов).
 *
 * Права — в packages/shared/roomPhotos.js, здесь они проверяются на сервере:
 * замерщик видит все этапы, но добавляет только «До»; монтажник и менеджер видят и добавляют все этапы;
 * админ StP только смотрит и может удалить. Комната видна роли по тем же правилам, что и документы (objectVisibleTo).
 *
 * Фото отдаются по короткоживущим ссылкам: подписанный GET в бакет (10 минут) или,
 * без бакета, подписанная ссылка на GET /photo-file/<id> (HMAC, 10 минут).
 * Клиентская страница по токену получает фото, пока владелец или менеджер не выключил показ (по умолчанию он включён).
 * Для PDF-отчёта каждое фото отдаётся ещё и подписанной ссылкой на API (pdfUrl): у неё есть CORS,
 * а у ссылки на бакет его может не быть, и браузер не даст положить снимок в PDF.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PHOTO_LIMIT_PER_ROOM,
  PHOTO_STAGES,
  PHOTO_STAGE_LABELS,
  canAddPhoto,
  canDeletePhoto,
  canSeePhotoStage,
  canShareReportWithClient,
  cleanPhotoCaption,
  isPhotoStage,
  photoCountsFor,
  photoReportVisibleToClient,
  photoStagesRoleAdds,
  photoStagesRoleSees,
} from '../../packages/shared/roomPhotos.js';
import { cleanJpeg } from './jpegClean.js';
import { partnerBucket, signGetObject } from './objectStore.js';

export const PHOTO_URL_TTL_SECONDS = 10 * 60;
const IMAGE_MAX_BYTES = 1_800_000;
const THUMB_MAX_BYTES = 120_000;
const IMAGE_MAX_SIDE = 4096;
const THUMB_MAX_SIDE = 800;

const LIST_PATH = /\/objects\/([^/]+)\/photos$/;
const ONE_PATH = /\/objects\/([^/]+)\/photos\/([^/]+)$/;
const FILE_PATH = /\/photo-file\/([^/]+)$/;
const CASES_PATH = /\/photo-cases$/;
const CASE_PATH = /\/photo-cases\/([^/]+)$/;

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
  return `room-photo:${key}`;
}

function sign(photoId, variant, exp) {
  return createHmac('sha256', secret()).update(`${photoId}.${variant}.${exp}`).digest('base64url');
}

function verifySignature(photoId, variant, exp, sig) {
  const want = Buffer.from(sign(photoId, variant, exp));
  const got = Buffer.from(String(sig || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

export function photoKeys(orgId, objectId, photoId) {
  const base = `photos/${orgId}/${objectId}/${photoId}`;
  return { image: `${base}.jpg`, thumb: `${base}_t.jpg` };
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

/** Подписанный адрес API (не бакета): для PDF-отчёта. Путь от корня API, клиент добавляет адрес сам. */
function apiUrlFor(photo, variant) {
  const exp = Math.floor(Date.now() / 1000) + PHOTO_URL_TTL_SECONDS;
  return `/photo-file/${encodeURIComponent(photo.id)}?v=${variant}&e=${exp}&s=${sign(photo.id, variant, exp)}`;
}

/** Ссылка на байты: бакет или подписанный адрес API. */
async function urlFor(ctx, photo, variant) {
  const bucket = partnerBucket();
  const key = variant === 'thumb' ? photo.thumbKey : photo.storageKey;
  if (bucket && key) {
    return signGetObject({
      bucket,
      key,
      responseContentType: 'image/jpeg',
      expiresIn: PHOTO_URL_TTL_SECONDS,
    });
  }
  // Относительный адрес: клиент добавляет адрес API сам.
  return apiUrlFor(photo, variant);
}

/** Запись для людей: без ключей бакета. */
export async function photoView(ctx, photo, { withUrls = true } = {}) {
  const view = {
    id: photo.id,
    stage: photo.stage,
    caption: photo.caption || '',
    createdAt: photo.createdAt,
    createdBy: photo.createdBy || null,
    authorName: photo.authorName || '',
    authorRole: photo.authorRole || null,
    width: photo.width || null,
    height: photo.height || null,
  };
  if (withUrls) {
    view.url = await urlFor(ctx, photo, 'image');
    view.thumbUrl = await urlFor(ctx, photo, 'thumb');
    view.pdfUrl = apiUrlFor(photo, 'thumb');
  }
  return view;
}

/** Только то, что можно показать клиенту: этап, размер, ссылки. Подписей и авторов нет. */
export async function clientPhotoView(ctx, photo) {
  return {
    id: photo.id,
    stage: photo.stage,
    createdAt: photo.createdAt,
    width: photo.width || null,
    height: photo.height || null,
    url: await urlFor(ctx, photo, 'image'),
    thumbUrl: await urlFor(ctx, photo, 'thumb'),
    pdfUrl: apiUrlFor(photo, 'thumb'),
  };
}

function photoRows(obj) {
  return Array.isArray(obj.photos) ? obj.photos : [];
}

function newestFirst(list) {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Количество фото, которые видит роль. Для списка комнат. */
export function photoCountsForObject(obj, role) {
  return photoCountsFor(photoRows(obj), role);
}

/** Фото для клиентской страницы или null: показ выключен или фото нет. */
export async function clientReport(ctx, obj) {
  if (!photoReportVisibleToClient(obj)) return null;
  const rows = photoRows(obj);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  const photos = [];
  for (const photo of sorted) photos.push(await clientPhotoView(ctx, photo));
  return { photos };
}

export function removePhotoFiles(ctx, obj) {
  return Promise.all(
    photoRows(obj).flatMap((photo) => [
      photo.storageKey ? ctx.storage.del(photo.storageKey) : null,
      photo.thumbKey ? ctx.storage.del(photo.thumbKey) : null,
    ]),
  );
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

/** Админ: комнаты с фото по всем партнёрам. Имени клиента, адреса и названия проекта (там часто имя клиента) здесь нет. */
function caseSummary(platform, obj) {
  const org = (platform.orgs || []).find((item) => item.id === obj.orgId);
  const rows = photoRows(obj);
  const counts = photoCountsFor(rows, 'admin');
  const sorted = newestFirst(rows);
  const cover =
    sorted.find((p) => p.stage === 'after') || sorted.find((p) => p.stage === 'before') || sorted[0] || null;
  return {
    objectId: obj.id,
    roomName: String(obj.roomName || '').trim() || 'Комната',
    areaM2: obj.room?.areaM2 ?? null,
    orgId: obj.orgId,
    partnerName: String(org?.settings?.companyName || '').trim() || 'Партнёр',
    city: String(obj.city || org?.settings?.city || '').trim(),
    counts,
    total: rows.length,
    complete: counts.before > 0 && counts.after > 0,
    lastAt: sorted[0]?.createdAt || null,
    firstAt: [...rows].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))[0]?.createdAt || null,
    coverPhoto: cover,
  };
}

export async function handleRoomPhotos(ctx) {
  const { path, method } = ctx;

  /* —— Файл по подписанной ссылке (без бакета) —— */
  const fileMatch = path.match(FILE_PATH);
  if (fileMatch && method === 'GET') {
    const notFound = () => ctx.json(404, { message: 'Файл недоступен' });
    const photoId = decode(fileMatch[1]);
    const q = ctx.getQuery();
    const variant = q.v === 'thumb' ? 'thumb' : 'image';
    const exp = Number(q.e);
    if (!photoId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return notFound();
    if (!verifySignature(photoId, variant, exp, q.s)) return notFound();
    const platform = await ctx.loadPlatform();
    let found = null;
    for (const obj of platform.objects || []) {
      const photo = photoRows(obj).find((item) => item.id === photoId);
      if (photo) {
        found = photo;
        break;
      }
    }
    if (!found) return notFound();
    const bytes = await ctx.storage.get(variant === 'thumb' ? found.thumbKey : found.storageKey);
    if (!bytes?.length) return notFound();
    return fileResponse(ctx, bytes);
  }

  /* —— Кейсы админа —— */
  const casesMatch = path.match(CASES_PATH);
  const caseMatch = path.match(CASE_PATH);
  if ((casesMatch || caseMatch) && method === 'GET') {
    const { platform, user } = await ctx.requireAuth();
    if (user.role !== 'admin') return ctx.json(403, { message: 'Недостаточно прав' });
    if (caseMatch) {
      const objectId = decode(caseMatch[1]);
      const obj = (platform.objects || []).find((item) => item.id === objectId);
      if (!obj || !photoRows(obj).length) return ctx.json(404, { message: 'Кейс не найден' });
      const summary = caseSummary(platform, obj);
      const photos = [];
      for (const photo of [...photoRows(obj)].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))) {
        photos.push(await photoView(ctx, photo));
      }
      const { coverPhoto, ...rest } = summary;
      void coverPhoto;
      return ctx.json(200, { case: rest, photos });
    }
    const q = ctx.getQuery();
    const stage = isPhotoStage(q.stage) ? q.stage : null;
    const orgId = String(q.orgId || '').trim() || null;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(q.from || '')) ? `${q.from}T00:00:00.000Z` : null;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(q.to || '')) ? `${q.to}T23:59:59.999Z` : null;
    const cases = [];
    const partners = new Map();
    for (const obj of platform.objects || []) {
      if (!photoRows(obj).length) continue;
      const summary = caseSummary(platform, obj);
      partners.set(summary.orgId, summary.partnerName);
      if (orgId && obj.orgId !== orgId) continue;
      const pool = photoRows(obj).filter(
        (photo) =>
          (!stage || photo.stage === stage) &&
          (!from || photo.createdAt >= from) &&
          (!to || photo.createdAt <= to),
      );
      if (!pool.length) continue;
      cases.push(summary);
    }
    cases.sort((a, b) => ((a.lastAt || '') < (b.lastAt || '') ? 1 : -1));
    const out = [];
    for (const item of cases.slice(0, 200)) {
      const { coverPhoto, ...rest } = item;
      out.push({
        ...rest,
        coverUrl: coverPhoto ? await urlFor(ctx, coverPhoto, 'thumb') : null,
        coverStage: coverPhoto?.stage || null,
      });
    }
    return ctx.json(200, {
      cases: out,
      partners: [...partners.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    });
  }

  /* —— Фото комнаты —— */
  const oneMatch = path.match(ONE_PATH);
  const listMatch = oneMatch ? null : path.match(LIST_PATH);
  if (!oneMatch && !listMatch) return null;
  if (listMatch && !['GET', 'POST', 'PATCH'].includes(method)) return null;
  if (oneMatch && !['PATCH', 'DELETE'].includes(method)) return null;

  const { platform, user } = await ctx.requireAuth();
  const objectId = decode((oneMatch || listMatch)[1]);
  const idx = (platform.objects || []).findIndex((item) => item.id === objectId);
  const obj = idx >= 0 ? platform.objects[idx] : null;
  if (!obj || !ctx.objectVisibleTo(user, obj)) return ctx.json(404, { message: 'Комната не найдена' });
  const role = user.role;

  if (listMatch && method === 'GET') {
    const seen = photoStagesRoleSees(role);
    const rows = photoRows(obj).filter((photo) => seen.includes(photo.stage));
    const photos = [];
    for (const photo of [...rows].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))) {
      photos.push(await photoView(ctx, photo));
    }
    return ctx.json(200, {
      photos,
      canAdd: photoStagesRoleAdds(role),
      stages: seen,
      limit: PHOTO_LIMIT_PER_ROOM,
      clientVisible: photoReportVisibleToClient(obj),
      canShareWithClient: canShareReportWithClient(role),
    });
  }

  if (listMatch && method === 'PATCH') {
    // Настройка: показывать ли фотоотчёт клиенту по его ссылке.
    if (!canShareReportWithClient(role)) return ctx.json(403, { message: 'Недостаточно прав' });
    const body = ctx.getBody() || {};
    if (typeof body.clientVisible !== 'boolean') return ctx.json(400, { message: 'Не указан показ клиенту' });
    platform.objects[idx] = { ...obj, photoReport: { clientVisible: body.clientVisible } };
    await ctx.savePlatform(platform);
    return ctx.json(200, { clientVisible: body.clientVisible });
  }

  if (listMatch && method === 'POST') {
    const body = ctx.getBody() || {};
    const stage = String(body.stage || '');
    if (!isPhotoStage(stage)) return ctx.json(400, { message: 'Неизвестный этап фото' });
    if (!user.orgId || !canAddPhoto(role, stage) || obj.orgId !== user.orgId) {
      return ctx.json(403, { message: 'Недостаточно прав' });
    }
    if (photoRows(obj).length >= PHOTO_LIMIT_PER_ROOM) {
      return ctx.json(409, { message: `В комнате уже ${PHOTO_LIMIT_PER_ROOM} фото. Удалите лишние.` });
    }
    const image = decodeJpeg(body.image, IMAGE_MAX_BYTES, IMAGE_MAX_SIDE);
    if (image.error) return ctx.json(image.status || 400, { message: image.error });
    const thumb = decodeJpeg(body.thumb, THUMB_MAX_BYTES, THUMB_MAX_SIDE);
    if (thumb.error) return ctx.json(thumb.status || 400, { message: thumb.error });
    const photoId = ctx.uid('ph');
    const keys = photoKeys(obj.orgId, obj.id, photoId);
    await ctx.storage.put(keys.image, image.buffer, 'image/jpeg');
    await ctx.storage.put(keys.thumb, thumb.buffer, 'image/jpeg');
    const now = new Date().toISOString();
    const photo = {
      id: photoId,
      stage,
      caption: cleanPhotoCaption(body.caption),
      createdAt: now,
      createdBy: user.id,
      authorName: String(user.displayName || user.login || '').slice(0, 80),
      authorRole: role,
      width: image.width,
      height: image.height,
      bytes: image.buffer.length,
      storageKey: keys.image,
      thumbKey: keys.thumb,
    };
    // Запись комнаты правим точечно: остальные поля остаются теми, что прочитали.
    platform.objects[idx] = { ...obj, photos: [photo, ...photoRows(obj)].slice(0, PHOTO_LIMIT_PER_ROOM) };
    ctx.pushActivity?.(platform, {
      orgId: user.orgId,
      userId: user.id,
      login: user.login,
      action: 'room_photo_add',
      detail: `${obj.roomName || obj.id} · ${PHOTO_STAGE_LABELS[stage]}`,
    });
    await ctx.savePlatform(platform);
    return ctx.json(200, { photo: await photoView(ctx, photo) });
  }

  // PATCH/DELETE одной записи.
  const photoId = decode(oneMatch[2]);
  const photo = photoRows(obj).find((item) => item.id === photoId);
  if (!photo || !canSeePhotoStage(role, photo.stage)) return ctx.json(404, { message: 'Фото не найдено' });
  if (!canDeletePhoto(user, photo)) return ctx.json(403, { message: 'Недостаточно прав' });

  if (method === 'PATCH') {
    const body = ctx.getBody() || {};
    const caption = cleanPhotoCaption(body.caption);
    platform.objects[idx] = {
      ...obj,
      photos: photoRows(obj).map((item) => (item.id === photoId ? { ...item, caption } : item)),
    };
    await ctx.savePlatform(platform);
    return ctx.json(200, { photo: await photoView(ctx, { ...photo, caption }) });
  }

  platform.objects[idx] = { ...obj, photos: photoRows(obj).filter((item) => item.id !== photoId) };
  await ctx.savePlatform(platform);
  if (photo.storageKey) await ctx.storage.del(photo.storageKey);
  if (photo.thumbKey) await ctx.storage.del(photo.thumbKey);
  return ctx.json(200, { ok: true });
}

export { PHOTO_STAGES };
