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
  canEditOrg,
  canCreateObjects,
  canDeleteObjects,
  canManageStaff,
  canMoveObjects,
  visibleDocuments,
  cleanProjectDate,
  cleanProjectStatus,
  estimateForRole,
  PROJECT_STATUSES,
  DEFAULT_DOWEL_PRICE_RUB,
  DEFAULT_INSTALL_PRICE_PER_M2,
  isStaffRole,
  normalizeOrgSettings,
  normalizeRole,
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  STAFF_ROLES,
} from '../../../../packages/shared/partner';
import { groupOrphanRooms } from '../../../../packages/shared/groupProjects.js';
import { applyDemoPersonalNames, normalizePersonName, personName } from '../../../../packages/shared/personName.js';
import { carriedObjectLink } from './objectLink';
import {
  cleanClientPhone,
  phoneRoomStatusAllowed,
  phoneStageAllowed,
  projectStageOf,
  roleSeesClientPhone,
} from '../../../../packages/shared/clientPhone.js';
import { cleanRefusal } from '../../../../packages/shared/refusal.js';
import { supplementDemoHistory } from '../../../../packages/shared/demoHistory.js';
import {
  assignDemoRoomStaff,
  buildLocalDemoAnalytics,
  buildLocalDemoObjects,
  buildLocalDemoOrgs,
  buildLocalDemoUsers,
} from './demoSeed';

/** Bumped to force leadership demo seed (two companies + objects). */
const DB_KEY = 'mf_partner_db_v5';
const DB_KEY_LEGACY = 'mf_partner_db_v4';
const SESSION_KEY = 'mf_partner_session_v2';
const TOKEN_KEY = 'mf_partner_token_v1';
const ANALYTICS_KEY = 'mf_partner_analytics_v1';
const ANALYTICS_QUEUE_KEY = 'mf_partner_analytics_queue_v1';
const OBJECTS_CACHE_KEY = 'mf_partner_objects_v1';
const OBJECTS_QUEUE_KEY = 'mf_partner_objects_queue_v1';
const PROJECTS_CACHE_KEY = 'mf_partner_projects_v1';
const PROJECTS_READY_KEY = 'mf_partner_projects_ready_v1';
const HISTORY_RESET_KEY = 'mf_partner_history_reset_v2';
const DEMO_ANALYTICS_SEED_KEY = 'mf_partner_demo_analytics_seed_v2';
const DEMO_ANALYTICS_VERSION_KEY = 'mf_partner_demo_analytics_version';
export const DEMO_ANALYTICS_VERSION = '3';
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
  const db: PartnerDb = {
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
  groupOrphanRooms(db);
  return db;
}

function migrateDb(raw: PartnerDb): PartnerDb {
  const users = (raw.users || []).map((u) => ({
    ...u,
    role: normalizeRole(u.role as string),
  }));
  applyDemoPersonalNames(users);
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
  const next: PartnerDb = {
    users,
    orgs,
    links: raw.links || [],
    activity: raw.activity || [],
    objects: assignDemoRoomStaff(repairStoredHistory(raw.objects || [], users), users),
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    ...(materials ? { materials } : {}),
  };
  groupOrphanRooms(next);
  return next;
}

/** Старые демо-записи с login system подписывались тем, кто открыл историю. Имя пишется в саму запись. */
function repairStoredHistory(objects: JobObject[], users: StoredUser[]): JobObject[] {
  const byId = new Map(users.map((user) => [user.id, user]));
  const ownerByOrg = new Map(users.filter((user) => user.role === 'owner').map((user) => [user.orgId, user]));
  return objects.map((obj) => ({
    ...obj,
    history: (obj.history || []).map((entry) => {
      const crewWroteStatus = entry.action === 'status' && byId.get(entry.userId || '')?.role === 'crew';
      const userId = crewWroteStatus ? ownerByOrg.get(obj.orgId)?.id || obj.createdBy : entry.userId;
      const person = userId ? byId.get(userId) : undefined;
      if (entry.authorName && !crewWroteStatus) return entry;
      return {
        ...entry,
        userId,
        login: person?.login || entry.login,
        authorName: entry.authorName || person?.displayName || undefined,
      };
    }),
  }));
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
  localStorage.removeItem(DEMO_ANALYTICS_VERSION_KEY);
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

function readStoredDb(key: string): PartnerDb | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PartnerDb;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.users) && !Array.isArray(parsed.objects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function dropLegacyKeys(): void {
  try {
    localStorage.removeItem(DB_KEY_LEGACY);
    localStorage.removeItem('mf_partner_db_v3');
    localStorage.removeItem('mf_partner_db_v2');
  } catch {
    /* ignore */
  }
}

/**
 * Ключ v5 ещё не создан, а комнаты уже лежат в v4.
 * Переносим их, а не заменяем свежим сидом: сид стирал бы клики проблемомера и монтажа.
 * Недостающую вторую демо-компанию добавляем рядом, объекты не трогаем.
 */
function adoptLegacyDb(legacy: PartnerDb): PartnerDb {
  const migrated = migrateDb(legacy);
  const fresh = defaultDb();
  const hasSpb = migrated.orgs.some((org) => org.id === 'org_demo_spb');
  if (migrated.users.length && hasSpb) return migrated;
  const orgIds = new Set(migrated.orgs.map((org) => org.id));
  const logins = new Set(migrated.users.map((user) => user.login));
  return {
    ...migrated,
    users: [...migrated.users, ...fresh.users.filter((user) => !logins.has(user.login))],
    orgs: [...migrated.orgs, ...fresh.orgs.filter((org) => !orgIds.has(org.id))],
    objects: migrated.objects.length ? migrated.objects : fresh.objects,
    projects: migrated.projects?.length ? migrated.projects : fresh.projects,
  };
}

export function loadDb(): PartnerDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const legacy =
        readStoredDb(DB_KEY_LEGACY) || readStoredDb('mf_partner_db_v3') || readStoredDb('mf_partner_db_v2');
      if (legacy && ((legacy.users && legacy.users.length) || (legacy.objects && legacy.objects.length))) {
        const db = adoptLegacyDb(legacy);
        saveDb(db);
        dropLegacyKeys();
        seedDemoAnalyticsOnce();
        return db;
      }
      dropLegacyKeys();
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

export function demoAnalyticsVersion(): string | null {
  try {
    return localStorage.getItem(DEMO_ANALYTICS_VERSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Хранилище не пересобирается. Недостающий год считается при чтении,
 * иначе короткая пачка либо не влезает в localStorage, либо затирает принятую неделю.
 */
export function ensureDemoAnalyticsHistory(): void {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    if (!raw || !raw.includes('org_demo')) return;
    if (localStorage.getItem(DEMO_ANALYTICS_VERSION_KEY) !== DEMO_ANALYTICS_VERSION) {
      localStorage.setItem(DEMO_ANALYTICS_VERSION_KEY, DEMO_ANALYTICS_VERSION);
    }
    localStorage.setItem(DEMO_ANALYTICS_SEED_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Готовая годовая история не пересобирается, даже если базу кабинета сбросили. */
export function seedDemoAnalyticsOnce(force = false): void {
  void force;
  ensureDemoAnalyticsHistory();
}

export function saveDb(db: PartnerDb): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

/** Токен, который не влез в localStorage: живёт до закрытия вкладки, чтобы вход не терялся молча. */
let memoryToken: string | null = null;

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch {
    return memoryToken;
  }
}

/** Освободить место: эти кэши пересоздаются при следующей загрузке с сервера. */
function freeStorageForToken(): void {
  for (const key of [OBJECTS_CACHE_KEY, PROJECTS_CACHE_KEY, ANALYTICS_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* хранилище недоступно */
    }
  }
}

/**
 * Сохранить токен входа. Если localStorage переполнен, чистим пересоздаваемые кэши и пробуем снова;
 * если и это не помогло — держим токен в памяти вкладки (вход не «пропадает» молча).
 */
export function saveToken(token: string | null): void {
  memoryToken = token || null;
  try {
    if (!token) {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      freeStorageForToken();
      localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    /* токен остаётся в памяти вкладки */
  }
}

const LOCAL_ONLY_KEY = 'mf_partner_local_only_v1';

/** Вход выполнен только на устройстве (сервер недоступен или не принял демо-логин): токена нет. */
export function setLocalOnlySession(on: boolean): void {
  try {
    if (on) localStorage.setItem(LOCAL_ONLY_KEY, '1');
    else localStorage.removeItem(LOCAL_ONLY_KEY);
  } catch {
    /* ignore */
  }
}

export function isLocalOnlySession(): boolean {
  try {
    return localStorage.getItem(LOCAL_ONLY_KEY) === '1';
  } catch {
    return false;
  }
}

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as SessionUser;
    session.role = normalizeRole(session.role as string);
    const db = loadDb();
    let dirty = false;
    if (session.orgId) {
      const org = db.orgs.find((o) => o.id === session.orgId);
      if (org) {
        session.org = normalizeOrgSettings(org.settings);
        dirty = true;
      }
    }
    const person = db.users.find((u) => u.id === session.id);
    if (
      person &&
      personName(person.displayName) &&
      !personName(session.displayName) &&
      session.displayName !== person.displayName
    ) {
      session.displayName = person.displayName;
      dirty = true;
    }
    if (dirty) saveSession(session);
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

export function updateOwnDisplayName(actor: SessionUser, displayName: string): SessionUser {
  const name = normalizePersonName(displayName);
  const db = loadDb();
  const idx = db.users.findIndex((u) => u.id === actor.id);
  if (idx < 0) throw new Error('Пользователь не найден');
  const users = [...db.users];
  users[idx] = { ...users[idx]!, displayName: name };
  saveDb({ ...db, users });
  const next = { ...actor, displayName: name };
  saveSession(next);
  return next;
}

/** Имя сотрудника своей компании. Только владелец. Роль, логин и организация не меняются. */
export function renameStaffDisplayName(
  staffUserId: string,
  displayName: string,
  owner: SessionUser,
): string {
  if (owner.role !== 'owner' || !owner.orgId) throw new Error('Недостаточно прав');
  const name = normalizePersonName(displayName);
  const db = loadDb();
  const idx = db.users.findIndex((u) => u.id === staffUserId);
  if (idx < 0) throw new Error('Сотрудник не найден');
  const target = db.users[idx]!;
  if (target.orgId !== owner.orgId) throw new Error('Недостаточно прав');
  const role = normalizeRole(target.role);
  if (!isStaffRole(role)) throw new Error('Недостаточно прав');
  const users = [...db.users];
  users[idx] = { ...target, displayName: name };
  let next: PartnerDb = { ...db, users };
  next = pushActivity(next, {
    orgId: owner.orgId,
    userId: owner.id,
    login: owner.login,
    action: 'rename_staff',
    detail: `${target.login} · ${name || '—'}`,
  });
  saveDb(next);
  const session = loadSession();
  if (session?.id === staffUserId) saveSession({ ...session, displayName: name });
  return name;
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
 * Remote cache visibility matches the API: owner and sales see the company,
 * measurer and crew see only rooms assigned to them.
 */
export function presentCachedObject(user: SessionUser, obj: JobObject): JobObject | null {
  if (!objectVisible(user, obj)) return null;
  return presentObject(obj, user.role);
}

function objectVisible(user: SessionUser, obj: JobObject): boolean {
  if (user.role === 'admin') return true;
  if (!user.orgId || obj.orgId !== user.orgId) return false;
  if (user.role === 'owner') return true;
  if (user.role === 'sales') return true;
  if (user.role === 'measurer') {
    return obj.assignedTo === user.id;
  }
  if (user.role === 'crew') {
    return obj.assignedTo === user.id;
  }
  return false;
}

/** Бригада видит количества без цен. Остальные роли — полный расчёт. */
function presentObject(obj: JobObject, role: UserRole): JobObject {
  return {
    ...obj,
    // Телефон клиента: только владелец, менеджер, замерщик, монтажник и только с этапа «Замер».
    clientPhone: roleSeesClientPhone(role) && phoneRoomStatusAllowed(obj.status) ? obj.clientPhone || '' : '',
    estimate: estimateForRole(obj.estimate, role),
    documents: visibleDocuments(obj.documents),
  };
}

function presentProject(project: Project, role: UserRole, rooms: JobObject[]): Project {
  const own = rooms.filter((room) => room.projectId === project.id);
  const visible = roleSeesClientPhone(role) && phoneStageAllowed(projectStageOf(project, own));
  return { ...project, clientPhone: visible ? project.clientPhone || '' : '' };
}

export function listLocalObjects(user: SessionUser): JobObject[] {
  const db = loadDb();
  return db.objects
    .filter((o) => objectVisible(user, o))
    .map((o) => presentObject(o, user.role));
}

/** Пустая демо-компания показывает ту же доску, что «Топ проектов»: Никитин, Морозова, Вася. */
export function fillDemoCompanyRooms(objects: JobObject[], orgId?: string | null): JobObject[] {
  const own = (objects || []).filter(
    (obj) =>
      obj &&
      (obj.clientName || obj.room?.areaM2) &&
      (!orgId || !obj.orgId || obj.orgId === orgId),
  );
  if (own.length) return objects;
  if (orgId !== 'org_demo' && orgId !== 'org_demo_spb') return objects;
  return buildLocalDemoObjects().filter((obj) => obj.orgId === orgId);
}

function projectVisibleLocal(user: SessionUser, project: Project, objects: JobObject[]): boolean {
  if (user.role === 'admin') return true;
  if (!user.orgId || project.orgId !== user.orgId) return false;
  if (user.role === 'owner' || user.role === 'sales') return true;
  if (user.role === 'measurer' && project.measurerUserId === user.id) return true;
  if (user.role === 'crew' && project.crewUserId === user.id) return true;
  return objects.some((obj) => obj.projectId === project.id && objectVisible(user, obj));
}

export function listLocalProjects(user: SessionUser): Project[] {
  const db = loadDb();
  return (db.projects || [])
    .filter((project) => projectVisibleLocal(user, project, db.objects))
    .map((project) => presentProject(project, user.role, db.objects));
}

function projectAssignee(
  db: { users: Array<{ id: string; orgId?: string | null; role: string }> },
  input: ProjectInput,
  existing: Project | undefined,
  key: 'managerUserId' | 'measurerUserId' | 'crewUserId',
  orgId: string,
  roles: UserRole[],
  label: string,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(input, key)) return existing?.[key] || null;
  const raw = input[key];
  if (raw == null || String(raw).trim() === '') return null;
  const id = String(raw).trim();
  const person = db.users.find((user) => user.id === id);
  if (!person || person.orgId !== orgId || !roles.includes(normalizeRole(person.role))) {
    throw new Error(`${label} не из этой компании`);
  }
  return id;
}

function projectStatusField(input: ProjectInput, existing?: Project): Project['status'] {
  if (!Object.prototype.hasOwnProperty.call(input, 'status')) return existing?.status;
  const cleaned = cleanProjectStatus(input.status);
  if (cleaned.error) throw new Error(cleaned.error);
  return cleaned.value && PROJECT_STATUSES.includes(cleaned.value) ? cleaned.value : undefined;
}

function projectDateField(
  input: ProjectInput,
  existing: Project | undefined,
  key: 'startsAt' | 'dueAt',
): string | null {
  if (!Object.prototype.hasOwnProperty.call(input, key)) return existing?.[key] || null;
  const cleaned = cleanProjectDate(input[key]);
  if (cleaned.error) throw new Error(cleaned.error);
  return cleaned.value;
}

function projectArchiveField(input: ProjectInput, existing: Project | undefined, now: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(input, 'archived')) return existing?.archivedAt || null;
  if (input.archived) return existing?.archivedAt || now;
  return null;
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
  const orgId = existing?.orgId || actor.orgId;
  const status = projectStatusField(input, existing);
  const clientPhone = projectPhoneField(input, existing, status, db.objects);
  const refusal = projectRefusalField(input, existing, status, actor, now);
  const project: Project = {
    id: existing?.id || input.id || uid('prj'),
    orgId,
    name: name.slice(0, 250),
    clientName: String(input.clientName ?? existing?.clientName ?? '').trim(),
    clientPhone,
    address: String(input.address ?? existing?.address ?? '').trim(),
    city: String(input.city ?? existing?.city ?? '').trim(),
    description: String(input.description ?? existing?.description ?? '').trim().slice(0, 4000),
    ...(status ? { status } : {}),
    ...(refusal ? { refusal } : {}),
    managerUserId: projectAssignee(db, input, existing, 'managerUserId', orgId, ['owner', 'sales'], 'Менеджер'),
    measurerUserId: projectAssignee(db, input, existing, 'measurerUserId', orgId, ['measurer'], 'Замерщик'),
    crewUserId: projectAssignee(db, input, existing, 'crewUserId', orgId, ['crew'], 'Бригада'),
    startsAt: projectDateField(input, existing, 'startsAt'),
    dueAt: projectDateField(input, existing, 'dueAt'),
    archivedAt: projectArchiveField(input, existing, now),
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
  return presentProject(project, actor.role, db.objects);
}

/** Как на сервере: новый номер — только с этапа «Замер», формат проверяется. */
function projectPhoneField(
  input: ProjectInput,
  existing: Project | undefined,
  status: Project['status'],
  rooms: JobObject[],
): string {
  const current = String(existing?.clientPhone ?? '').trim();
  if (!Object.prototype.hasOwnProperty.call(input, 'clientPhone')) return current;
  const raw = String(input.clientPhone ?? '').trim();
  if (raw === current) return current;
  const cleaned = cleanClientPhone(raw);
  if (cleaned.error) throw new Error(cleaned.error);
  if (cleaned.value) {
    const own = rooms.filter((room) => existing && room.projectId === existing.id);
    if (!phoneStageAllowed(projectStageOf({ status }, own))) {
      throw new Error('Телефон клиента можно указать с этапа «Замер»');
    }
  }
  return cleaned.value || '';
}

function projectRefusalField(
  input: ProjectInput,
  existing: Project | undefined,
  status: Project['status'],
  actor: SessionUser,
  now: string,
): Project['refusal'] {
  if (status !== 'done') return null;
  const cleaned = cleanRefusal(input.refusal, {
    userId: actor.id,
    now,
    existing: existing?.status === 'done' ? existing.refusal || null : null,
  });
  if (cleaned.error) throw new Error(cleaned.error);
  return cleaned.value || null;
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

export function deleteLocalObject(id: string, actor: SessionUser): void {
  const db = loadDb();
  const existing = db.objects.find((o) => o.id === id);
  if (!existing) return;
  if (!objectVisible(actor, existing)) throw new Error('Недостаточно прав');
  if (!canDeleteObjects(actor.role) || existing.orgId !== actor.orgId) {
    throw new Error('Удалять проект и комнату могут менеджер и владелец своей компании');
  }
  saveDb({ ...db, objects: db.objects.filter((o) => o.id !== id) });
  removeFromObjectQueue(id);
  cacheObjects(listLocalObjects(actor));
}

export function deleteLocalProject(id: string, actor: SessionUser): void {
  if (!canDeleteObjects(actor.role) || !actor.orgId) {
    throw new Error('Удалять проект могут менеджер и владелец своей компании');
  }
  const db = loadDb();
  const project = (db.projects || []).find((item) => item.id === id);
  if (!project || project.orgId !== actor.orgId) throw new Error('Проект не найден');
  const roomIds = new Set(db.objects.filter((obj) => obj.projectId === id).map((obj) => obj.id));
  saveDb({
    ...db,
    projects: (db.projects || []).filter((item) => item.id !== id),
    objects: db.objects.filter((obj) => obj.projectId !== id),
  });
  for (const roomId of roomIds) removeFromObjectQueue(roomId);
  cacheObjects(listLocalObjects(actor));
}

export function upsertLocalObject(
  input: Partial<JobObject> & { id?: string },
  actor: SessionUser,
): JobObject {
  if (!actor.orgId) throw new Error('Нет организации');
  const db = loadDb();
  const now = new Date().toISOString();
  const org = db.orgs.find((o) => o.id === actor.orgId);
  const existing = input.id ? db.objects.find((o) => o.id === input.id) : null;
  if (!existing && !canCreateObjects(actor.role)) throw new Error('Недостаточно прав');
  if (existing && !objectVisible(actor, existing)) throw new Error('Недостаточно прав');
  if (
    existing &&
    input.status &&
    input.status !== existing.status &&
    !canMoveObjects(actor.role)
  ) {
    throw new Error('Статус меняет менеджер или владелец');
  }
  if (actor.role === 'crew') throw new Error('Бригада не меняет проект и комнату');

  const status = (input.status || existing?.status || 'draft') as JobObjectStatus;
  const phoneRaw = String(input.clientPhone ?? existing?.clientPhone ?? '').trim();
  let clientPhone = String(existing?.clientPhone ?? '').trim();
  if (input.clientPhone !== undefined && phoneRaw !== clientPhone) {
    const cleaned = cleanClientPhone(phoneRaw);
    if (cleaned.error) throw new Error(cleaned.error);
    if (cleaned.value && !phoneRoomStatusAllowed(status)) {
      throw new Error('Телефон клиента можно указать с этапа «Замер»');
    }
    clientPhone = cleaned.value || '';
  }
  let refusal: JobObject['refusal'] = null;
  if (status === 'closed') {
    const cleaned = cleanRefusal(input.refusal, {
      userId: actor.id,
      now,
      existing: existing?.status === 'closed' ? existing.refusal || null : null,
    });
    if (cleaned.error) throw new Error(cleaned.error);
    refusal = cleaned.value || null;
  }
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
    clientPhone,
    address: (input.address ?? existing?.address ?? '').trim(),
    city: (input.city ?? existing?.city ?? org?.settings.city ?? '').trim(),
    room: input.room || existing?.room || {},
    estimate: input.estimate !== undefined ? input.estimate : existing?.estimate ?? null,
    clientSummary: input.clientSummary ?? existing?.clientSummary ?? '',
    history: existing?.history || [],
    documents: existing?.documents,
    pendingSync: input.pendingSync === true,
    ...(refusal ? { refusal } : {}),
    ...carriedObjectLink(input, existing),
  };

  let projects = db.projects || [];
  if (!existing && !obj.projectId) {
    const project: Project = {
      id: uid('prj'),
      orgId: actor.orgId,
      name: (obj.clientName || obj.address || obj.roomName || 'Проект').slice(0, 250),
      clientName: obj.clientName,
      clientPhone: '',
      address: obj.address,
      city: obj.city,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
    };
    projects = [project, ...projects];
    obj.projectId = project.id;
  }

  const stamp = (action: string, detail?: string) => ({
    at: now,
    userId: actor.id,
    login: actor.login,
    authorName: actor.displayName || actor.login,
    action,
    ...(detail !== undefined ? { detail } : {}),
  });
  if (!existing) {
    obj.history = [stamp('create', status)];
  } else if (input.status && input.status !== existing.status) {
    obj.history = [stamp('status', `${existing.status}→${input.status}`), ...existing.history].slice(0, 50);
  } else {
    obj.history = [stamp('update'), ...(existing.history || [])].slice(0, 50);
  }

  const before = existing?.status === 'closed' ? existing.refusal : null;
  if (obj.refusal && (!before || before.reasonKey !== obj.refusal.reasonKey || before.comment !== obj.refusal.comment)) {
    obj.history = [stamp('refusal', obj.refusal.reasonKey), ...(obj.history || [])].slice(0, 50);
  }

  const objects = existing
    ? db.objects.map((o) => (o.id === obj.id ? obj : o))
    : [obj, ...db.objects];
  saveDb({ ...db, objects, projects });
  if (obj.pendingSync) enqueueObjectSync(obj);
  else removeFromObjectQueue(obj.id);
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

/** Сохранённые события плюс недостающий хвост демо-года. Хранилище не пишется. */
export function loadDemoAnalyticsEvents(): AnalyticsEvent[] {
  const stored = loadAnalyticsEvents();
  return supplementDemoHistory(stored, buildLocalDemoAnalytics() as AnalyticsEvent[]);
}

export function appendAnalyticsEvent(event: AnalyticsEvent): void {
  const list = [event, ...loadAnalyticsEvents()].slice(0, ANALYTICS_CAP);
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(list));
}

export function enqueueAnalyticsEvents(events: AnalyticsEvent[]): void {
  const q = [...events, ...readJsonArray<AnalyticsEvent>(ANALYTICS_QUEUE_KEY)].slice(0, 500);
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
  return aggregateAnalyticsDashboard(dedupeEvents([...extra, ...loadDemoAnalyticsEvents()]), {
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
  if (!existing || !objectVisible(actor, existing)) throw new Error('Комната не найдена');
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
        authorName: actor.displayName || actor.login,
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
