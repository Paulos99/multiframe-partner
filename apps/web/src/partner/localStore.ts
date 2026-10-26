/**
 * Local-first store for partner portal (offline / no API).
 * Survives reloads and works as PWA cache.
 */
import type { MaterialNode } from '../../../api/materialsLib.js';
import { resolveCity } from '../../../api/cityCatalog.js';
import type {
  ActivityEvent,
  AnalyticsDashboard,
  AnalyticsEvent,
  ExecutorLink,
  JobObject,
  JobObjectDocument,
  JobObjectStatus,
  OrgSettings,
  Project,
  ProjectInput,
  SessionUser,
  UserRole,
} from '../../../../packages/shared/partner';
import {
  aggregateAnalyticsDashboard,
  networkAdminScope,
  canCreateObjects,
  canDeleteObjects,
  canEditOrg,
  canManageStaff,
  canRearrangeObjects,
  visibleDocuments,
  DEFAULT_DOWEL_PRICE_RUB,
  DEFAULT_INSTALL_PRICE_PER_M2,
  isStaffRole,
  normalizeOrgSettings,
  normalizeRole,
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  STAFF_ROLES,
} from '../../../../packages/shared/partner';
import { describeRoomRemovalBlock, measurerCalculationRefusal } from '../../../../packages/shared/commercialRules.js';
import { listLocalDeals, listLocalQuotes } from './commercial/localDeals';
import { carriedObjectLink } from './objectLink';
import {
  buildLocalDemoAnalytics,
  buildLocalDemoObjects,
  buildLocalDemoOrgs,
  buildLocalDemoUsers,
} from './demoSeed';

/** Bumped to force leadership demo seed (two companies + objects). */
const DB_KEY = 'mf_partner_db_v4';
const DB_KEY_LEGACY = 'mf_partner_db_v3';
const SESSION_KEY = 'mf_partner_session_v2';
const TOKEN_KEY = 'mf_partner_token_v1';
const ANALYTICS_KEY = 'mf_partner_analytics_v1';
const ANALYTICS_QUEUE_KEY = 'mf_partner_analytics_queue_v1';
const OBJECTS_CACHE_KEY = 'mf_partner_objects_v1';
const OBJECTS_QUEUE_KEY = 'mf_partner_objects_queue_v1';
const PROJECTS_CACHE_KEY = 'mf_partner_projects_v1';
const PROJECTS_READY_KEY = 'mf_partner_projects_ready_v1';
const HISTORY_RESET_KEY = 'mf_partner_history_reset_v2';
const DEMO_ANALYTICS_SEED_KEY = 'mf_partner_demo_analytics_seed_v1';
const ANALYTICS_CAP = 2000;

export type StoredUser = {
  id: string;
  login: string;
  /** Plain for local test store only — not for production. */
  password: string;
  role: UserRole;
  displayName: string;
  orgId: string | null;
  createdAt: string;
};

export type StoredOrg = {
  id: string;
  settings: OrgSettings;
  createdAt: string;
  createdBy: string;
};

export type PartnerDb = {
  users: StoredUser[];
  orgs: StoredOrg[];
  links: ExecutorLink[];
  activity: ActivityEvent[];
  objects: JobObject[];
  /** Проекты компании. Пустой список — не демо-подмена сервера. */
  projects?: Project[];
  /** Методические материалы. Нет поля — показываем демо и не записываем его. */
  materials?: MaterialNode[];
};

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Human-friendly password without ambiguous chars (0/O, 1/l/I). */
export function generatePassword(length = 10): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]!).join('');
}

function defaultDb(): PartnerDb {
  return {
    users: buildLocalDemoUsers() as StoredUser[],
    orgs: buildLocalDemoOrgs().map((o) => ({
      ...o,
      settings: normalizeOrgSettings(o.settings),
    })),
    links: [],
    activity: [],
    objects: buildLocalDemoObjects(),
    projects: [],
  };
}

function migrateDb(raw: PartnerDb): PartnerDb {
  const users = (raw.users || []).map((u) => ({
    ...u,
    role: normalizeRole(u.role as string),
  }));
  const orgs = (raw.orgs || []).map((o) => ({
    ...o,
    settings: normalizeOrgSettings({
      ...o.settings,
      city: (o.settings as OrgSettings)?.city || '',
      installPricePerM2:
        o.settings?.installPricePerM2 != null
          ? o.settings.installPricePerM2
          : DEFAULT_INSTALL_PRICE_PER_M2,
      dowelPriceRub:
        o.settings?.dowelPriceRub != null ? o.settings.dowelPriceRub : DEFAULT_DOWEL_PRICE_RUB,
    }),
  }));
  const materials = Array.isArray(raw.materials) ? raw.materials : undefined;
  return {
    users,
    orgs,
    links: raw.links || [],
    activity: raw.activity || [],
    objects: raw.objects || [],
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    ...(materials ? { materials } : {}),
  };
}

/** Wipe local activity log and analytics events/queue. */
export function clearAllActionHistory(): void {
  try {
    const db = loadDb();
    saveDb({ ...db, activity: [] });
  } catch {
    /* ignore */
  }
  localStorage.removeItem(ANALYTICS_KEY);
  localStorage.removeItem(ANALYTICS_QUEUE_KEY);
}

/** One-shot wipe after UI redesign — returns true if this call cleared data. */
export function ensureActionHistoryCleared(): boolean {
  try {
    if (localStorage.getItem(HISTORY_RESET_KEY) === '1') return false;
    clearAllActionHistory();
    localStorage.setItem(HISTORY_RESET_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function loadDb(): PartnerDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      // Fresh v4 seed (two demo companies). Drop prior local DBs.
      try {
        localStorage.removeItem(DB_KEY_LEGACY);
        localStorage.removeItem('mf_partner_db_v2');
      } catch {
        /* ignore */
      }
      const db = defaultDb();
      saveDb(db);
      seedDemoAnalyticsOnce();
      return db;
    }
    const before = raw;
    const parsed = migrateDb(JSON.parse(raw) as PartnerDb);
    if (!parsed.users?.length || !parsed.orgs.some((o) => o.id === 'org_demo_spb')) {
      const db = defaultDb();
      saveDb(db);
      seedDemoAnalyticsOnce(true);
      return db;
    }
    const after = JSON.stringify(parsed);
    if (after !== before) saveDb(parsed);
    seedDemoAnalyticsOnce();
    return parsed;
  } catch {
    const db = defaultDb();
    saveDb(db);
    seedDemoAnalyticsOnce(true);
    return db;
  }
}

/** One-shot local analytics month for offline demo dashboards. */
export function seedDemoAnalyticsOnce(force = false): void {
  try {
    if (!force && localStorage.getItem(DEMO_ANALYTICS_SEED_KEY) === '1') {
      const existing = localStorage.getItem(ANALYTICS_KEY);
      // The one-shot history wipe removes events after the flag is set.
      if (existing && existing.length > 2) return;
    }
    const events = buildLocalDemoAnalytics() as AnalyticsEvent[];
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(events.slice(0, ANALYTICS_CAP)));
    localStorage.setItem(DEMO_ANALYTICS_SEED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function saveDb(db: PartnerDb): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null): void {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as SessionUser;
    session.role = normalizeRole(session.role as string);
    if (session.orgId) {
      const db = loadDb();
      const org = db.orgs.find((o) => o.id === session.orgId);
      if (org) {
        session.org = normalizeOrgSettings(org.settings);
        saveSession(session);
      }
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(user: SessionUser | null): void {
  if (!user) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function pushActivity(
  db: PartnerDb,
  partial: Omit<ActivityEvent, 'id' | 'at'> & { at?: string },
): PartnerDb {
  const ev: ActivityEvent = {
    id: uid('act'),
    at: partial.at || new Date().toISOString(),
    orgId: partial.orgId,
    userId: partial.userId,
    login: partial.login,
    action: partial.action,
    detail: partial.detail,
  };
  const activity = [ev, ...db.activity].slice(0, 500);
  return { ...db, activity };
}

export function userToSession(u: StoredUser, db: PartnerDb): SessionUser {
  const org = u.orgId ? db.orgs.find((o) => o.id === u.orgId) : null;
  const role = normalizeRole(u.role);
  const settings = org ? normalizeOrgSettings(org.settings) : null;
  return {
    id: u.id,
    login: u.login,
    role,
    displayName: u.displayName,
    orgId: u.orgId,
    org: settings,
  };
}

export function localLogin(login: string, password: string): SessionUser {
  const db = loadDb();
  const u = db.users.find((x) => x.login === login.trim());
  if (!u || u.password !== password) {
    throw new Error('Неверный логин или пароль');
  }
  const session = userToSession(u, db);
  const next = pushActivity(db, {
    orgId: u.orgId,
    userId: u.id,
    login: u.login,
    action: 'login',
    detail: `Роль: ${session.role}`,
  });
  saveDb(next);
  saveSession(session);
  saveToken(null);
  return session;
}

export function localLogout(session: SessionUser | null): void {
  if (session) {
    const db = loadDb();
    saveDb(
      pushActivity(db, {
        orgId: session.orgId,
        userId: session.id,
        login: session.login,
        action: 'logout',
      }),
    );
  }
  saveSession(null);
  saveToken(null);
}

export function createPartnerAccount(input: {
  login: string;
  password: string;
  companyName: string;
  city?: string;
  displayName?: string;
  admin: SessionUser;
}): { user: StoredUser; org: StoredOrg; password: string } {
  if (input.admin.role !== 'admin') throw new Error('Только администратор');
  const db = loadDb();
  const login = input.login.trim();
  if (!login || !input.password) throw new Error('Укажите логин и пароль');
  if (db.users.some((u) => u.login === login)) throw new Error('Такой логин уже есть');
  const resolvedCity = resolveCity(input.city ?? '', null);
  if (!resolvedCity.ok) throw new Error(resolvedCity.message);
  const now = new Date().toISOString();
  const orgId = uid('org');
  const userId = uid('u');
  const org: StoredOrg = {
    id: orgId,
    createdAt: now,
    createdBy: input.admin.id,
    settings: normalizeOrgSettings({
      companyName: input.companyName.trim() || login,
      city: resolvedCity.city,
      panelPriceRub: OFFICIAL_PANEL_PRICE_RUB,
      pricePerM2: OFFICIAL_PRICE_PER_M2,
      installPricePerM2: DEFAULT_INSTALL_PRICE_PER_M2,
      dowelsPerPanel: 2,
      dowelPriceRub: DEFAULT_DOWEL_PRICE_RUB,
    }),
  };
  const user: StoredUser = {
    id: userId,
    login,
    password: input.password,
    role: 'owner',
    displayName: input.displayName?.trim() || input.companyName.trim() || login,
    orgId,
    createdAt: now,
  };
  let next: PartnerDb = {
    ...db,
    users: [...db.users, user],
    orgs: [...db.orgs, org],
  };
  next = pushActivity(next, {
    orgId,
    userId: input.admin.id,
    login: input.admin.login,
    action: 'create_partner',
    detail: `${login} · ${org.settings.companyName}`,
  });
  saveDb(next);
  return { user, org, password: input.password };
}

export function updatePartnerCity(
  partnerUserId: string,
  city: string,
  admin: SessionUser,
): string {
  if (admin.role !== 'admin') throw new Error('Только администратор');
  const db = loadDb();
  const partner = db.users.find((u) => u.id === partnerUserId && u.role === 'owner');
  if (!partner?.orgId) throw new Error('Партнёр не найден');
  const idx = db.orgs.findIndex((o) => o.id === partner.orgId);
  if (idx < 0) throw new Error('Организация не найдена');
  const resolvedCity = resolveCity(city, null);
  if (!resolvedCity.ok) throw new Error(resolvedCity.message);
  const settings = normalizeOrgSettings({
    ...db.orgs[idx]!.settings,
    city: resolvedCity.city,
  });
  const orgs = [...db.orgs];
  orgs[idx] = { ...orgs[idx]!, settings };
  let next: PartnerDb = { ...db, orgs };
  next = pushActivity(next, {
    orgId: partner.orgId,
    userId: admin.id,
    login: admin.login,
    action: 'update_partner_city',
    detail: `${partner.login} · ${resolvedCity.city || '—'}`,
  });
  saveDb(next);
  return resolvedCity.city;
}

export function resetPartnerPassword(
  partnerUserId: string,
  newPassword: string,
  admin: SessionUser,
): string {
  if (admin.role !== 'admin') throw new Error('Только администратор');
  if (!newPassword) throw new Error('Пустой пароль');
  const db = loadDb();
  const idx = db.users.findIndex((u) => u.id === partnerUserId && u.role === 'owner');
  if (idx < 0) throw new Error('Партнёр не найден');
  const users = [...db.users];
  users[idx] = { ...users[idx]!, password: newPassword };
  let next: PartnerDb = { ...db, users };
  next = pushActivity(next, {
    orgId: users[idx]!.orgId,
    userId: admin.id,
    login: admin.login,
    action: 'reset_password',
    detail: users[idx]!.login,
  });
  saveDb(next);
  return newPassword;
}

export function deletePartnerAccount(partnerUserId: string, admin: SessionUser): void {
  if (admin.role !== 'admin') throw new Error('Только администратор');
  const db = loadDb();
  const partner = db.users.find((u) => u.id === partnerUserId && u.role === 'owner');
  if (!partner) throw new Error('Партнёр не найден');
  const orgId = partner.orgId;
  const users = db.users.filter(
    (u) => u.id !== partnerUserId && !(orgId && u.orgId === orgId),
  );
  const orgs = orgId ? db.orgs.filter((o) => o.id !== orgId) : db.orgs;
  const objects = orgId ? db.objects.filter((o) => o.orgId !== orgId) : db.objects;
  const links = orgId ? db.links.filter((l) => l.orgId !== orgId) : db.links;
  let next: PartnerDb = { ...db, users, orgs, links, objects };
  next = pushActivity(next, {
    orgId,
    userId: admin.id,
    login: admin.login,
    action: 'delete_partner',
    detail: `${partner.login} · ${partner.displayName}`,
  });
  saveDb(next);
  const session = loadSession();
  if (session && (session.id === partnerUserId || (orgId && session.orgId === orgId))) {
    saveSession(null);
  }
}

export function updateOrgSettings(
  orgId: string,
  patch: Partial<OrgSettings>,
  actor: SessionUser,
): OrgSettings {
  if (!canEditOrg(actor.role)) {
    throw new Error('Недостаточно прав');
  }
  if (actor.role === 'owner' && actor.orgId !== orgId) {
    throw new Error('Чужая организация');
  }
  const db = loadDb();
  const idx = db.orgs.findIndex((o) => o.id === orgId);
  if (idx < 0) throw new Error('Организация не найдена');
  let nextPatch = patch;
  if (patch.city !== undefined) {
    const resolvedCity = resolveCity(patch.city, db.orgs[idx]!.settings.city);
    if (!resolvedCity.ok) throw new Error(resolvedCity.message);
    nextPatch = { ...patch, city: resolvedCity.city };
  }
  const settings = normalizeOrgSettings({
    ...db.orgs[idx]!.settings,
    ...nextPatch,
  });
  const orgs = [...db.orgs];
  orgs[idx] = { ...orgs[idx]!, settings };
  let next: PartnerDb = { ...db, orgs };
  next = pushActivity(next, {
    orgId,
    userId: actor.id,
    login: actor.login,
    action: 'update_org',
    detail: settings.companyName,
  });
  saveDb(next);
  const session = loadSession();
  if (session && session.orgId === orgId) {
    saveSession({ ...session, org: { ...settings } });
  }
  return settings;
}

export function createStaffAccount(input: {
  login: string;
  password: string;
  displayName: string;
  role: UserRole;
  owner: SessionUser;
}): { user: StoredUser; password: string } {
  if (!canManageStaff(input.owner.role) || !input.owner.orgId) {
    throw new Error('Недостаточно прав');
  }
  const requested = String(input.role || '').trim();
  const allowed =
    requested === '' ||
    requested === 'executor' ||
    STAFF_ROLES.includes(requested as UserRole);
  if (!allowed) {
    throw new Error('Роль: менеджер, замерщик или монтажник');
  }
  const role: UserRole = requested === '' || requested === 'executor' ? 'measurer' : (requested as UserRole);
  const db = loadDb();
  const login = input.login.trim();
  const password = input.password.trim() || generatePassword();
  if (!login) throw new Error('Укажите логин');
  if (db.users.some((u) => u.login === login)) throw new Error('Такой логин уже есть');
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: uid('u'),
    login,
    password,
    role,
    displayName: input.displayName.trim() || login,
    orgId: input.owner.orgId,
    createdAt: now,
  };
  let next: PartnerDb = { ...db, users: [...db.users, user] };
  next = pushActivity(next, {
    orgId: input.owner.orgId,
    userId: input.owner.id,
    login: input.owner.login,
    action: 'create_staff',
    detail: `${login} · ${role}`,
  });
  saveDb(next);
  return { user, password };
}

/** @deprecated use createStaffAccount */
export function createExecutorAccount(input: {
  login: string;
  password: string;
  displayName: string;
  partner: SessionUser;
}): { user: StoredUser; password: string } {
  return createStaffAccount({
    ...input,
    role: 'measurer',
    owner: { ...input.partner, role: 'owner' },
  });
}

export function resetStaffPassword(
  staffUserId: string,
  newPassword: string,
  owner: SessionUser,
): string {
  if (!canManageStaff(owner.role) || !owner.orgId) {
    throw new Error('Недостаточно прав');
  }
  const password = newPassword.trim() || generatePassword();
  const db = loadDb();
  const target = db.users.find((u) => u.id === staffUserId);
  if (!target) throw new Error('Сотрудник не найден');
  const targetRole = normalizeRole(target.role);
  if (target.orgId !== owner.orgId) throw new Error('Недостаточно прав');
  if (targetRole === 'owner' || targetRole === 'admin') {
    throw new Error('Нельзя изменить владельца');
  }
  if (!isStaffRole(targetRole)) throw new Error('Сотрудник не найден');
  const idx = db.users.findIndex((u) => u.id === staffUserId);
  if (idx < 0) throw new Error('Сотрудник не найден');
  const users = [...db.users];
  users[idx] = { ...users[idx]!, password };
  let next: PartnerDb = { ...db, users };
  next = pushActivity(next, {
    orgId: owner.orgId,
    userId: owner.id,
    login: owner.login,
    action: 'reset_staff_password',
    detail: users[idx]!.login,
  });
  saveDb(next);
  return password;
}

/** @deprecated */
export function resetExecutorPassword(
  executorUserId: string,
  newPassword: string,
  partner: SessionUser,
): string {
  return resetStaffPassword(executorUserId, newPassword, {
    ...partner,
    role: 'owner',
  });
}

export function deleteStaffAccount(staffUserId: string, owner: SessionUser): void {
  if (!canManageStaff(owner.role) || !owner.orgId) {
    throw new Error('Недостаточно прав');
  }
  if (staffUserId === owner.id) {
    throw new Error('Нельзя удалить свою учётную запись');
  }
  const db = loadDb();
  const target = db.users.find((u) => u.id === staffUserId);
  if (!target) throw new Error('Сотрудник не найден');
  const targetRole = normalizeRole(target.role);
  if (target.orgId !== owner.orgId) throw new Error('Недостаточно прав');
  if (targetRole === 'owner' || targetRole === 'admin') {
    throw new Error('Нельзя удалить владельца');
  }
  if (!isStaffRole(targetRole)) throw new Error('Недостаточно прав');
  const staff = target;
  const users = db.users.filter((u) => u.id !== staffUserId);
  let next: PartnerDb = { ...db, users };
  next = pushActivity(next, {
    orgId: owner.orgId,
    userId: owner.id,
    login: owner.login,
    action: 'delete_staff',
    detail: `${staff.login} · ${staff.displayName}`,
  });
  saveDb(next);
  const session = loadSession();
  if (session?.id === staffUserId) {
    saveSession(null);
  }
}

/** @deprecated */
export function deleteExecutorAccount(executorUserId: string, partner: SessionUser): void {
  deleteStaffAccount(executorUserId, { ...partner, role: 'owner' });
}

export function listPartners() {
  const db = loadDb();
  return db.users
    .filter((u) => u.role === 'owner')
    .map((u) => {
      const org = db.orgs.find((o) => o.id === u.orgId);
      const last = db.activity.find((a) => a.orgId === u.orgId && a.action === 'login');
      const staffCount = db.users.filter((x) => isStaffRole(x.role) && x.orgId === u.orgId)
        .length;
      return {
        user: u,
        org,
        lastLogin: last?.at || null,
        executorCount: staffCount,
        staffCount,
      };
    });
}

export function listStaffForOrg(orgId: string): StoredUser[] {
  return loadDb().users.filter((u) => isStaffRole(u.role) && u.orgId === orgId);
}

/** @deprecated */
export function listExecutorsForOrg(orgId: string): StoredUser[] {
  return listStaffForOrg(orgId);
}

export function listActivity(limit = 80): ActivityEvent[] {
  return loadDb().activity.slice(0, limit);
}

export function trackToolOpen(session: SessionUser, tool: 'problemomer' | 'calculator'): void {
  const db = loadDb();
  saveDb(
    pushActivity(db, {
      orgId: session.orgId,
      userId: session.id,
      login: session.login,
      action: `open_${tool}`,
    }),
  );
}

export function isObjectVisible(user: SessionUser, obj: JobObject): boolean {
  return objectVisible(user, obj);
}

/**
 * Кэш с сервера: владелец и менеджер видят компанию,
 * замерщик — свои строки, монтажник — назначения и монтаж.
 * Цены монтажнику не отдаём, как и API.
 */
export function presentCachedObject(user: SessionUser, obj: JobObject): JobObject | null {
  if (user.role !== 'admin') {
    if (!user.orgId || obj.orgId !== user.orgId) return null;
    if (user.role === 'measurer' && obj.createdBy !== user.id && obj.assignedTo !== user.id) return null;
    if (user.role === 'crew' && obj.assignedTo !== user.id && obj.status !== 'install') return null;
  }
  return presentObject(obj, user.role);
}

/**
 * Та же видимость, что у API: владелец и менеджер видят все объекты своей компании.
 * Чужая компания закрыта. Замерщик видит свои и назначенные, монтажник — только свои назначения.
 */
function objectVisible(user: SessionUser, obj: JobObject): boolean {
  if (user.role === 'admin') return true;
  if (!user.orgId || obj.orgId !== user.orgId) return false;
  if (user.role === 'owner' || user.role === 'sales') return true;
  if (user.role === 'measurer') {
    return obj.createdBy === user.id || obj.assignedTo === user.id;
  }
  if (user.role === 'crew') {
    return obj.assignedTo === user.id;
  }
  return false;
}

function presentObject(obj: JobObject, role: UserRole): JobObject {
  const next: JobObject = { ...obj, documents: visibleDocuments(obj.documents) };
  if (role !== 'crew' || !next.estimate) return next;
  const estimate = { ...next.estimate };
  delete estimate.panelsCost;
  delete estimate.installCost;
  delete estimate.dowelsCost;
  delete estimate.totalCost;
  return { ...next, estimate };
}

export function listLocalObjects(user: SessionUser): JobObject[] {
  const db = loadDb();
  return db.objects
    .filter((o) => objectVisible(user, o))
    .map((o) => presentObject(o, user.role));
}

function projectVisibleLocal(user: SessionUser, project: Project, objects: JobObject[]): boolean {
  if (user.role === 'admin') return true;
  if (!user.orgId || project.orgId !== user.orgId) return false;
  if (user.role === 'owner' || user.role === 'sales') return true;
  return objects.some((obj) => obj.projectId === project.id && objectVisible(user, obj));
}

export function listLocalProjects(user: SessionUser): Project[] {
  const db = loadDb();
  return (db.projects || []).filter((project) => projectVisibleLocal(user, project, db.objects));
}

export function upsertLocalProject(input: ProjectInput, actor: SessionUser): Project {
  if (actor.role !== 'owner' && actor.role !== 'sales') throw new Error('Недостаточно прав');
  if (!actor.orgId) throw new Error('Нет организации');
  const db = loadDb();
  const projects = db.projects || [];
  const existing = input.id ? projects.find((project) => project.id === input.id) : undefined;
  if (existing && existing.orgId !== actor.orgId) throw new Error('Недостаточно прав');
  const name = String(input.name ?? existing?.name ?? '').trim();
  if (!name) throw new Error('Укажите название проекта');
  const now = new Date().toISOString();
  const project: Project = {
    id: existing?.id || input.id || uid('prj'),
    orgId: existing?.orgId || actor.orgId,
    name: name.slice(0, 250),
    clientName: String(input.clientName ?? existing?.clientName ?? '').trim(),
    clientPhone: String(input.clientPhone ?? existing?.clientPhone ?? '').trim(),
    address: String(input.address ?? existing?.address ?? '').trim(),
    city: String(input.city ?? existing?.city ?? '').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || actor.id,
  };
  saveDb({
    ...db,
    projects: existing
      ? projects.map((item) => (item.id === project.id ? project : item))
      : [project, ...projects],
  });
  return project;
}

export function cacheProjects(projects: Project[]): void {
  try {
    localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(projects));
  } catch {
    /* ignore */
  }
}

export function loadCachedProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Project[]) : [];
  } catch {
    return [];
  }
}

export function markProjectsApiReady(ready: boolean): void {
  try {
    if (ready) localStorage.setItem(PROJECTS_READY_KEY, '1');
    else localStorage.removeItem(PROJECTS_READY_KEY);
  } catch {
    /* ignore */
  }
}

export function projectsApiReady(): boolean {
  try {
    return localStorage.getItem(PROJECTS_READY_KEY) === '1';
  } catch {
    return false;
  }
}

function deleteDenial(role: UserRole): string {
  if (role === 'admin') {
    return 'Удалять комнаты компании может её владелец или менеджер. Администратор сети комнаты не удаляет.';
  }
  if (role === 'crew') return 'Бригада не удаляет комнаты. Если карточка лишняя, попросите менеджера.';
  if (role === 'measurer') {
    return 'Замерщик не удаляет комнаты. Сохраните расчёт в назначенной комнате или попросите менеджера.';
  }
  return 'Удалять комнаты может владелец или менеджер своей компании.';
}

export function deleteLocalObject(id: string, actor: SessionUser): void {
  const db = loadDb();
  const existing = db.objects.find((o) => o.id === id);
  if (!existing) return;
  if (!objectVisible(actor, existing)) throw new Error('Удалять можно только комнаты своей компании.');
  if (!canDeleteObjects(actor.role)) throw new Error(deleteDenial(actor.role));
  const projectIds = new Set(
    (db.projects || []).map((project) => project.id).concat(existing.projectId ? [existing.projectId] : []),
  );
  const hold = describeRoomRemovalBlock(existing, {
    quotes: listLocalQuotes(projectIds),
    deals: listLocalDeals(actor.orgId),
  });
  if (hold) throw new Error(hold);
  saveDb({ ...db, objects: db.objects.filter((o) => o.id !== id) });
  removeFromObjectQueue(id);
  cacheObjects(listLocalObjects(actor));
}

export function upsertLocalObject(
  input: Partial<JobObject> & { id?: string },
  actor: SessionUser,
): JobObject {
  if (!actor.orgId) throw new Error('Нет организации');
  if (!input.id && !canCreateObjects(actor.role)) {
    throw new Error(
      actor.role === 'measurer'
        ? 'Замерщик не создаёт комнаты. Сохраните расчёт в комнате, которую назначил менеджер.'
        : actor.role === 'crew'
          ? 'Бригада не создаёт комнаты. Новую комнату добавляет менеджер или владелец.'
          : 'Создавать комнаты может владелец или менеджер своей компании.',
    );
  }
  const db = loadDb();
  const now = new Date().toISOString();
  const org = db.orgs.find((o) => o.id === actor.orgId);
  const existing = input.id ? db.objects.find((o) => o.id === input.id) : null;
  if (existing && !objectVisible(actor, existing)) {
    throw new Error(
      actor.role === 'measurer'
        ? 'Эта комната вам не назначена. Попросите менеджера открыть её для замера.'
        : 'Менять можно только комнаты своей компании.',
    );
  }
  if (existing && actor.role === 'measurer') {
    const refusal = measurerCalculationRefusal(
      input as Record<string, unknown>,
      existing as unknown as Record<string, unknown>,
    );
    if (refusal) throw new Error(refusal);
    const saved: JobObject = {
      ...existing,
      updatedAt: input.updatedAt || now,
      estimate: input.estimate !== undefined ? input.estimate : existing.estimate ?? null,
      room: input.room || existing.room || {},
      clientSummary: input.clientSummary !== undefined ? input.clientSummary : existing.clientSummary,
      status: input.status === 'measured' ? 'measured' : existing.status,
      pendingSync: true,
      history: [
        {
          at: now,
          userId: actor.id,
          login: actor.login,
          action: 'update',
          detail: 'расчёт',
        },
        ...(existing.history || []),
      ].slice(0, 50),
    };
    saveDb({ ...db, objects: db.objects.map((item) => (item.id === saved.id ? saved : item)) });
    enqueueObjectSync(saved);
    cacheObjects(listLocalObjects(actor));
    return presentObject(saved, actor.role);
  }
  if (existing && !canRearrangeObjects(actor.role)) {
    if (actor.role !== 'crew') throw new Error('Менять комнаты может владелец или менеджер своей компании.');
    const nextStatus = (input.status || existing.status) as JobObjectStatus;
    if (nextStatus !== existing.status && nextStatus !== 'install' && nextStatus !== 'closed') {
      throw new Error('Бригада переводит карточку только в монтаж или в закрыто.');
    }
    if (input.projectId && input.projectId !== existing.projectId) {
      throw new Error('Бригада не переносит комнаты. Можно только закрыть свой монтаж.');
    }
    if (input.stageOrder !== undefined && input.stageOrder !== existing.stageOrder) {
      throw new Error('Бригада не переставляет карточки. Можно только закрыть свой монтаж.');
    }
    const textKeys = ['clientName', 'clientPhone', 'address', 'city', 'roomName', 'clientSummary'] as const;
    for (const key of textKeys) {
      if (input[key] !== undefined && String(input[key] ?? '').trim() !== String(existing[key] ?? '').trim()) {
        throw new Error('Недостаточно прав');
      }
    }
    if (input.room !== undefined || input.estimate !== undefined) throw new Error('Недостаточно прав');
    if (input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo) {
      throw new Error('Недостаточно прав');
    }
  }

  const status = (input.status || existing?.status || 'draft') as JobObjectStatus;
  const obj: JobObject = {
    id: existing?.id || input.id || uid('obj'),
    orgId: existing?.orgId || actor.orgId,
    createdAt: existing?.createdAt || now,
    updatedAt: input.updatedAt || now,
    createdBy: existing?.createdBy || actor.id,
    assignedTo:
      input.assignedTo !== undefined ? input.assignedTo : existing?.assignedTo ?? null,
    status,
    stageOrder: input.stageOrder ?? (input.status && input.status !== existing?.status ? -Date.now() : existing?.stageOrder),
    clientName: (input.clientName ?? existing?.clientName ?? '').trim(),
    clientPhone: (input.clientPhone ?? existing?.clientPhone ?? '').trim(),
    address: (input.address ?? existing?.address ?? '').trim(),
    city: (input.city ?? existing?.city ?? org?.settings.city ?? '').trim(),
    room: input.room || existing?.room || {},
    estimate: input.estimate !== undefined ? input.estimate : existing?.estimate ?? null,
    clientSummary: input.clientSummary ?? existing?.clientSummary ?? '',
    history: existing?.history || [],
    documents: existing?.documents,
    pendingSync: true,
    ...carriedObjectLink(input, existing),
  };

  let projects = db.projects || [];
  if (!existing && !obj.projectId) {
    const project: Project = {
      id: uid('prj'),
      orgId: actor.orgId,
      name: (obj.clientName || obj.address || obj.roomName || 'Проект').slice(0, 250),
      clientName: obj.clientName,
      clientPhone: obj.clientPhone,
      address: obj.address,
      city: obj.city,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
    };
    projects = [project, ...projects];
    obj.projectId = project.id;
  }

  if (!existing) {
    obj.history = [
      {
        at: now,
        userId: actor.id,
        login: actor.login,
        action: 'create',
        detail: status,
      },
    ];
  } else if (input.status && input.status !== existing.status) {
    obj.history = [
      {
        at: now,
        userId: actor.id,
        login: actor.login,
        action: 'status',
        detail: `${existing.status}→${input.status}`,
      },
      ...existing.history,
    ].slice(0, 50);
  } else {
    obj.history = [
      {
        at: now,
        userId: actor.id,
        login: actor.login,
        action: 'update',
      },
      ...(existing.history || []),
    ].slice(0, 50);
  }

  const objects = existing
    ? db.objects.map((o) => (o.id === obj.id ? obj : o))
    : [obj, ...db.objects];
  saveDb({ ...db, objects, projects });
  enqueueObjectSync(obj);
  cacheObjects(listLocalObjects(actor));
  return presentObject(obj, actor.role);
}

export function cacheObjects(objects: JobObject[]): void {
  try {
    localStorage.setItem(OBJECTS_CACHE_KEY, JSON.stringify(objects));
  } catch {
    /* ignore */
  }
}

export function loadCachedObjects(): JobObject[] {
  try {
    const raw = localStorage.getItem(OBJECTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueObjectSync(obj: JobObject): void {
  try {
    const q = peekObjectQueue().filter((o) => o.id !== obj.id);
    q.unshift({ ...obj, pendingSync: true });
    localStorage.setItem(OBJECTS_QUEUE_KEY, JSON.stringify(q.slice(0, 100)));
  } catch {
    /* ignore */
  }
}

export function peekObjectQueue(): JobObject[] {
  try {
    const raw = localStorage.getItem(OBJECTS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearObjectQueue(): void {
  localStorage.removeItem(OBJECTS_QUEUE_KEY);
}

export function removeFromObjectQueue(id: string): void {
  const q = peekObjectQueue().filter((o) => o.id !== id);
  localStorage.setItem(OBJECTS_QUEUE_KEY, JSON.stringify(q));
}

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function loadAnalyticsEvents(): AnalyticsEvent[] {
  return readJsonArray<AnalyticsEvent>(ANALYTICS_KEY);
}

export function appendAnalyticsEvent(event: AnalyticsEvent): void {
  const list = [event, ...loadAnalyticsEvents()].slice(0, ANALYTICS_CAP);
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(list));
}

export function enqueueAnalyticsEvents(events: AnalyticsEvent[]): void {
  const existing = readJsonArray<AnalyticsEvent>(ANALYTICS_QUEUE_KEY);
  const seen = new Set(existing.map((e) => e.id).filter(Boolean));
  const fresh = events.filter((e) => e?.id && !seen.has(e.id));
  const q = [...fresh, ...existing].slice(0, 500);
  localStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(q));
}

export function peekAnalyticsQueue(): AnalyticsEvent[] {
  return readJsonArray<AnalyticsEvent>(ANALYTICS_QUEUE_KEY);
}

export function clearAnalyticsQueue(): void {
  localStorage.removeItem(ANALYTICS_QUEUE_KEY);
}

function dedupeEvents(list: AnalyticsEvent[]): AnalyticsEvent[] {
  const seen = new Set<string>();
  const out: AnalyticsEvent[] = [];
  for (const event of list) {
    if (!event?.id || seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  return out;
}

export function buildLocalDashboard(
  opts: {
    from?: string | null;
    to?: string | null;
    orgId?: string | null;
    journalAll?: boolean;
  },
  extra: AnalyticsEvent[] = [],
): AnalyticsDashboard {
  const db = loadDb();
  const executorDirectory = db.users
    .filter((u) => isStaffRole(u.role))
    .map((u) => ({
      userId: u.id,
      login: u.login,
      displayName: u.displayName,
      orgId: u.orgId,
      role: u.role,
    }));
  return aggregateAnalyticsDashboard(dedupeEvents([...extra, ...loadAnalyticsEvents()]), {
    source: 'local',
    from: opts.from,
    to: opts.to,
    orgId: opts.orgId,
    partnerCount: db.users.filter((u) => u.role === 'owner').length,
    executorCount: opts.orgId
      ? executorDirectory.filter((e) => e.orgId === opts.orgId).length
      : executorDirectory.length,
    executorDirectory,
    journalAll: opts.journalAll,
    ...networkAdminScope(db.users),
  });
}

const DOC_BYTES_KEY = 'mf_partner_doc_bytes_v1';
const DOC_QUEUE_KEY = 'mf_partner_doc_queue_v1';

export type QueuedObjectDocument = {
  objectId: string;
  versionId: string;
  kind: 'estimate' | 'profile';
  filename: string;
  pdfBase64: string;
  hasScheme: boolean;
  panels?: number | null;
  areaM2?: number | null;
};

const memoryDocBytes = new Map<string, string>();

function readDocBytes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DOC_BYTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLocalDocBytes(id: string, base64: string): void {
  memoryDocBytes.set(id, base64);
  try {
    const map = readDocBytes();
    map[id] = base64;
    const ids = Object.keys(map);
    while (ids.length > 24) {
      delete map[ids.shift()!];
    }
    localStorage.setItem(DOC_BYTES_KEY, JSON.stringify(map));
  } catch {
    /* файл остаётся в памяти вкладки, пока localStorage не примет его */
  }
}

export function loadLocalDocBytes(id: string): string | null {
  return memoryDocBytes.get(id) || readDocBytes()[id] || null;
}

export function enqueueObjectDocuments(objectId: string, docs: QueuedObjectDocument[]): void {
  try {
    const prev = readJsonArray<QueuedObjectDocument>(DOC_QUEUE_KEY).filter((d) => d.objectId !== objectId || !docs.some((n) => n.versionId === d.versionId && n.kind === d.kind));
    localStorage.setItem(DOC_QUEUE_KEY, JSON.stringify([...docs, ...prev].slice(0, 20)));
  } catch {
    /* quota — bytes stay in DOC_BYTES_KEY when they fit */
  }
}

export function peekObjectDocumentQueue(): QueuedObjectDocument[] {
  return readJsonArray<QueuedObjectDocument>(DOC_QUEUE_KEY);
}

export function removeQueuedObjectDocuments(objectId: string, versionId: string): void {
  const next = peekObjectDocumentQueue().filter(
    (d) => !(d.objectId === objectId && d.versionId === versionId),
  );
  localStorage.setItem(DOC_QUEUE_KEY, JSON.stringify(next));
}

export function appendLocalObjectDocuments(
  objectId: string,
  docs: JobObjectDocument[],
  actor: SessionUser,
): JobObject {
  if (!actor.orgId) throw new Error('Нет организации');
  if (actor.role === 'crew') throw new Error('Монтажник не прикладывает документы');
  const db = loadDb();
  const existing = db.objects.find((o) => o.id === objectId);
  if (!existing || !objectVisible(actor, existing)) throw new Error('Объект не найден');
  const now = new Date().toISOString();
  const meta = docs.map((d) => {
    if (d.dataBase64) {
      try {
        saveLocalDocBytes(d.id, d.dataBase64);
      } catch {
        /* keep going; open may fail until the file is uploaded */
      }
    }
    const copy = { ...d };
    delete copy.dataBase64;
    return copy;
  });
  const next: JobObject = {
    ...existing,
    documents: [...meta, ...(existing.documents || [])].slice(0, 40),
    updatedAt: now,
    pendingSync: existing.pendingSync,
    history: [
      {
        at: now,
        userId: actor.id,
        login: actor.login,
        action: meta.every((d) => d.kind === 'profile') ? 'profile_pdf' : 'calc_pdf',
        detail: meta.map((d) => d.filename).join(', '),
      },
      ...(existing.history || []),
    ].slice(0, 50),
  };
  saveDb({ ...db, objects: db.objects.map((o) => (o.id === next.id ? next : o)) });
  cacheObjects(listLocalObjects(actor));
  return presentObject(next, actor.role);
}
