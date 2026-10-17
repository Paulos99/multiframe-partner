/**
 * Local-first store for partner portal (offline / no API).
 * Survives reloads and works as PWA cache.
 */
import type {
  ActivityEvent,
  AnalyticsDashboard,
  AnalyticsEvent,
  ExecutorLink,
  JobObject,
  JobObjectDocument,
  JobObjectStatus,
  OrgSettings,
  SessionUser,
  UserRole,
} from '../../../../packages/shared/partner';
import {
  aggregateAnalyticsDashboard,
  canEditOrg,
  canManageStaff,
  documentsForRole,
  DEFAULT_DOWEL_PRICE_RUB,
  DEFAULT_INSTALL_PRICE_PER_M2,
  isStaffRole,
  normalizeOrgSettings,
  normalizeRole,
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  redactOrgPrices,
  STAFF_ROLES,
} from '../../../../packages/shared/partner';
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
  return {
    users,
    orgs,
    links: raw.links || [],
    activity: raw.activity || [],
    objects: raw.objects || [],
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
    if (!force && localStorage.getItem(DEMO_ANALYTICS_SEED_KEY) === '1') return;
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
        let settings = normalizeOrgSettings(org.settings);
        if (session.role === 'crew') settings = redactOrgPrices(settings)!;
        session.org = settings;
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
  let settings = org ? normalizeOrgSettings(org.settings) : null;
  if (settings && role === 'crew') settings = redactOrgPrices(settings);
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
  const now = new Date().toISOString();
  const orgId = uid('org');
  const userId = uid('u');
  const org: StoredOrg = {
    id: orgId,
    createdAt: now,
    createdBy: input.admin.id,
    settings: normalizeOrgSettings({
      companyName: input.companyName.trim() || login,
      city: input.city?.trim() || '',
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
  const settings = normalizeOrgSettings({
    ...db.orgs[idx]!.settings,
    ...patch,
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
    const orgForSession =
      session.role === 'crew' ? redactOrgPrices(settings)! : settings;
    saveSession({ ...session, org: { ...orgForSession } });
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
    throw new Error('Только владелец может создавать сотрудников');
  }
  const role = normalizeRole(input.role);
  if (!STAFF_ROLES.includes(role)) {
    throw new Error('Роль: менеджер, замерщик или монтажник');
  }
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
    throw new Error('Только владелец');
  }
  const password = newPassword.trim() || generatePassword();
  const db = loadDb();
  const idx = db.users.findIndex(
    (u) => u.id === staffUserId && isStaffRole(u.role) && u.orgId === owner.orgId,
  );
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
    throw new Error('Только владелец');
  }
  const db = loadDb();
  const staff = db.users.find(
    (u) => u.id === staffUserId && isStaffRole(u.role) && u.orgId === owner.orgId,
  );
  if (!staff) throw new Error('Сотрудник не найден');
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

function objectVisible(user: SessionUser, obj: JobObject): boolean {
  if (user.role === 'admin') return true;
  if (!user.orgId || obj.orgId !== user.orgId) return false;
  if (user.role === 'owner') return true;
  if (user.role === 'sales') {
    return obj.createdBy === user.id || obj.assignedTo === user.id || !obj.assignedTo;
  }
  if (user.role === 'measurer') {
    return obj.createdBy === user.id || obj.assignedTo === user.id;
  }
  if (user.role === 'crew') {
    return obj.assignedTo === user.id;
  }
  return false;
}

function redactObjectForRole(obj: JobObject, role: UserRole): JobObject {
  const documents = documentsForRole(obj.documents, role);
  if (role !== 'crew') return { ...obj, documents };
  return {
    ...obj,
    documents,
    estimate: obj.estimate
      ? {
          panels: obj.estimate.panels,
          dowels: obj.estimate.dowels,
          panelsCost: null,
          installCost: null,
          dowelsCost: null,
          totalCost: null,
        }
      : null,
  };
}

export function listLocalObjects(user: SessionUser): JobObject[] {
  const db = loadDb();
  return db.objects
    .filter((o) => objectVisible(user, o))
    .map((o) => redactObjectForRole(o, user.role));
}

export function deleteLocalObject(id: string, actor: SessionUser): void {
  const db = loadDb();
  const existing = db.objects.find((o) => o.id === id);
  if (!existing) return;
  if (!objectVisible(actor, existing)) throw new Error('Недостаточно прав');
  if (actor.role === 'crew') throw new Error('Монтажник не удаляет объекты');
  saveDb({ ...db, objects: db.objects.filter((o) => o.id !== id) });
  removeFromObjectQueue(id);
  cacheObjects(listLocalObjects(actor));
}

export function upsertLocalObject(
  input: Partial<JobObject> & { id?: string },
  actor: SessionUser,
): JobObject {
  if (!actor.orgId) throw new Error('Нет организации');
  if (actor.role === 'crew' && !input.id) throw new Error('Монтажник не создаёт объекты');
  const db = loadDb();
  const now = new Date().toISOString();
  const org = db.orgs.find((o) => o.id === actor.orgId);
  const existing = input.id ? db.objects.find((o) => o.id === input.id) : null;
  if (existing && !objectVisible(actor, existing)) throw new Error('Недостаточно прав');

  const status = (input.status || existing?.status || 'draft') as JobObjectStatus;
  const obj: JobObject = {
    id: existing?.id || input.id || uid('obj'),
    orgId: existing?.orgId || actor.orgId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || actor.id,
    assignedTo:
      input.assignedTo !== undefined ? input.assignedTo : existing?.assignedTo ?? null,
    status,
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
  };

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
  saveDb({ ...db, objects });
  enqueueObjectSync(obj);
  cacheObjects(listLocalObjects(actor));
  return redactObjectForRole(obj, actor.role);
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
  const q = [...events, ...readJsonArray<AnalyticsEvent>(ANALYTICS_QUEUE_KEY)].slice(0, 500);
  localStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(q));
}

export function peekAnalyticsQueue(): AnalyticsEvent[] {
  return readJsonArray<AnalyticsEvent>(ANALYTICS_QUEUE_KEY);
}

export function clearAnalyticsQueue(): void {
  localStorage.removeItem(ANALYTICS_QUEUE_KEY);
}

export function buildLocalDashboard(opts: {
  from?: string | null;
  to?: string | null;
  orgId?: string | null;
}): AnalyticsDashboard {
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
  return aggregateAnalyticsDashboard(loadAnalyticsEvents(), {
    source: 'local',
    from: opts.from,
    to: opts.to,
    orgId: opts.orgId,
    partnerCount: db.users.filter((u) => u.role === 'owner').length,
    executorCount: opts.orgId
      ? executorDirectory.filter((e) => e.orgId === opts.orgId).length
      : executorDirectory.length,
    executorDirectory,
  });
}

const DOC_BYTES_KEY = 'mf_partner_doc_bytes_v1';
const DOC_QUEUE_KEY = 'mf_partner_doc_queue_v1';

export type QueuedObjectDocument = {
  objectId: string;
  versionId: string;
  kind: 'estimate' | 'spec';
  filename: string;
  pdfBase64: string;
  hasScheme: boolean;
  panels?: number | null;
  areaM2?: number | null;
};

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
  const map = readDocBytes();
  map[id] = base64;
  const ids = Object.keys(map);
  while (ids.length > 24) {
    delete map[ids.shift()!];
  }
  localStorage.setItem(DOC_BYTES_KEY, JSON.stringify(map));
}

export function loadLocalDocBytes(id: string): string | null {
  return readDocBytes()[id] || null;
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
  if (actor.role === 'crew') throw new Error('Монтажник не прикладывает смету');
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
        action: 'calc_pdf',
        detail: meta.map((d) => d.filename).join(', '),
      },
      ...(existing.history || []),
    ].slice(0, 50),
  };
  saveDb({ ...db, objects: db.objects.map((o) => (o.id === next.id ? next : o)) });
  cacheObjects(listLocalObjects(actor));
  return redactObjectForRole(next, actor.role);
}
