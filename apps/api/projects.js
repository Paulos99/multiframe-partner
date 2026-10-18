/**
 * Проекты компании. Запись живёт в platform.projects и не обязательна,
 * пока проект не создан: чтение отсутствующего ключа — пустой список.
 * Привязка помещения — это projectId на объекте, не отдельный маршрут.
 */

const NAME_MAX = 250;
const TEXT_MAX = 250;
const PHONE_MAX = 80;
const CITY_MAX = 120;
const ROOM_MAX = 120;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function projectRows(platform) {
  return Array.isArray(platform?.projects) ? platform.projects : [];
}

/** Ответ клиенту: только поля контракта, без смет и итогов. */
export function publicProject(project) {
  return {
    id: project.id,
    orgId: project.orgId,
    name: project.name,
    clientName: project.clientName || '',
    clientPhone: project.clientPhone || '',
    address: project.address || '',
    city: project.city || '',
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
    return (platform.objects || []).some(
      (obj) => obj.projectId === project.id && objectVisibleTo(user, obj),
    );
  }
  return false;
}

function clientProjectId(raw) {
  const id = String(raw || '').trim();
  return /^prj_[a-z0-9]+$/i.test(id) ? id : '';
}

function writeProject(body, existing, actor, uid) {
  const name = text(body.name !== undefined ? body.name : existing?.name, NAME_MAX);
  if (!name) throw httpError(400, 'Укажите название проекта');
  const pick = (key, max) =>
    text(body[key] !== undefined ? body[key] : existing?.[key], max);
  const now = new Date().toISOString();
  return {
    id: existing?.id || clientProjectId(body.id) || uid('prj'),
    orgId: existing?.orgId || actor.orgId,
    name,
    clientName: pick('clientName', TEXT_MAX),
    clientPhone: pick('clientPhone', PHONE_MAX),
    address: pick('address', TEXT_MAX),
    city: pick('city', CITY_MAX),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || actor.id,
  };
}

/**
 * Белый список projectId и roomName для normalizeObjectInput.
 * Отсутствующее поле не затирает уже сохранённое. Чужой или неизвестный проект — ошибка.
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
      fields.projectId = null;
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
 * @returns {Promise<null | {statusCode:number, headers:object, body:string}>}
 */
export async function handleProjects(ctx) {
  const { path, method } = ctx;
  const listRoute = path.endsWith('/projects');
  const itemRoute = /\/projects\/[^/]+$/.test(path);
  if (!listRoute && !itemRoute) return null;
  if (listRoute && method !== 'GET' && method !== 'POST') return null;
  if (itemRoute && method !== 'PATCH') return null;

  const { platform, user } = await ctx.requireAuth();
  const rows = projectRows(platform);

  if (method === 'GET' && listRoute) {
    const projects = rows
      .filter((project) => projectVisible(user, project, platform, ctx.objectVisibleTo))
      .map(publicProject);
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
    const project = writeProject(body, found, user, ctx.uid);
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
    return ctx.json(200, { project: publicProject(project) });
  }

  const projectId = decodeURIComponent(path.split('/').pop() || '');
  const idx = rows.findIndex((project) => project.id === projectId);
  if (idx < 0 || !projectVisible(user, rows[idx], platform, ctx.objectVisibleTo)) {
    return ctx.json(404, { message: 'Проект не найден' });
  }
  const project = writeProject(ctx.getBody() || {}, rows[idx], user, ctx.uid);
  if (!Array.isArray(platform.projects)) platform.projects = rows.slice();
  platform.projects[idx] = project;
  await ctx.savePlatform(platform);
  return ctx.json(200, { project: publicProject(project) });
}
