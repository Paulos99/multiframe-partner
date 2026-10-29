/**
 * Проекты компании. Проект — клиент и адрес, комната — объект с roomName.
 * Новых объектов без проекта не бывает: создание само заводит проект.
 * Уже сохранённый объект нельзя отвязать в пустоту, только перенести в другой проект своей компании.
 * Чтение отсутствующего ключа platform.projects — пустой список.
 */

import {
  PROJECT_STATUSES,
  cleanProjectDate,
  cleanProjectStatus,
} from '../../packages/shared/projectAccess.js';
import {
  cleanClientPhone,
  phoneStageAllowed,
  projectStageOf,
  roleSeesClientPhone,
} from '../../packages/shared/clientPhone.js';
import { cleanRefusal } from '../../packages/shared/refusal.js';

const NAME_MAX = 250;
const TEXT_MAX = 250;
const CITY_MAX = 120;
const ROOM_MAX = 120;
const DESCRIPTION_MAX = 4000;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function projectRows(platform) {
  return Array.isArray(platform?.projects) ? platform.projects : [];
}

/**
 * Ответ клиенту: поля проекта, без смет и итогов. Статус пуст, пока его не сохранили.
 * Телефон клиента отдаётся владельцу, менеджеру, замерщику и монтажнику, только с этапа «Замер».
 * Без роли (viewer) и для админа сети он всегда пустой.
 */
export function publicProject(project, viewer = null, platform = null) {
  const status = PROJECT_STATUSES.includes(project.status) ? project.status : undefined;
  const rooms = (platform?.objects || []).filter((obj) => obj.projectId === project.id);
  const showPhone =
    Boolean(viewer) && roleSeesClientPhone(viewer.role) && phoneStageAllowed(projectStageOf(project, rooms));
  return {
    id: project.id,
    orgId: project.orgId,
    name: project.name,
    clientName: project.clientName || '',
    clientPhone: showPhone ? project.clientPhone || '' : '',
    address: project.address || '',
    city: project.city || '',
    description: project.description || '',
    ...(status ? { status } : {}),
    ...(status === 'done' && project.refusal ? { refusal: project.refusal } : {}),
    managerUserId: project.managerUserId || null,
    measurerUserId: project.measurerUserId || null,
    crewUserId: project.crewUserId || null,
    startsAt: project.startsAt || null,
    dueAt: project.dueAt || null,
    archivedAt: project.archivedAt || null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    createdBy: project.createdBy,
  };
}

function canWriteProject(user) {
  return user.role === 'owner' || user.role === 'sales';
}

function projectVisible(user, project, platform, objectVisibleTo) {
  if (user.role === 'admin') return true;
  if (!user.orgId || project.orgId !== user.orgId) return false;
  if (user.role === 'owner' || user.role === 'sales') return true;
  if (user.role === 'measurer' || user.role === 'crew') {
    const named =
      (user.role === 'measurer' && project.measurerUserId === user.id) ||
      (user.role === 'crew' && project.crewUserId === user.id);
    if (named) return true;
    return (platform.objects || []).some(
      (obj) => obj.projectId === project.id && objectVisibleTo(user, obj),
    );
  }
  return false;
}

function canonicalRole(role) {
  if (role === 'partner') return 'owner';
  if (role === 'executor') return 'measurer';
  return role;
}

function assignee(body, existing, key, platform, orgId, roles, label) {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return existing?.[key] || null;
  const raw = body[key];
  if (raw == null || String(raw).trim() === '') return null;
  const id = String(raw).trim();
  const person = (platform?.users || []).find((user) => user.id === id);
  if (!person || person.orgId !== orgId || !roles.includes(canonicalRole(person.role))) {
    throw httpError(400, `${label} не из этой компании`);
  }
  return person.id;
}

function dateField(body, existing, key) {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return existing?.[key] || null;
  const cleaned = cleanProjectDate(body[key]);
  if (cleaned.error) throw httpError(400, cleaned.error);
  return cleaned.value;
}

function statusField(body, existing) {
  if (!Object.prototype.hasOwnProperty.call(body, 'status')) return existing?.status;
  const cleaned = cleanProjectStatus(body.status);
  if (cleaned.error) throw httpError(400, cleaned.error);
  return cleaned.value;
}

/**
 * Телефон клиента проекта. Новый номер принимается только с этапа «Замер»:
 * стадия берётся из итогового статуса проекта или из комнат. Очистка и неизменённое значение проходят всегда.
 */
function phoneField(body, existing, status, platform) {
  const current = String(existing?.clientPhone ?? '').trim();
  if (!Object.prototype.hasOwnProperty.call(body, 'clientPhone')) return current;
  const raw = String(body.clientPhone ?? '').trim();
  if (raw === current) return current;
  const cleaned = cleanClientPhone(raw);
  if (cleaned.error) throw httpError(400, cleaned.error);
  if (cleaned.value) {
    const rooms = (platform?.objects || []).filter((obj) => existing && obj.projectId === existing.id);
    const stage = projectStageOf({ status }, rooms);
    if (!phoneStageAllowed(stage)) {
      throw httpError(400, 'Телефон клиента можно указать с этапа «Замер»');
    }
  }
  return cleaned.value;
}

/** Отказ клиента: запись есть только у проекта в статусе «Завершён» (done), причина обязательна. */
function refusalField(body, existing, status, actor, now) {
  if (status !== 'done') return null;
  const cleaned = cleanRefusal(body.refusal, {
    userId: actor.id,
    now,
    existing: existing?.status === 'done' ? existing?.refusal || null : null,
  });
  if (cleaned.error) throw httpError(400, cleaned.error);
  return cleaned.value || null;
}

function archiveField(body, existing) {
  if (!Object.prototype.hasOwnProperty.call(body, 'archived')) return existing?.archivedAt || null;
  if (body.archived) return existing?.archivedAt || new Date().toISOString();
  return null;
}

function clientProjectId(raw) {
  const id = String(raw || '').trim();
  return /^prj_[a-z0-9]+$/i.test(id) ? id : '';
}

function writeProject(body, existing, actor, uid, platform) {
  const source = body && typeof body === 'object' ? body : {};
  const name = text(source.name !== undefined ? source.name : existing?.name, NAME_MAX);
  if (!name) throw httpError(400, 'Укажите название проекта');
  const pick = (key, max) =>
    text(source[key] !== undefined ? source[key] : existing?.[key], max);
  const orgId = existing?.orgId || actor.orgId;
  const now = new Date().toISOString();
  const status = statusField(source, existing);
  const clientPhone = phoneField(source, existing, status, platform);
  const refusal = refusalField(source, existing, status, actor, now);
  return {
    id: existing?.id || clientProjectId(source.id) || uid('prj'),
    orgId,
    name,
    clientName: pick('clientName', TEXT_MAX),
    clientPhone,
    address: pick('address', TEXT_MAX),
    city: pick('city', CITY_MAX),
    description: pick('description', DESCRIPTION_MAX),
    ...(status ? { status } : {}),
    ...(refusal ? { refusal } : {}),
    managerUserId: assignee(source, existing, 'managerUserId', platform, orgId, ['owner', 'sales'], 'Менеджер'),
    measurerUserId: assignee(source, existing, 'measurerUserId', platform, orgId, ['measurer'], 'Замерщик'),
    crewUserId: assignee(source, existing, 'crewUserId', platform, orgId, ['crew'], 'Бригада'),
    startsAt: dateField(source, existing, 'startsAt'),
    dueAt: dateField(source, existing, 'dueAt'),
    archivedAt: archiveField(source, existing),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || actor.id,
  };
}

/**
 * Белый список projectId и roomName для normalizeObjectInput.
 * Отсутствующее поле не затирает уже сохранённое. Чужой или неизвестный проект — ошибка.
 * Пустой projectId у привязанного объекта — отказ, а не отвязка.
 * @returns {Record<string, string | null>}
 */
export function applyObjectProjectFields(body, existing, platform, orgId) {
  const source = body && typeof body === 'object' ? body : {};
  /** @type {Record<string, string | null>} */
  const fields = {};
  if (Object.prototype.hasOwnProperty.call(source, 'roomName')) {
    const raw = source.roomName;
    fields.roomName = raw == null || String(raw).trim() === '' ? null : text(raw, ROOM_MAX);
  } else if (existing && Object.prototype.hasOwnProperty.call(existing, 'roomName')) {
    fields.roomName = existing.roomName ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'projectId')) {
    const raw = source.projectId;
    if (raw == null || String(raw).trim() === '') {
      if (existing?.projectId) throw httpError(400, 'Нельзя отвязать помещение от проекта');
    } else {
      const id = String(raw).trim();
      const project = projectRows(platform).find((item) => item.id === id);
      if (!project) throw httpError(404, 'Проект не найден');
      if (!orgId || project.orgId !== orgId) {
        throw httpError(400, 'Проект принадлежит другой компании');
      }
      fields.projectId = project.id;
    }
  } else if (existing && Object.prototype.hasOwnProperty.call(existing, 'projectId')) {
    fields.projectId = existing.projectId ?? null;
  }
  return fields;
}

/**
 * Новый объект без projectId получает проект той же компании.
 * Имя берётся из клиента, адреса или названия комнаты.
 * Уже существующий объект эта функция не меняет.
 * @returns {{ body: object, project: object | null }}
 */
export function ensureProjectForNewObject(platform, body, actor, uid) {
  const source = body && typeof body === 'object' ? { ...body } : {};
  const raw = Object.prototype.hasOwnProperty.call(source, 'projectId') ? source.projectId : undefined;
  if (raw != null && String(raw).trim() !== '') return { body: source, project: null };
  if (!actor?.orgId) throw httpError(400, 'Нет организации');
  const project = writeProject(
    {
      name:
        text(source.clientName, NAME_MAX) ||
        text(source.address, TEXT_MAX) ||
        text(source.roomName, ROOM_MAX) ||
        'Проект',
      clientName: source.clientName,
      address: source.address,
      city: source.city,
    },
    null,
    actor,
    uid,
    platform,
  );
  if (!Array.isArray(platform.projects)) platform.projects = [];
  platform.projects = [project, ...platform.projects];
  return { body: { ...source, projectId: project.id }, project };
}

/**
 * @returns {Promise<null | {statusCode:number, headers:object, body:string}>}
 */
export async function handleProjects(ctx) {
  const { path, method } = ctx;
  const listRoute = path.endsWith('/projects');
  const itemRoute = /\/projects\/[^/]+$/.test(path);
  if (!listRoute && !itemRoute) return null;
  if (listRoute && method !== 'GET' && method !== 'POST') return null;
  if (itemRoute && method !== 'PATCH' && method !== 'DELETE') return null;

  const { platform, user } = await ctx.requireAuth();
  const rows = projectRows(platform);

  if (method === 'GET' && listRoute) {
    const projects = rows
      .filter((project) => projectVisible(user, project, platform, ctx.objectVisibleTo))
      .map((project) => publicProject(project, user, platform));
    return ctx.json(200, { projects });
  }

  if (!canWriteProject(user)) return ctx.json(403, { message: 'Недостаточно прав' });
  if (!user.orgId) return ctx.json(400, { message: 'Нет организации' });

  if (method === 'POST' && listRoute) {
    const body = ctx.getBody() || {};
    const requested = clientProjectId(body.id);
    const found = requested ? rows.find((project) => project.id === requested) : null;
    if (found && found.orgId !== user.orgId) {
      return ctx.json(403, { message: 'Недостаточно прав' });
    }
    const project = writeProject(body, found, user, ctx.uid, platform);
    if (!Array.isArray(platform.projects)) platform.projects = [];
    if (found) {
      const idx = platform.projects.findIndex((item) => item.id === found.id);
      platform.projects[idx] = project;
    } else {
      platform.projects = [project, ...platform.projects];
    }
    if (!found && ctx.pushActivity) {
      ctx.pushActivity(platform, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'create_project',
        detail: project.name,
      });
    }
    await ctx.savePlatform(platform);
    return ctx.json(200, { project: publicProject(project, user, platform) });
  }

  const projectId = decodeURIComponent(path.split('/').pop() || '');
  const idx = rows.findIndex((project) => project.id === projectId);

  if (method === 'DELETE' && itemRoute) {
    if (!canWriteProject(user)) return ctx.json(403, { message: 'Недостаточно прав' });
    if (idx < 0 || rows[idx].orgId !== user.orgId) {
      return ctx.json(404, { message: 'Проект не найден' });
    }
    const doomed = (platform.objects || []).filter((obj) => obj.projectId === projectId);
    platform.projects = projectRows(platform).filter((item) => item.id !== projectId);
    platform.objects = (platform.objects || []).filter((obj) => obj.projectId !== projectId);
    if (ctx.pushActivity) {
      ctx.pushActivity(platform, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'delete_project',
        detail: rows[idx].name,
      });
    }
    await ctx.savePlatform(platform);
    if (ctx.deleteStorage) {
      for (const obj of doomed) {
        for (const doc of obj.documents || []) {
          if (doc.storageKey) await ctx.deleteStorage(doc.storageKey);
        }
        for (const photo of obj.photos || []) {
          if (photo.storageKey) await ctx.deleteStorage(photo.storageKey);
          if (photo.thumbKey) await ctx.deleteStorage(photo.thumbKey);
        }
      }
    }
    return ctx.json(200, { ok: true });
  }

  if (idx < 0 || !projectVisible(user, rows[idx], platform, ctx.objectVisibleTo)) {
    return ctx.json(404, { message: 'Проект не найден' });
  }
  const project = writeProject(ctx.getBody() || {}, rows[idx], user, ctx.uid, platform);
  if (!Array.isArray(platform.projects)) platform.projects = rows.slice();
  platform.projects[idx] = project;
  await ctx.savePlatform(platform);
  return ctx.json(200, { project: publicProject(project, user, platform) });
}
