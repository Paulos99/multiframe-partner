/**
 * Объекты (JobObject). Логика делегируется через ctx — index сохраняет детальную реализацию,
 * этот модуль — точка расширения и проверка org-изоляции для тестов волны 1.
 */

/**
 * Видимость с учётом assignments (PRD MF-05).
 * Старое assignedTo остаётся запасным ключом.
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
