/**
 * Календарь замеров и монтажей и отметки напоминаний.
 *
 * GET    /calendar                 выезды, которые видит роль, люди компании и свои отметки напоминаний.
 *                                  Для admin (и stp_manager, если есть доступ): ?orgId= / ?partner= — только эта компания;
 *                                  в ответе partners — список компаний для фильтра.
 * POST   /calendar                 новый выезд (владелец, менеджер)
 * PATCH  /calendar/{visitId}       правка выезда (владелец, менеджер); замерщик и монтажник — только «выполнено» у своего
 * DELETE /calendar/{visitId}       удалить выезд (владелец, менеджер)
 * POST   /calendar/reminders       «готово», «отложить» или «вернуть» напоминание (каждый — свои)
 *
 * Данные в platform.visits и platform.reminderAcks. Права проверяет сервер; чужая компания — 404.
 */
import {
  VISIT_KIND_LABELS,
  cleanVisitInput,
  findConflicts,
  materializeVisit,
  visitRoleAllowed,
  visitVisibleTo,
} from '../../packages/shared/calendar.js';
import { buildDemoVisits } from './demoVisits.js';

const ACK_KEY_MAX = 300;
const ACK_KEEP_MS = 60 * 24 * 60 * 60 * 1000;

function canonicalRole(role) {
  if (role === 'partner') return 'owner';
  if (role === 'executor') return 'measurer';
  return role;
}

function canPlan(user) {
  return user.role === 'owner' || user.role === 'sales';
}

function visitsOf(platform) {
  return Array.isArray(platform?.visits) ? platform.visits : [];
}

function personName(person) {
  return String(person?.displayName || person?.login || '').trim() || 'Сотрудник';
}

/** Ответ клиенту: запись и подписи (имя исполнителя, проект, адрес, комната, компания). */
function publicVisit(visit, platform, now) {
  const v = materializeVisit(visit, now);
  const person = (platform.users || []).find((u) => u.id === v.userId);
  const project = (platform.projects || []).find((p) => p.id === v.projectId);
  const room = v.objectId ? (platform.objects || []).find((o) => o.id === v.objectId) : null;
  const org = (platform.orgs || []).find((o) => o.id === v.orgId);
  const { demoDay: _d, demoMinute: _m, ...rest } = v;
  void _d;
  void _m;
  return {
    ...rest,
    objectId: v.objectId || null,
    note: v.note || '',
    doneAt: v.doneAt || null,
    userName: person ? personName(person) : 'Сотрудник удалён',
    userRole: person ? canonicalRole(person.role) : null,
    projectName: project?.name || room?.clientName || 'Проект',
    address: [project?.address || room?.address, project?.city || room?.city].filter(Boolean).join(', '),
    roomName: room ? room.roomName || null : null,
    orgName: org?.settings?.companyName || '',
  };
}

/** Кто может фильтровать календарь по компании партнёра. */
function canFilterByPartner(user) {
  return user.role === 'admin' || user.role === 'stp_manager';
}

function peopleFor(user, platform, orgFilter = null) {
  if (!canPlan(user) && user.role !== 'admin' && user.role !== 'stp_manager') return [];
  return (platform.users || [])
    .filter((u) => {
      if (!u.orgId) return false;
      if (orgFilter) return u.orgId === orgFilter;
      if (user.role === 'admin' || user.role === 'stp_manager') return true;
      return u.orgId === user.orgId;
    })
    .filter((u) => ['owner', 'sales', 'measurer', 'crew'].includes(canonicalRole(u.role)) && !u.disabled)
    .map((u) => ({ id: u.id, name: personName(u), role: canonicalRole(u.role), orgId: u.orgId }));
}

/** Компании партнёров для селектора у админа StP (внутреннюю StP не показываем). */
function partnersFor(platform) {
  return (platform.orgs || [])
    .filter((o) => o && o.id && !o.internal)
    .map((o) => ({
      id: o.id,
      name: String(o.settings?.companyName || '').trim() || o.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function validateRefs(value, platform, orgId) {
  const project = (platform.projects || []).find((p) => p.id === value.projectId);
  if (!project || project.orgId !== orgId) {
    throw Object.assign(new Error('Проект не найден'), { status: 400 });
  }
  if (value.objectId) {
    const room = (platform.objects || []).find((o) => o.id === value.objectId);
    if (!room || room.orgId !== orgId || room.projectId !== project.id) {
      throw Object.assign(new Error('Комната не из этого проекта'), { status: 400 });
    }
  }
  const person = (platform.users || []).find((u) => u.id === value.userId);
  if (!person || person.orgId !== orgId) {
    throw Object.assign(new Error('Исполнитель не из этой компании'), { status: 400 });
  }
  if (!visitRoleAllowed(value.kind, person.role)) {
    throw Object.assign(
      new Error(value.kind === 'measure' ? 'На замер назначьте замерщика, менеджера или владельца' : 'На монтаж назначьте монтажника, менеджера или владельца'),
      { status: 400 },
    );
  }
  return project;
}

/** Исполнитель выезда становится замерщиком или монтажником проекта, если там пусто. */
function fillProjectAssignee(project, value, platform) {
  const person = (platform.users || []).find((u) => u.id === value.userId);
  const role = canonicalRole(person?.role);
  if (value.kind === 'measure' && role === 'measurer' && !project.measurerUserId) project.measurerUserId = person.id;
  if (value.kind === 'install' && role === 'crew' && !project.crewUserId) project.crewUserId = person.id;
}

/** На стенде с демо-данными календарь сразу не пустой: выезды появляются при первом чтении. */
function ensureDemoVisits(platform, demoEnabled) {
  if (!demoEnabled || Array.isArray(platform.visits)) return false;
  if (!(platform.orgs || []).some((o) => o.id === 'org_demo')) return false;
  platform.visits = buildDemoVisits(platform);
  return true;
}

/**
 * @returns {Promise<null | {statusCode:number, headers:object, body:string}>}
 */
export async function handleCalendar(ctx) {
  const { path, method } = ctx;
  const listRoute = /\/calendar$/.test(path);
  const itemRoute = /\/calendar\/[^/]+$/.test(path) && !/\/calendar\/reminders$/.test(path);
  const ackRoute = /\/calendar\/reminders$/.test(path);
  if (!listRoute && !itemRoute && !ackRoute) return null;

  const { platform, user } = await ctx.requireAuth();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  if (listRoute && method === 'GET') {
    if (user.role !== 'admin' && user.role !== 'stp_manager' && !user.orgId) {
      return ctx.json(400, { message: 'Нет организации' });
    }
    if (ensureDemoVisits(platform, ctx.demoSeedEnabled?.())) await ctx.savePlatform(platform);
    const query = (typeof ctx.getQuery === 'function' ? ctx.getQuery() : null) || {};
    const requestedOrg = String(query.orgId || query.partner || '').trim() || null;
    let orgFilter = null;
    if (canFilterByPartner(user) && requestedOrg) {
      const org = (platform.orgs || []).find((o) => o.id === requestedOrg && !o.internal);
      if (!org) return ctx.json(404, { message: 'Партнёр не найден' });
      orgFilter = requestedOrg;
    }
    const visits = visitsOf(platform)
      .filter((v) => !v.cancelledAt && visitVisibleTo(user, v))
      .filter((v) => !orgFilter || v.orgId === orgFilter)
      .map((v) => publicVisit(v, platform, now))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const acks = (Array.isArray(platform.reminderAcks) ? platform.reminderAcks : []).filter((a) => a.userId === user.id);
    return ctx.json(200, {
      visits,
      people: peopleFor(user, platform, orgFilter),
      acks,
      canPlan: canPlan(user),
      partners: canFilterByPartner(user) ? partnersFor(platform) : [],
    });
  }

  if (ackRoute && method === 'POST') {
    const body = ctx.getBody() || {};
    const key = String(body.key || '').trim().slice(0, ACK_KEY_MAX);
    const action = String(body.action || '');
    if (!key) return ctx.json(400, { message: 'Нет напоминания' });
    if (!['done', 'snooze', 'reset'].includes(action)) return ctx.json(400, { message: 'Неизвестное действие' });
    let snoozeUntil = null;
    if (action === 'snooze') {
      const until = Date.parse(String(body.until || ''));
      if (Number.isNaN(until) || until <= now || until > now + 30 * 24 * 60 * 60 * 1000) {
        return ctx.json(400, { message: 'Отложить можно на срок до 30 дней' });
      }
      snoozeUntil = new Date(until).toISOString();
    }
    const id = `${user.id}|${key}`;
    const list = (Array.isArray(platform.reminderAcks) ? platform.reminderAcks : []).filter(
      (a) => a.id !== id && now - Date.parse(a.updatedAt || '') < ACK_KEEP_MS,
    );
    const ack = action === 'reset' ? null : { id, userId: user.id, key, doneAt: action === 'done' ? nowIso : null, snoozeUntil, updatedAt: nowIso };
    platform.reminderAcks = ack ? [ack, ...list] : list;
    await ctx.savePlatform(platform);
    return ctx.json(200, { ack });
  }

  if (listRoute && method === 'POST') {
    if (!canPlan(user)) return ctx.json(403, { message: 'Назначать выезды может владелец или менеджер' });
    if (!user.orgId) return ctx.json(400, { message: 'Нет организации' });
    const cleaned = cleanVisitInput(ctx.getBody() || {});
    if (cleaned.error) return ctx.json(400, { message: cleaned.error });
    const value = cleaned.value;
    const project = validateRefs(value, platform, user.orgId);
    const visit = {
      id: ctx.uid('vis'),
      orgId: user.orgId,
      kind: value.kind,
      projectId: value.projectId,
      objectId: value.objectId,
      startsAt: value.startsAt,
      durationMin: value.durationMin,
      userId: value.userId,
      note: value.note,
      doneAt: value.done ? nowIso : null,
      createdBy: user.id,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    platform.visits = [visit, ...visitsOf(platform)];
    fillProjectAssignee(project, value, platform);
    project.updatedAt = nowIso;
    ctx.pushActivity?.(platform, {
      orgId: user.orgId,
      userId: user.id,
      login: user.login,
      action: 'plan_visit',
      detail: `${VISIT_KIND_LABELS[visit.kind]}: ${project.name}`,
    });
    await ctx.savePlatform(platform);
    const all = visitsOf(platform).filter((v) => v.orgId === user.orgId).map((v) => materializeVisit(v, now));
    return ctx.json(200, {
      visit: publicVisit(visit, platform, now),
      conflicts: findConflicts(all, visit).map((v) => publicVisit(v, platform, now)),
    });
  }

  if (!itemRoute || (method !== 'PATCH' && method !== 'DELETE')) return null;
  const visitId = decodeURIComponent(path.split('/').pop() || '');
  const list = visitsOf(platform);
  const idx = list.findIndex((v) => v.id === visitId);
  if (idx < 0 || list[idx].cancelledAt || !visitVisibleTo(user, list[idx])) {
    return ctx.json(404, { message: 'Выезд не найден' });
  }
  const existing = materializeVisit(list[idx], now);

  if (method === 'DELETE') {
    if (!canPlan(user) || existing.orgId !== user.orgId) return ctx.json(403, { message: 'Недостаточно прав' });
    platform.visits = list.filter((v) => v.id !== visitId);
    await ctx.savePlatform(platform);
    return ctx.json(200, { ok: true });
  }

  const body = ctx.getBody() || {};
  if (!canPlan(user)) {
    // Замерщик и монтажник отмечают только «выполнено» у своего выезда.
    const keys = Object.keys(body).filter((k) => k !== 'done');
    if (user.role === 'admin' || existing.userId !== user.id || keys.length || !('done' in body)) {
      return ctx.json(403, { message: 'Менять выезд может владелец или менеджер' });
    }
    const next = { ...list[idx], doneAt: body.done ? nowIso : null, updatedAt: nowIso };
    platform.visits = list.map((v, i) => (i === idx ? next : v));
    await ctx.savePlatform(platform);
    return ctx.json(200, { visit: publicVisit(next, platform, now), conflicts: [] });
  }
  if (existing.orgId !== user.orgId) return ctx.json(403, { message: 'Недостаточно прав' });
  const cleaned = cleanVisitInput(body, { ...existing, done: Boolean(existing.doneAt) });
  if (cleaned.error) return ctx.json(400, { message: cleaned.error });
  const value = cleaned.value;
  const project = validateRefs(value, platform, existing.orgId);
  const { demo: _demo, demoDay: _dd, demoMinute: _dm, ...plain } = existing;
  void _demo;
  void _dd;
  void _dm;
  const next = {
    ...plain,
    kind: value.kind,
    projectId: value.projectId,
    objectId: value.objectId,
    startsAt: value.startsAt,
    durationMin: value.durationMin,
    userId: value.userId,
    note: value.note,
    doneAt: value.done ? existing.doneAt || nowIso : null,
    updatedAt: nowIso,
  };
  platform.visits = list.map((v, i) => (i === idx ? next : v));
  fillProjectAssignee(project, value, platform);
  await ctx.savePlatform(platform);
  const all = visitsOf(platform).filter((v) => v.orgId === existing.orgId).map((v) => materializeVisit(v, now));
  return ctx.json(200, {
    visit: publicVisit(next, platform, now),
    conflicts: findConflicts(all, next).map((v) => publicVisit(v, platform, now)),
  });
}
