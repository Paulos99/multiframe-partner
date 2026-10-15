/**
 * Local-first store for internal partner portal tests.
 * Survives reloads and works offline (PWA).
 */
import type {
  ActivityEvent,
  AnalyticsDashboard,
  AnalyticsEvent,
  ExecutorLink,
  OrgSettings,
  SessionUser,
  UserRole,
} from '../../../../packages/shared/partner';
import {
  aggregateAnalyticsDashboard,
  normalizeOrgSettings,
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
} from '../../../../packages/shared/partner';

const DB_KEY = 'mf_partner_db_v2';
const SESSION_KEY = 'mf_partner_session_v2';
const ANALYTICS_KEY = 'mf_partner_analytics_v1';
const ANALYTICS_QUEUE_KEY = 'mf_partner_analytics_queue_v1';
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
  const adminId = 'u_admin';
  const orgId = 'org_demo';
  const partnerId = 'u_partner1';
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: adminId,
        login: 'admin',
        password: 'admin1234',
        role: 'admin',
        displayName: 'Администратор StP',
        orgId: null,
        createdAt: now,
      },
      {
        id: partnerId,
        login: 'partner1',
        password: 'demo1234',
        role: 'partner',
        displayName: 'Демо Партнёр',
        orgId,
        createdAt: now,
      },
      {
        id: 'u_exec1',
        login: 'exec1',
        password: 'exec1234',
        role: 'executor',
        displayName: 'Демо Сотрудник',
        orgId,
        createdAt: now,
      },
    ],
    orgs: [
      {
        id: orgId,
        createdAt: now,
        createdBy: adminId,
        settings: normalizeOrgSettings({
          companyName: 'Демо Партнёр',
          panelPriceRub: OFFICIAL_PANEL_PRICE_RUB,
          pricePerM2: OFFICIAL_PRICE_PER_M2,
          installPricePerM2: 1500,
          dowelsPerPanel: 2,
          dowelPriceRub: 25,
        }),
      },
    ],
    links: [],
    activity: [
      {
        id: uid('act'),
        at: now,
        orgId,
        userId: adminId,
        login: 'admin',
        action: 'seed',
        detail: 'База инициализирована',
      },
    ],
  };
}

export function loadDb(): PartnerDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const db = defaultDb();
      saveDb(db);
      return db;
    }
    const parsed = JSON.parse(raw) as PartnerDb;
    if (!parsed.users?.length) {
      const db = defaultDb();
      saveDb(db);
      return db;
    }
    // Backfill RRC fields for older local DBs
    parsed.orgs = (parsed.orgs || []).map((o) => ({
      ...o,
      settings: normalizeOrgSettings(o.settings || { companyName: '' }),
    }));
    let renamed = false;
    parsed.users = (parsed.users || []).map((u) => {
      if (u.displayName === 'Демо Исполнитель') {
        renamed = true;
        return { ...u, displayName: 'Демо Сотрудник' };
      }
      return u;
    });
    if (renamed) saveDb(parsed);
    return parsed;
  } catch {
    const db = defaultDb();
    saveDb(db);
    return db;
  }
}

export function saveDb(db: PartnerDb): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as SessionUser;
    // Always refresh org settings from DB (partner may have changed prices)
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
  return {
    id: u.id,
    login: u.login,
    role: u.role,
    displayName: u.displayName,
    orgId: u.orgId,
    org: org ? normalizeOrgSettings(org.settings) : null,
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
    detail: `Роль: ${u.role}`,
  });
  saveDb(next);
  saveSession(session);
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
}

export function createPartnerAccount(input: {
  login: string;
  password: string;
  companyName: string;
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
      panelPriceRub: OFFICIAL_PANEL_PRICE_RUB,
      pricePerM2: OFFICIAL_PRICE_PER_M2,
      installPricePerM2: null,
      dowelsPerPanel: 2,
      dowelPriceRub: null,
    }),
  };
  const user: StoredUser = {
    id: userId,
    login,
    password: input.password,
    role: 'partner',
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
  const idx = db.users.findIndex((u) => u.id === partnerUserId && u.role === 'partner');
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
  const partner = db.users.find((u) => u.id === partnerUserId && u.role === 'partner');
  if (!partner) throw new Error('Партнёр не найден');
  const orgId = partner.orgId;
  const users = db.users.filter(
    (u) => u.id !== partnerUserId && !(u.role === 'executor' && orgId && u.orgId === orgId),
  );
  const orgs = orgId ? db.orgs.filter((o) => o.id !== orgId) : db.orgs;
  const links = orgId ? db.links.filter((l) => l.orgId !== orgId) : db.links;
  let next: PartnerDb = { ...db, users, orgs, links };
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
  if (actor.role !== 'partner' && actor.role !== 'admin') {
    throw new Error('Недостаточно прав');
  }
  if (actor.role === 'partner' && actor.orgId !== orgId) {
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
    saveSession({ ...session, org: { ...settings } });
  }
  return settings;
}

export function createExecutorAccount(input: {
  login: string;
  password: string;
  displayName: string;
  partner: SessionUser;
}): { user: StoredUser; password: string } {
  if (input.partner.role !== 'partner' || !input.partner.orgId) {
    throw new Error('Только партнёр может создавать сотрудников');
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
    role: 'executor',
    displayName: input.displayName.trim() || login,
    orgId: input.partner.orgId,
    createdAt: now,
  };
  let next: PartnerDb = { ...db, users: [...db.users, user] };
  next = pushActivity(next, {
    orgId: input.partner.orgId,
    userId: input.partner.id,
    login: input.partner.login,
    action: 'create_executor',
    detail: `${login} · ${user.displayName}`,
  });
  saveDb(next);
  return { user, password };
}

export function resetExecutorPassword(
  executorUserId: string,
  newPassword: string,
  partner: SessionUser,
): string {
  if (partner.role !== 'partner' || !partner.orgId) {
    throw new Error('Только партнёр');
  }
  const password = newPassword.trim() || generatePassword();
  const db = loadDb();
  const idx = db.users.findIndex(
    (u) => u.id === executorUserId && u.role === 'executor' && u.orgId === partner.orgId,
  );
  if (idx < 0) throw new Error('Сотрудник не найден');
  const users = [...db.users];
  users[idx] = { ...users[idx]!, password };
  let next: PartnerDb = { ...db, users };
  next = pushActivity(next, {
    orgId: partner.orgId,
    userId: partner.id,
    login: partner.login,
    action: 'reset_executor_password',
    detail: users[idx]!.login,
  });
  saveDb(next);
  return password;
}

export function deleteExecutorAccount(executorUserId: string, partner: SessionUser): void {
  if (partner.role !== 'partner' || !partner.orgId) {
    throw new Error('Только партнёр');
  }
  const db = loadDb();
  const staff = db.users.find(
    (u) => u.id === executorUserId && u.role === 'executor' && u.orgId === partner.orgId,
  );
  if (!staff) throw new Error('Сотрудник не найден');
  const users = db.users.filter((u) => u.id !== executorUserId);
  let next: PartnerDb = { ...db, users };
  next = pushActivity(next, {
    orgId: partner.orgId,
    userId: partner.id,
    login: partner.login,
    action: 'delete_executor',
    detail: `${staff.login} · ${staff.displayName}`,
  });
  saveDb(next);
  const session = loadSession();
  if (session?.id === executorUserId) {
    saveSession(null);
  }
}

export function listPartners() {
  const db = loadDb();
  return db.users
    .filter((u) => u.role === 'partner')
    .map((u) => {
      const org = db.orgs.find((o) => o.id === u.orgId);
      const last = db.activity.find((a) => a.orgId === u.orgId && a.action === 'login');
      return {
        user: u,
        org,
        lastLogin: last?.at || null,
        executorCount: db.users.filter((x) => x.role === 'executor' && x.orgId === u.orgId)
          .length,
      };
    });
}

export function listExecutorsForOrg(orgId: string): StoredUser[] {
  return loadDb().users.filter((u) => u.role === 'executor' && u.orgId === orgId);
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
    .filter((u) => u.role === 'executor')
    .map((u) => ({
      userId: u.id,
      login: u.login,
      displayName: u.displayName,
      orgId: u.orgId,
    }));
  return aggregateAnalyticsDashboard(loadAnalyticsEvents(), {
    source: 'local',
    from: opts.from,
    to: opts.to,
    orgId: opts.orgId,
    partnerCount: db.users.filter((u) => u.role === 'partner').length,
    executorCount: opts.orgId
      ? executorDirectory.filter((e) => e.orgId === opts.orgId).length
      : executorDirectory.length,
    executorDirectory,
  });
}
