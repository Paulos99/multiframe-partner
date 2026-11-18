/**
 * Заявки сотрудников на подключение к уже зарегистрированной компании.
 * До одобрения владельцем или менеджером человек не входит в компанию: у учётки нет orgId.
 * Поиск компаний для формы — по подстроке, без полной выдачи списка.
 */
import { STP_ORG_ID } from '../../packages/shared/rolePermissions.js';
import { STAFF_ASSIGNABLE_ROLES } from '../../packages/shared/schemas.js';
import { registrationStatus } from './registration.js';

export const JOIN_STATUSES = ['pending', 'approved', 'rejected'];
export const COMPANY_SEARCH_MIN = 2;
export const COMPANY_SEARCH_LIMIT = 10;

/** Частота поиска компаний с одного адреса. */
export function companySearchRateLimit() {
  return { limit: 30, windowMs: 60 * 1000 };
}

export function normalizeCompanyQuery(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

export function orgDisplayName(org) {
  return String(org?.settings?.companyName || '').trim();
}

/** Компанию можно выбрать в регистрации сотрудника: есть название, заявка владельца не отклонена, это не StP. */
export function isSearchableCompany(org) {
  if (!org?.id || org.id === STP_ORG_ID) return false;
  if (!orgDisplayName(org)) return false;
  return registrationStatus(org) !== 'rejected';
}

/**
 * Подходящие компании по введённому тексту: сначала те, чьё название начинается с запроса.
 * @returns {{ id: string, name: string }[]}
 */
export function searchCompanies(orgs, query, limit = COMPANY_SEARCH_LIMIT) {
  const q = normalizeCompanyQuery(query);
  if (q.length < COMPANY_SEARCH_MIN) return [];
  const cap = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(20, Math.floor(Number(limit)))
    : COMPANY_SEARCH_LIMIT;
  const hits = [];
  for (const org of orgs || []) {
    if (!isSearchableCompany(org)) continue;
    const name = orgDisplayName(org);
    const key = normalizeCompanyQuery(name);
    if (!key.includes(q)) continue;
    hits.push({ id: org.id, name, rank: key.startsWith(q) ? 0 : 1 });
  }
  hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
  return hits.slice(0, cap).map(({ id, name }) => ({ id, name }));
}

/** Только чтение: замороженный снимок платформы не дополняем. */
export function listJoinRequests(platform) {
  return Array.isArray(platform?.staffJoinRequests) ? platform.staffJoinRequests : [];
}

/** Для записи: заводим массив заявок в изменяемом документе. */
export function ensureJoinRequests(platform) {
  if (!Array.isArray(platform.staffJoinRequests)) platform.staffJoinRequests = [];
  return platform.staffJoinRequests;
}

export function findJoinRequest(platform, id) {
  return listJoinRequests(platform).find((row) => row.id === id) || null;
}

export function joinsForUser(platform, userId) {
  return listJoinRequests(platform)
    .filter((row) => row.userId === userId)
    .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
}

export function latestJoinForUser(platform, userId) {
  return joinsForUser(platform, userId)[0] || null;
}

export function pendingJoinForUser(platform, userId) {
  return listJoinRequests(platform).find((row) => row.userId === userId && row.status === 'pending') || null;
}

/** Есть незакрытая заявка у этой учётки или с этим логином. */
export function hasPendingJoin(platform, { userId, login } = {}) {
  const lower = String(login || '').toLowerCase();
  return listJoinRequests(platform).some((row) => {
    if (row.status !== 'pending') return false;
    if (userId && row.userId === userId) return true;
    return Boolean(lower) && String(row.login || '').toLowerCase() === lower;
  });
}

export function newStaffJoin({ id, userId, orgId, role, firstName, lastName, displayName, login, phone = '', at }) {
  return {
    id,
    userId,
    orgId,
    role,
    firstName,
    lastName,
    displayName,
    login,
    phone: phone || '',
    status: 'pending',
    submittedAt: at,
  };
}

export function decideStaffJoin(request, { status, role, reason = '', by, at }) {
  const next = { ...(request || {}), status, decidedAt: at, decidedBy: by };
  if (status === 'approved' && role) next.role = role;
  if (status === 'rejected' && reason) next.reason = reason;
  else delete next.reason;
  return next;
}

/** Что видит сам заявитель в сеансе: без внутренних полей решения. */
export function publicStaffJoin(request, org) {
  if (!request || !JOIN_STATUSES.includes(request.status) || request.status === 'approved') return null;
  const out = {
    status: request.status,
    role: request.role,
    companyName: orgDisplayName(org),
  };
  if (request.status === 'rejected' && request.reason) out.reason = String(request.reason);
  return out;
}

export function joinAccessError(request) {
  if (request?.status === 'rejected') {
    const reason = String(request.reason || '').trim();
    return Object.assign(new Error(reason ? `Заявка отклонена. ${reason}` : 'Заявка отклонена'), {
      status: 403,
      code: 'join_rejected',
    });
  }
  return Object.assign(new Error('Заявка на рассмотрении'), { status: 403, code: 'join_pending' });
}

/** Учётка без компании, заявка ещё не одобрена — кабинет закрыт. */
export function blockedJoinOf(platform, user) {
  if (!user || user.orgId) return null;
  const join = latestJoinForUser(platform, user.id);
  if (join && (join.status === 'pending' || join.status === 'rejected')) return join;
  return null;
}

export function canDecideStaffJoin(user, request) {
  if (!user || !request) return false;
  if (!user.orgId || user.orgId !== request.orgId) return false;
  return user.role === 'owner' || user.role === 'sales';
}

export function isAssignableStaffRole(role) {
  return STAFF_ASSIGNABLE_ROLES.includes(role);
}

export function listCompanyJoins(platform, orgId) {
  return listJoinRequests(platform)
    .filter((row) => row.orgId === orgId && (row.status === 'pending' || row.status === 'rejected'))
    .sort((a, b) => {
      const statusRank = (row) => (row.status === 'pending' ? 0 : 1);
      return statusRank(a) - statusRank(b)
        || String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));
    });
}

export function publicJoinRow(request) {
  if (!request) return null;
  return {
    id: request.id,
    userId: request.userId,
    login: request.login,
    displayName: request.displayName,
    firstName: request.firstName || '',
    lastName: request.lastName || '',
    phone: request.phone || '',
    role: request.role,
    status: request.status,
    submittedAt: request.submittedAt,
    decidedAt: request.decidedAt || null,
    reason: request.reason || '',
  };
}
