/**
 * Объекты (JobObject). Логика делегируется через ctx — index сохраняет детальную реализацию,
 * этот модуль — точка расширения и проверка org-изоляции для тестов волны 1.
 */

/**
 * Карточки ведут владелец и менеджер своей компании.
 * Администратор сети чужие комнаты не заводит. Замерщик и монтажник тоже.
 */
export function canCreateCompanyObjects(role) {
  return role === 'owner' || role === 'sales';
}

/**
 * Правка, смена шага, порядок и привязка к проекту — только своя компания.
 * Администратор сети чужие карточки не двигает (концепция 5.5).
 */
export function canManageCompanyObjects(role) {
  return role === 'owner' || role === 'sales';
}

/** Удаление комнат своей компании. Администратор сети, замерщик и бригада не удаляют. */
export function canDeleteCompanyObjects(role) {
  return role === 'owner' || role === 'sales';
}

/** Замерщику можно писать расчёт только в назначенную ему комнату. */
export function measurerMaySaveCalculation(user, obj) {
  if (!user || user.role !== 'measurer' || !obj) return false;
  const assigned = obj.assignments || {};
  return obj.createdBy === user.id || obj.assignedTo === user.id || assigned.measurerUserId === user.id;
}

/**
 * Видимость с учётом assignments (PRD MF-05).
 * Старое assignedTo остаётся запасным ключом.
 * Владелец и менеджер видят все объекты своей компании. Чужая компания закрыта.
 */
export function objectVisibleWithAssignments(user, obj) {
  if (user.role === 'admin') return true;
  if (!user.orgId || obj.orgId !== user.orgId) return false;
  if (user.role === 'owner' || user.role === 'sales') return true;
  const a = obj.assignments || {};
  const ids = [obj.assignedTo, a.salesUserId, a.measurerUserId, a.crewUserId].filter(Boolean);
  if (user.role === 'measurer') {
    return obj.createdBy === user.id || ids.includes(user.id);
  }
  if (user.role === 'crew') {
    return a.crewUserId === user.id || obj.assignedTo === user.id;
  }
  return false;
}

/**
 * Чужая orgId никогда не должна пройти. Возвращает false при попытке.
 */
export function assertSameOrg(user, resourceOrgId) {
  if (user.role === 'admin') return true;
  return Boolean(user.orgId && resourceOrgId && user.orgId === resourceOrgId);
}

/** Нормализация assignments при записи объекта. */
export function mergeAssignments(body, existing) {
  const prev = existing?.assignments || {
    salesUserId: null,
    measurerUserId: null,
    crewUserId: null,
  };
  if (!body || body.assignments === undefined) {
    if (body?.assignedTo !== undefined && !existing?.assignments) {
      return { ...prev, measurerUserId: body.assignedTo };
    }
    return prev;
  }
  const raw = body.assignments && typeof body.assignments === 'object' ? body.assignments : {};
  return {
    salesUserId: raw.salesUserId !== undefined ? raw.salesUserId : prev.salesUserId,
    measurerUserId: raw.measurerUserId !== undefined ? raw.measurerUserId : prev.measurerUserId,
    crewUserId: raw.crewUserId !== undefined ? raw.crewUserId : prev.crewUserId,
  };
}
