/**
 * Ссылка для клиента на результат Проблемомера.
 *
 * Запись ссылки лежит отдельно от комнаты в platform.roomShares (одна запись на комнату,
 * id = shr_<id комнаты>), поэтому GET /objects её не отдаёт. В записи — случайный токен
 * (24 байта из crypto, 192 бита) и снимок ответов комнаты на момент создания или обновления.
 *
 * Публичный GET /public/rooms/<токен> не требует входа и отдаёт только снимок, прошедший
 * белый список: тип и название комнаты, площадь, ответы про перекрытие и шум.
 * Цен, имени и телефона клиента, адреса, проекта, сотрудников и компании в ответе нет —
 * их нет и в снимке: ответ собирается из явного списка полей, а не вычитанием лишнего.
 * Выключенная, неизвестная или с удалённой комнатой ссылка отвечает одинаково: 404.
 */
import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 24;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const NAME_MAX = 80;
const AREA_MAX = 2000;

/** Кто создаёт и обновляет ссылку, и кто её отключает. Монтажник ссылку только читает. */
const CREATE_ROLES = ['owner', 'sales', 'measurer'];
const DISABLE_ROLES = ['owner', 'sales'];

const ENUMS = {
  roomType: ['living', 'bedroom', 'kids', 'kitchen', 'office', 'other'],
  slabType: ['monolith', 'hollow', 'wood', 'unknown'],
  slabThickness: ['up_to_160', 'about_160_200', 'about_200_250', 'over_250', 'unknown'],
  floorAbove: ['unknown', 'ordinary', 'floating'],
  houseType: ['panel', 'block', 'brick', 'monolith', 'wood', 'unknown'],
  objectStage: ['newbuild', 'renovation', 'occupied', 'unknown'],
  plannedCeiling: ['stretch', 'gypsum', 'plaster', 'other_exists', 'unknown'],
  noisyNeighbors: ['unknown', 'usually_quiet', 'sometimes_noisy', 'often_noisy'],
  noiseKind: ['impact', 'airborne', 'mixed', 'unknown'],
};
const WISHES = ['from_above', 'privacy_out', 'music_recording', 'general', 'other'];

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/** Белый список ответов Проблемомера. Любое чужое поле отбрасывается, неверное значение — «не знаю». */
export function sanitizeRoomAnswers(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const roomType = ENUMS.roomType.includes(src.roomType) ? src.roomType : null;
  const area = Number(src.ceilingAreaM2);
  const wishes = Array.isArray(src.roomWishes)
    ? [...new Set(src.roomWishes.filter((w) => WISHES.includes(w)))]
    : [];
  return {
    roomType,
    roomTypeCustom: roomType === 'other' ? String(src.roomTypeCustom ?? '').trim().slice(0, NAME_MAX) : '',
    ceilingAreaM2: Number.isFinite(area) && area > 0 && area <= AREA_MAX ? Math.round(area * 10) / 10 : null,
    slabType: pick(src.slabType, ENUMS.slabType, 'unknown'),
    slabThickness: pick(src.slabThickness, ENUMS.slabThickness, 'unknown'),
    floorAbove: pick(src.floorAbove, ENUMS.floorAbove, 'unknown'),
    houseType: pick(src.houseType, ENUMS.houseType, 'unknown'),
    objectStage: pick(src.objectStage, ENUMS.objectStage, 'unknown'),
    plannedCeiling: 'stretch',
    noisyNeighbors: pick(src.noisyNeighbors, ENUMS.noisyNeighbors, 'unknown'),
    noiseKind: pick(src.noiseKind, ENUMS.noiseKind, 'unknown'),
    roomWishes: wishes.length ? wishes : ['from_above', 'privacy_out', 'music_recording'],
  };
}

function shareRows(platform) {
  if (!Array.isArray(platform.roomShares)) platform.roomShares = [];
  return platform.roomShares;
}

export function newShareToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function shareId(objectId) {
  return `shr_${objectId}`;
}

/** Ответ владельцу и менеджеру: токен и состояние. Снимка здесь нет. */
function ownerView(row) {
  if (!row || row.enabled !== true || !row.token) {
    // disabled: ссылку отключили вручную; PDF её заново не включает.
    return { enabled: false, token: null, disabled: Boolean(row?.disabledAt) };
  }
  return { enabled: true, token: row.token, updatedAt: row.updatedAt };
}

/** Публичный ответ по токену. Единственное место, откуда данные уходят без входа. */
function publicView(row) {
  return {
    roomName: String(row.snapshot?.roomName ?? '').trim().slice(0, NAME_MAX),
    room: sanitizeRoomAnswers(row.snapshot?.room),
    updatedAt: row.updatedAt,
  };
}

const SHARE_PATH = /\/objects\/([^/]+)\/share$/;
const PUBLIC_PATH = /\/public\/rooms\/([^/]+)$/;

export async function handleRoomShare(ctx) {
  const { path, method } = ctx;

  const publicMatch = path.match(PUBLIC_PATH);
  if (publicMatch) {
    if (method !== 'GET') return null;
    const notFound = () => ctx.json(404, { message: 'Ссылка недоступна' });
    let token = publicMatch[1];
    try {
      token = decodeURIComponent(token);
    } catch {
      return notFound();
    }
    if (!TOKEN_RE.test(token)) return notFound();
    const platform = await ctx.loadPlatform();
    const row = shareRows(platform).find((item) => item.enabled === true && item.token === token);
    if (!row) return notFound();
    const obj = (platform.objects || []).find((o) => o.id === row.objectId && o.orgId === row.orgId);
    if (!obj) return notFound();
    return ctx.json(200, { share: publicView(row) });
  }

  const match = path.match(SHARE_PATH);
  if (!match) return null;
  if (!['GET', 'POST', 'DELETE'].includes(method)) return null;

  const { platform, user } = await ctx.requireAuth();
  const objectId = decodeURIComponent(match[1]);
  const obj = (platform.objects || []).find((o) => o.id === objectId);
  if (!obj || !ctx.objectVisibleTo(user, obj)) return ctx.json(404, { message: 'Комната не найдена' });
  const rows = shareRows(platform);
  const idx = rows.findIndex((item) => item.id === shareId(objectId));
  const row = idx >= 0 ? rows[idx] : null;

  if (method === 'GET') {
    return ctx.json(200, { link: ownerView(row) });
  }

  if (method === 'POST') {
    if (!CREATE_ROLES.includes(user.role) || !user.orgId) {
      return ctx.json(403, { message: 'Недостаточно прав' });
    }
    const body = ctx.getBody() || {};
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : obj.room?.answers;
    if (!answers || typeof answers !== 'object') {
      return ctx.json(400, { message: 'Сначала пройдите Проблемомер для этой комнаты' });
    }
    const now = new Date().toISOString();
    const snapshot = {
      room: sanitizeRoomAnswers({ ...answers, roomType: answers.roomType ?? obj.room?.roomType }),
      roomName: String(obj.roomName ?? '').trim().slice(0, NAME_MAX),
    };
    const reuse = row && row.enabled === true && row.token ? row : null;
    const next = {
      id: shareId(objectId),
      objectId,
      orgId: obj.orgId,
      enabled: true,
      token: reuse ? reuse.token : newShareToken(),
      createdAt: reuse?.createdAt || now,
      createdBy: reuse?.createdBy || user.id,
      updatedAt: now,
      updatedBy: user.id,
      snapshot,
    };
    if (idx >= 0) rows[idx] = next;
    else rows.push(next);
    if (!reuse) {
      ctx.pushActivity(platform, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'share_link_create',
        detail: obj.roomName || obj.id,
      });
    }
    await ctx.savePlatform(platform);
    return ctx.json(200, { link: ownerView(next) });
  }

  // DELETE: отключить. Токен и снимок стираются, повторное включение выдаёт новый токен.
  if (!DISABLE_ROLES.includes(user.role)) {
    return ctx.json(403, { message: 'Недостаточно прав' });
  }
  if (row && row.enabled === true) {
    rows[idx] = {
      id: row.id,
      objectId: row.objectId,
      orgId: row.orgId,
      enabled: false,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      disabledAt: new Date().toISOString(),
      disabledBy: user.id,
      updatedAt: new Date().toISOString(),
    };
    ctx.pushActivity(platform, {
      orgId: user.orgId,
      userId: user.id,
      login: user.login,
      action: 'share_link_disable',
      detail: obj.roomName || obj.id,
    });
    await ctx.savePlatform(platform);
  }
  return ctx.json(200, { link: { enabled: false, token: null } });
}
