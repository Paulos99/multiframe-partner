/**
 * Local-first store for internal partner portal tests.
 * Survives reloads and works offline (PWA).
 */
import type {
  ActivityEvent,
  ExecutorLink,
  OrgSettings,
  SessionUser,
  UserRole,
} from '../../../../packages/shared/partner';

const DB_KEY = 'mf_partner_db_v2';
const SESSION_KEY = 'mf_partner_session_v2';

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
    ],
    orgs: [
      {
        id: orgId,
        createdAt: now,
        createdBy: adminId,
        settings: {
          companyName: 'Демо Партнёр',
          installPricePerM2: 1500,
          dowelsPerPanel: 2,
          dowelPriceRub: 25,
        },
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
    return JSON.parse(raw) as SessionUser;
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

export function userToSession(u: StoredUser, db: PartnerDb, execToken?: string): SessionUser {
  const org = u.orgId ? db.orgs.find((o) => o.id === u.orgId) : null;
  return {
    id: u.id,
    login: u.login,
    role: u.role,
    displayName: u.displayName,
    orgId: u.orgId,
    org: org ? { ...org.settings } : null,
    execToken: execToken || null,
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
    settings: {
      companyName: input.companyName.trim() || login,
      installPricePerM2: null,
      dowelsPerPanel: 2,
      dowelPriceRub: null,
    },
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
  const settings: OrgSettings = {
    ...db.orgs[idx]!.settings,
    ...patch,
    // RRC never stored as editable — ignore if passed
  };
  if (typeof patch.companyName === 'string') settings.companyName = patch.companyName.trim();
  if ('installPricePerM2' in patch) {
    settings.installPricePerM2 =
      patch.installPricePerM2 == null || Number.isNaN(Number(patch.installPricePerM2))
        ? null
        : Number(patch.installPricePerM2);
  }
  if ('dowelsPerPanel' in patch) {
    settings.dowelsPerPanel = Math.max(1, Number(patch.dowelsPerPanel) || 2);
  }
  if ('dowelPriceRub' in patch) {
    settings.dowelPriceRub =
      patch.dowelPriceRub == null || Number.isNaN(Number(patch.dowelPriceRub))
        ? null
        : Number(patch.dowelPriceRub);
  }
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

export function createExecutorLink(
  label: string,
  partner: SessionUser,
): { link: ExecutorLink; urlPath: string } {
  if (partner.role !== 'partner' || !partner.orgId) {
    throw new Error('Только партнёр может создавать ссылки');
  }
  const db = loadDb();
  const token = uid('ex').replace('ex_', '');
  const link: ExecutorLink = {
    id: uid('link'),
    token,
    orgId: partner.orgId,
    label: label.trim() || 'Исполнитель',
    createdAt: new Date().toISOString(),
    createdBy: partner.id,
    lastUsedAt: null,
    uses: 0,
  };
  let next: PartnerDb = { ...db, links: [link, ...db.links] };
  next = pushActivity(next, {
    orgId: partner.orgId,
    userId: partner.id,
    login: partner.login,
    action: 'create_link',
    detail: link.label,
  });
  saveDb(next);
  return { link, urlPath: `?exec=${encodeURIComponent(token)}` };
}

export function enterByExecToken(token: string): SessionUser {
  const db = loadDb();
  const link = db.links.find((l) => l.token === token);
  if (!link) throw new Error('Ссылка недействительна');
  const org = db.orgs.find((o) => o.id === link.orgId);
  if (!org) throw new Error('Организация не найдена');
  const links = db.links.map((l) =>
    l.id === link.id
      ? { ...l, uses: l.uses + 1, lastUsedAt: new Date().toISOString() }
      : l,
  );
  let next: PartnerDb = { ...db, links };
  const session: SessionUser = {
    id: `exec_${link.id}`,
    login: `exec:${link.label}`,
    role: 'executor',
    displayName: link.label,
    orgId: org.id,
    org: { ...org.settings },
    execToken: token,
  };
  next = pushActivity(next, {
    orgId: org.id,
    userId: session.id,
    login: session.login,
    action: 'exec_enter',
    detail: link.label,
  });
  saveDb(next);
  saveSession(session);
  return session;
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
        linkCount: db.links.filter((l) => l.orgId === u.orgId).length,
      };
    });
}

export function listLinksForOrg(orgId: string): ExecutorLink[] {
  return loadDb().links.filter((l) => l.orgId === orgId);
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
