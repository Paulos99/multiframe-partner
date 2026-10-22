/** Shared types — partner portal roles, org settings, job objects. */

import { computeAnalyticsFunnel } from './funnel.ts';

export type UserRole = 'admin' | 'owner' | 'sales' | 'measurer' | 'crew';

/** @deprecated migrated to owner / staff roles */
export type LegacyUserRole = 'partner' | 'executor';

/** Roles that belong to a partner company (not StP admin). */
export const ORG_ROLES: UserRole[] = ['owner', 'sales', 'measurer', 'crew'];

/** Staff under an owner (analytics “executors” table). */
export const STAFF_ROLES: UserRole[] = ['sales', 'measurer', 'crew'];

/** Название партнёрской сети в кабинете и демо-материалах. */
export const PARTNER_NETWORK_NAME = 'Партнёрская сеть StP MultiFrame';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Админ StP',
  owner: 'Владелец',
  sales: 'Менеджер',
  measurer: 'Замерщик',
  crew: 'Монтажник',
};

export function isOrgRole(role: string): role is UserRole {
  return (ORG_ROLES as string[]).includes(role);
}

export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as string[]).includes(role);
}

/** Migrate legacy local/API role strings. */
export function normalizeRole(role: string | null | undefined): UserRole {
  if (role === 'partner') return 'owner';
  if (role === 'executor') return 'measurer';
  if (
    role === 'admin' ||
    role === 'owner' ||
    role === 'sales' ||
    role === 'measurer' ||
    role === 'crew'
  ) {
    return role;
  }
  return 'measurer';
}

export function canEditOrg(role: UserRole): boolean {
  return role === 'admin' || role === 'owner';
}

/**
 * Создание, удаление и смена пароля сотрудников своей компании.
 * Менеджер (`sales`) — как владелец, но не owner и не админ StP.
 */
export function canManageStaff(role: UserRole): boolean {
  return role === 'owner' || role === 'sales';
}

export function canSeeOrgAnalytics(role: UserRole): boolean {
  return role === 'admin' || role === 'owner' || role === 'sales';
}

export function canManagePartners(role: UserRole): boolean {
  return role === 'admin';
}

export function canCreateObjects(role: UserRole): boolean {
  return role === 'owner' || role === 'sales' || role === 'measurer';
}

/** Only the platform admin and the company owner may delete objects (enforced by the API too). */
export function canDeleteObjects(role: UserRole): boolean {
  return role === 'admin' || role === 'owner';
}

export function canAssignObjects(role: UserRole): boolean {
  return role === 'owner' || role === 'sales';
}

/** Official StP RRC (reference in cabinet). */
export const OFFICIAL_PANEL_PRICE_RUB = 2396;
export const OFFICIAL_PRICE_PER_M2 = 5990;

/** @deprecated use OFFICIAL_* */
export const FIXED_PANEL_PRICE_RUB = OFFICIAL_PANEL_PRICE_RUB;
/** @deprecated use OFFICIAL_* */
export const FIXED_PRICE_PER_M2 = OFFICIAL_PRICE_PER_M2;
/** @deprecated use OFFICIAL_* */
export const DEFAULT_PANEL_PRICE_RUB = OFFICIAL_PANEL_PRICE_RUB;
/** @deprecated use OFFICIAL_* */
export const DEFAULT_PRICE_PER_M2 = OFFICIAL_PRICE_PER_M2;

export const DEFAULT_DOWELS_PER_PANEL = 2;
export const DOWEL_RESERVE = 0.15;
export const PANEL_AREA_M2 = 0.75 * 0.55;
/** Default install labour ₽/m² for partner estimate when not set. */
export const DEFAULT_INSTALL_PRICE_PER_M2 = 1500;
/** Default dowel unit price ₽ for partner estimate when not set. */
export const DEFAULT_DOWEL_PRICE_RUB = 25;

export type OrgSettings = {
  companyName: string;
  /** City / region for network analytics. */
  city: string;
  /** Partner RRC per panel ₽ (defaults to official). */
  panelPriceRub: number;
  /** Partner RRC per m² ₽ (defaults to official). */
  pricePerM2: number;
  /** Install labour ₽/m². Null = hide install line. */
  installPricePerM2: number | null;
  /** Dowels per panel (default 2). */
  dowelsPerPanel: number;
  /** Price per dowel ₽. Null = quantity only. */
  dowelPriceRub: number | null;
};

export type SessionUser = {
  avatarUrl?: string | null;
  id: string;
  login: string;
  role: UserRole;
  displayName: string;
  /** Set for org roles. */
  orgId: string | null;
  org: OrgSettings | null;
};

/** @deprecated links replaced by staff login/password accounts */
export type ExecutorLink = {
  id: string;
  token: string;
  orgId: string;
  label: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  uses: number;
};

/** Legacy shape kept for estimate helpers. */
export type PartnerProfile = SessionUser &
  OrgSettings & {
    companyName: string;
    panelPriceRub: number;
    pricePerM2: number;
    installPricePerM2: number | null;
    dowelsPerPanel: number;
    dowelPriceRub: number | null;
  };

export type PatchOrgRequest = Partial<OrgSettings>;

export type JobObjectStatus =
  | 'draft'
  | 'measured'
  | 'quote_sent'
  | 'install'
  | 'closed';

export const JOB_OBJECT_STATUS_LABELS: Record<JobObjectStatus, string> = {
  draft: 'Черновик',
  measured: 'Замер',
  quote_sent: 'КП отправлено',
  install: 'Монтаж',
  closed: 'Закрыто',
};

export type JobObjectRoom = {
  roomType?: string | null;
  /** Custom name when roomType is «other». */
  roomTypeCustom?: string | null;
  areaM2?: number | null;
  houseType?: string | null;
  objectStage?: string | null;
  classBefore?: string | null;
  classAfter?: string | null;
  /** Opaque problemomer answers snapshot. */
  answers?: Record<string, unknown> | null;
};

export type JobObjectEstimate = {
  panels: number;
  dowels: number;
  panelsCost?: number | null;
  installCost?: number | null;
  dowelsCost?: number | null;
  totalCost?: number | null;
};

/**
 * Документы объекта.
 * estimate — «Смета»: PDF калькулятора с ценами, количеством и схемой раскладки.
 * profile — «Профиль»: PDF проблемомера, акустический профиль помещения.
 * spec — старые записи «спецификация без цен» (до 18.10.2026). Новые не создаются,
 * читаются как смета той же версии, если цены у версии нет.
 */
export type JobDocumentKind = 'estimate' | 'profile' | 'spec';

export const JOB_DOCUMENT_LABELS: Record<'estimate' | 'profile', string> = {
  estimate: 'Смета',
  profile: 'Профиль',
};

/** Как показывать запись: старая spec — это смета. */
export function documentDisplayKind(kind: string | null | undefined): 'estimate' | 'profile' {
  return kind === 'profile' ? 'profile' : 'estimate';
}

export function documentLabel(kind: string | null | undefined): string {
  return JOB_DOCUMENT_LABELS[documentDisplayKind(kind)];
}

export type JobObjectDocument = {
  id: string;
  /** Общий id одного сохранения (прогон калькулятора или проблемомера). */
  versionId: string;
  createdAt: string;
  createdBy: string;
  kind: JobDocumentKind;
  filename: string;
  /** Ключ в Object Storage. Байты в platform JSON не кладём. */
  storageKey?: string | null;
  hasScheme: boolean;
  panels?: number | null;
  areaM2?: number | null;
  /** Демо-карточка без файла в бакете: PDF собирается в браузере. */
  demo?: boolean;
  /** Только локальное хранилище. API это поле не отдаёт. */
  dataBase64?: string | null;
};

/**
 * Документы объекта одинаково для всех ролей: сметы и профили, новые сверху.
 * Старая пара «смета + спецификация» одной версии показывается одной сметой (с ценами).
 * Спецификация без пары остаётся видна как смета, чтобы старые файлы не пропали.
 * То же правило, что в apps/api/documentAccess.js.
 */
export function visibleDocuments(docs: JobObjectDocument[] | null | undefined): JobObjectDocument[] {
  const list = [...(docs || [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const pricedVersions = new Set(list.filter((d) => d.kind === 'estimate').map((d) => d.versionId || d.id));
  return list.filter((d) => {
    if (d.kind === 'estimate' || d.kind === 'profile') return true;
    if (d.kind === 'spec') return !pricedVersions.has(d.versionId || d.id);
    return false;
  });
}

/** «Смета · Профиль» — какие документы есть у объекта. Пусто, если документов нет. */
export function documentKindsSummary(docs: JobObjectDocument[] | null | undefined): string {
  const kinds = new Set(visibleDocuments(docs).map((d) => documentDisplayKind(d.kind)));
  return (['estimate', 'profile'] as const)
    .filter((kind) => kinds.has(kind))
    .map((kind) => JOB_DOCUMENT_LABELS[kind])
    .join(' · ');
}

export type JobObjectHistoryEntry = {
  at: string;
  userId: string | null;
  login: string;
  action: string;
  detail?: string;
};

export type JobObject = {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  assignedTo: string | null;
  status: JobObjectStatus;
  stageOrder?: number;
  clientName: string;
  clientPhone: string;
  address: string;
  city: string;
  room: JobObjectRoom;
  estimate: JobObjectEstimate | null;
  clientSummary: string;
  history: JobObjectHistoryEntry[];
  /** Версии PDF калькулятора, новые первыми. Предыдущие не затираются. */
  documents?: JobObjectDocument[];
  /** Комната принадлежит проекту. Новый объект получает проект при создании. */
  projectId?: string | null;
  /** Название комнаты внутри проекта. У старых объектов поля нет. */
  roomName?: string | null;
  /** Local-only pending sync flag. */
  pendingSync?: boolean;
};

/** Проект: клиент и адрес. Комнаты — объекты с этим projectId. Сумм и смет в записи нет. */
export type Project = {
  id: string;
  orgId: string;
  name: string;
  clientName: string;
  clientPhone: string;
  address: string;
  city: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type ProjectInput = {
  id?: string;
  name?: string;
  clientName?: string;
  clientPhone?: string;
  address?: string;
  city?: string;
};

export type ActivityEvent = {
  id: string;
  at: string;
  orgId: string | null;
  userId: string | null;
  login: string;
  action: string;
  detail?: string;
};

export type AnalyticsTool = 'problemomer' | 'calculator' | 'cabinet';
export type AnalyticsAction =
  | 'login'
  | 'open'
  | 'result'
  | 'pdf'
  | 'share'
  | 'calc_done';

export type AnalyticsObject = {
  roomType?: string | null;
  roomTypeCustom?: string | null;
  areaM2?: number | null;
  houseType?: string | null;
  objectStage?: string | null;
  classBefore?: string | null;
  classAfter?: string | null;
  panels?: number | null;
  mode?: string | null;
  label?: string | null;
  city?: string | null;
};

export type AnalyticsEvent = {
  id: string;
  at: string;
  orgId: string | null;
  userId: string | null;
  login: string;
  role: UserRole | string;
  companyName: string;
  city?: string;
  tool: AnalyticsTool;
  action: AnalyticsAction;
  /** Один проход воронки. Старые события без поля схлопываются запасным ключом. */
  sessionId?: string | null;
  object?: AnalyticsObject | null;
};

export type AnalyticsPartnerRow = {
  orgId: string | null;
  companyName: string;
  city: string;
  logins: number;
  /** Completed Problemomer results only (not opens). */
  problemomer: number;
  /** Completed calculator runs only (not opens). */
  calculator: number;
  pdf: number;
  shares: number;
  areaM2: number;
  panels: number;
  lastActiveAt: string | null;
};

export type AnalyticsExecutorRow = {
  userId: string | null;
  login: string;
  displayName: string;
  role?: string;
  logins: number;
  problemomer: number;
  calculator: number;
  pdf: number;
  results: number;
  lastActiveAt: string | null;
};

export type AnalyticsKpi = {
  /** Registered partners when known; otherwise active orgs in period. */
  partners: number;
  activePartners: number;
  executors: number;
  problemomerResults: number;
  calculatorDone: number;
  pdf: number;
  shares: number;
  logins: number;
  areaM2: number;
  panels: number;
};

export type AnalyticsFunnel = {
  problemomer: { open: number; result: number; pdf: number; share: number };
  calculator: { open: number; calcDone: number; pdf: number };
};

export type AnalyticsSeriesPoint = {
  day: string;
  problemomer: number;
  calculator: number;
  pdf: number;
  logins: number;
};

export type AnalyticsBreakdownItem = {
  key: string;
  count: number;
  share: number;
};

export type AnalyticsVolume = {
  areaM2Sum: number;
  areaM2Avg: number;
  panelsSum: number;
  completedCount: number;
};

export type AnalyticsDashboard = {
  source: 'api' | 'local';
  from: string | null;
  to: string | null;
  kpi: AnalyticsKpi;
  /** Same-length previous window; null when period is «all time». */
  kpiPrev: AnalyticsKpi | null;
  funnel: AnalyticsFunnel;
  series: AnalyticsSeriesPoint[];
  breakdowns: {
    roomType: AnalyticsBreakdownItem[];
    houseType: AnalyticsBreakdownItem[];
    objectStage: AnalyticsBreakdownItem[];
    classTransition: AnalyticsBreakdownItem[];
    calcMode: AnalyticsBreakdownItem[];
    city: AnalyticsBreakdownItem[];
  };
  volume: AnalyticsVolume;
  partners: AnalyticsPartnerRow[];
  executors: AnalyticsExecutorRow[];
  recentObjects: AnalyticsEvent[];
  events: AnalyticsEvent[];
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Админ сети STP и его организация — не партнёры. Определяем по роли, данные не удаляем. */
export type NetworkAdminScope = { adminUserIds?: string[]; adminOrgIds?: string[] };

export function networkAdminScope(
  users: ReadonlyArray<{ id: string; role: string; orgId?: string | null }>,
): Required<NetworkAdminScope> {
  const admins = users.filter((u) => u.role === 'admin');
  return {
    adminUserIds: admins.map((u) => u.id).filter(Boolean),
    adminOrgIds: admins.map((u) => u.orgId).filter((id): id is string => Boolean(id)),
  };
}

export function isNetworkAdminEvent(e: AnalyticsEvent, scope: NetworkAdminScope = {}): boolean {
  if (String(e.role || '') === 'admin') return true;
  if (e.userId && (scope.adminUserIds || []).includes(e.userId)) return true;
  if (e.orgId && (scope.adminOrgIds || []).includes(e.orgId)) return true;
  return false;
}

function filterAnalyticsEvents(
  allEvents: AnalyticsEvent[],
  opts: { from?: string | null; to?: string | null; orgId?: string | null } & NetworkAdminScope,
): AnalyticsEvent[] {
  const fromMs = opts.from ? Date.parse(opts.from) : null;
  const toMs = opts.to ? Date.parse(opts.to) : null;
  return allEvents
    .filter((e) => {
      const t = Date.parse(e.at);
      if (Number.isNaN(t)) return false;
      if (isNetworkAdminEvent(e, opts)) return false;
      if (fromMs != null && t < fromMs) return false;
      if (toMs != null && t > toMs) return false;
      if (opts.orgId && e.orgId !== opts.orgId) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function isCompletedWork(e: AnalyticsEvent): boolean {
  return e.action === 'result' || e.action === 'calc_done';
}

function numOr0(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function emptyPartnerRow(
  orgId: string | null,
  companyName: string,
  city = '',
): AnalyticsPartnerRow {
  return {
    orgId,
    companyName,
    city,
    logins: 0,
    problemomer: 0,
    calculator: 0,
    pdf: 0,
    shares: 0,
    areaM2: 0,
    panels: 0,
    lastActiveAt: null,
  };
}

function computeVolume(events: AnalyticsEvent[]): AnalyticsVolume {
  let areaM2Sum = 0;
  let panelsSum = 0;
  let withArea = 0;
  let completedCount = 0;
  for (const e of events) {
    if (!isCompletedWork(e)) continue;
    completedCount += 1;
    const area = numOr0(e.object?.areaM2);
    const panels = numOr0(e.object?.panels);
    if (area > 0) {
      areaM2Sum += area;
      withArea += 1;
    }
    if (panels > 0) panelsSum += panels;
  }
  return {
    areaM2Sum: Math.round(areaM2Sum * 10) / 10,
    areaM2Avg: withArea ? Math.round((areaM2Sum / withArea) * 10) / 10 : 0,
    panelsSum: Math.round(panelsSum),
    completedCount,
  };
}

function computeKpi(
  events: AnalyticsEvent[],
  opts: { partnerCount?: number; executorCount?: number; activeExecutors: number },
): AnalyticsKpi {
  const orgs = new Set<string>();
  let areaM2 = 0;
  let panels = 0;
  for (const e of events) {
    orgs.add(e.orgId || e.companyName || e.login);
    if (isCompletedWork(e)) {
      areaM2 += numOr0(e.object?.areaM2);
      panels += numOr0(e.object?.panels);
    }
  }
  return {
    partners: opts.partnerCount ?? orgs.size,
    activePartners: orgs.size,
    executors: opts.executorCount ?? opts.activeExecutors,
    problemomerResults: events.filter((e) => e.tool === 'problemomer' && e.action === 'result')
      .length,
    calculatorDone: events.filter((e) => e.tool === 'calculator' && e.action === 'calc_done')
      .length,
    pdf: events.filter((e) => e.action === 'pdf').length,
    shares: events.filter((e) => e.action === 'share').length,
    logins: events.filter((e) => e.action === 'login').length,
    areaM2: Math.round(areaM2 * 10) / 10,
    panels: Math.round(panels),
  };
}

function computeFunnel(events: AnalyticsEvent[]): AnalyticsFunnel {
  return computeAnalyticsFunnel(events);
}

function toBreakdown(counts: Map<string, number>): AnalyticsBreakdownItem[] {
  const total = [...counts.values()].reduce((s, n) => s + n, 0) || 1;
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      count,
      share: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);
}

function computeBreakdowns(events: AnalyticsEvent[]): AnalyticsDashboard['breakdowns'] {
  const roomType = new Map<string, number>();
  const houseType = new Map<string, number>();
  const objectStage = new Map<string, number>();
  const classTransition = new Map<string, number>();
  const calcMode = new Map<string, number>();
  const city = new Map<string, number>();

  const bump = (map: Map<string, number>, key: string | null | undefined) => {
    const k = (key && String(key).trim()) || 'unknown';
    map.set(k, (map.get(k) || 0) + 1);
  };

  for (const e of events) {
    if (e.city || e.object?.city) bump(city, e.city || e.object?.city);
    if (!isCompletedWork(e)) continue;
    const o = e.object;
    if (e.tool === 'problemomer' && e.action === 'result') {
      bump(roomType, o?.roomType ?? o?.label);
      bump(houseType, o?.houseType);
      bump(objectStage, o?.objectStage);
      if (o?.classBefore || o?.classAfter) {
        bump(classTransition, `${o?.classBefore || '?'}→${o?.classAfter || '?'}`);
      }
    }
    if (e.tool === 'calculator' && e.action === 'calc_done') {
      bump(calcMode, o?.mode);
      if (o?.roomType) bump(roomType, o.roomType);
    }
  }

  return {
    roomType: toBreakdown(roomType),
    houseType: toBreakdown(houseType),
    objectStage: toBreakdown(objectStage),
    classTransition: toBreakdown(classTransition),
    calcMode: toBreakdown(calcMode),
    city: toBreakdown(city),
  };
}

function computeSeries(
  events: AnalyticsEvent[],
  from: string | null,
  to: string | null,
): AnalyticsSeriesPoint[] {
  const toDate = to ? new Date(to) : new Date();
  let fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(fromDate.getTime())) {
    fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  if (Number.isNaN(toDate.getTime())) return [];

  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);

  const map = new Map<string, AnalyticsSeriesPoint>();
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const key = dayKey(new Date(t).toISOString());
    if (!key) continue;
    map.set(key, { day: key, problemomer: 0, calculator: 0, pdf: 0, logins: 0 });
  }

  for (const e of events) {
    const key = dayKey(e.at);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { day: key, problemomer: 0, calculator: 0, pdf: 0, logins: 0 });
    }
    const row = map.get(key)!;
    if (e.tool === 'problemomer' && e.action === 'result') row.problemomer += 1;
    if (e.tool === 'calculator' && e.action === 'calc_done') row.calculator += 1;
    if (e.action === 'pdf') row.pdf += 1;
    if (e.action === 'login') row.logins += 1;
  }

  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

function previousWindow(
  from: string | null | undefined,
  to: string | null | undefined,
): { from: string; to: string } | null {
  if (!from || !to) return null;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) return null;
  const len = toMs - fromMs;
  return {
    from: new Date(fromMs - len).toISOString(),
    to: new Date(fromMs).toISOString(),
  };
}

/** Pure aggregator — used by client localStore and API. */
export function aggregateAnalyticsDashboard(
  allEvents: AnalyticsEvent[],
  opts: {
    source: 'api' | 'local';
    from?: string | null;
    to?: string | null;
    orgId?: string | null;
    partnerCount?: number;
    executorCount?: number;
    executorDirectory?: Array<{
      userId: string;
      login: string;
      displayName: string;
      orgId: string | null;
      role?: string;
    }>;
    /** When true, the journal arrays are not clipped to the on-screen page. */
    journalAll?: boolean;
  } & NetworkAdminScope,
): AnalyticsDashboard {
  const events = filterAnalyticsEvents(allEvents, opts);

  const partnerMap = new Map<string, AnalyticsPartnerRow>();
  const executorMap = new Map<string, AnalyticsExecutorRow>();

  for (const dir of opts.executorDirectory || []) {
    if (opts.orgId && dir.orgId !== opts.orgId) continue;
    executorMap.set(dir.userId || dir.login, {
      userId: dir.userId,
      login: dir.login,
      displayName: dir.displayName || dir.login,
      role: dir.role,
      logins: 0,
      problemomer: 0,
      calculator: 0,
      pdf: 0,
      results: 0,
      lastActiveAt: null,
    });
  }

  for (const e of events) {
    const orgKey = e.orgId || e.companyName || e.login;
    if (!partnerMap.has(orgKey)) {
      partnerMap.set(
        orgKey,
        emptyPartnerRow(e.orgId, e.companyName || e.login, e.city || e.object?.city || ''),
      );
    }
    const prow = partnerMap.get(orgKey)!;
    if (!prow.city && (e.city || e.object?.city)) {
      prow.city = e.city || e.object?.city || '';
    }
    if (!prow.lastActiveAt || e.at > prow.lastActiveAt) prow.lastActiveAt = e.at;
    if (e.action === 'login') prow.logins += 1;
    if (e.tool === 'problemomer' && e.action === 'result') {
      prow.problemomer += 1;
      prow.areaM2 += numOr0(e.object?.areaM2);
      prow.panels += numOr0(e.object?.panels);
    }
    if (e.tool === 'calculator' && e.action === 'calc_done') {
      prow.calculator += 1;
      prow.areaM2 += numOr0(e.object?.areaM2);
      prow.panels += numOr0(e.object?.panels);
    }
    if (e.action === 'pdf') prow.pdf += 1;
    if (e.action === 'share') prow.shares += 1;

    const staffLike = isStaffRole(normalizeRole(String(e.role))) || e.role === 'executor';
    if (staffLike || (opts.orgId && e.orgId === opts.orgId && e.role !== 'owner' && e.role !== 'partner')) {
      const exKey = e.userId || e.login;
      if (!executorMap.has(exKey) && staffLike) {
        executorMap.set(exKey, {
          userId: e.userId,
          login: e.login,
          displayName: e.login,
          role: String(e.role),
          logins: 0,
          problemomer: 0,
          calculator: 0,
          pdf: 0,
          results: 0,
          lastActiveAt: null,
        });
      }
      const ex = executorMap.get(exKey);
      if (ex && staffLike) {
        if (!ex.lastActiveAt || e.at > ex.lastActiveAt) ex.lastActiveAt = e.at;
        if (e.action === 'login') ex.logins += 1;
        if (e.tool === 'problemomer' && e.action === 'result') ex.problemomer += 1;
        if (e.tool === 'calculator' && e.action === 'calc_done') ex.calculator += 1;
        if (e.action === 'pdf') ex.pdf += 1;
        if (e.action === 'result' || e.action === 'calc_done') ex.results += 1;
      }
    }
  }

  for (const p of partnerMap.values()) {
    p.areaM2 = Math.round(p.areaM2 * 10) / 10;
    p.panels = Math.round(p.panels);
  }

  const executors = [...executorMap.values()].sort(
    (a, b) => b.problemomer + b.calculator - (a.problemomer + a.calculator),
  );
  const activeExecutors =
    executors.filter((e) => e.logins + e.problemomer + e.calculator + e.pdf > 0).length ||
    executors.length;

  const kpi = computeKpi(events, {
    partnerCount: opts.partnerCount,
    executorCount: opts.executorCount,
    activeExecutors,
  });

  let kpiPrev: AnalyticsKpi | null = null;
  const prev = previousWindow(opts.from, opts.to);
  if (prev) {
    const prevEvents = filterAnalyticsEvents(allEvents, {
      from: prev.from,
      to: prev.to,
      orgId: opts.orgId,
    });
    kpiPrev = computeKpi(prevEvents, {
      partnerCount: opts.partnerCount,
      executorCount: opts.executorCount,
      activeExecutors: 0,
    });
  }

  return {
    source: opts.source,
    from: opts.from || null,
    to: opts.to || null,
    kpi,
    kpiPrev,
    funnel: computeFunnel(events),
    series: computeSeries(events, opts.from || null, opts.to || null),
    breakdowns: computeBreakdowns(events),
    volume: computeVolume(events),
    partners: [...partnerMap.values()].sort(
      (a, b) => b.problemomer + b.calculator - (a.problemomer + a.calculator),
    ),
    executors,
    recentObjects: events
      .filter((e) => e.action === 'result' || e.action === 'calc_done' || e.action === 'pdf')
      .slice(0, opts.journalAll ? 5000 : 40),
    events: events.slice(0, opts.journalAll ? 5000 : 200),
  };
}

export function normalizeOrgSettings(
  partial: Partial<OrgSettings> & { companyName?: string; city?: string },
): OrgSettings {
  const panel =
    partial.panelPriceRub != null && Number(partial.panelPriceRub) > 0
      ? Number(partial.panelPriceRub)
      : OFFICIAL_PANEL_PRICE_RUB;
  const perM2 =
    partial.pricePerM2 != null && Number(partial.pricePerM2) > 0
      ? Number(partial.pricePerM2)
      : OFFICIAL_PRICE_PER_M2;
  return {
    companyName: (partial.companyName || '').trim(),
    city: (partial.city || '').trim(),
    panelPriceRub: panel,
    pricePerM2: perM2,
    installPricePerM2:
      partial.installPricePerM2 == null || Number.isNaN(Number(partial.installPricePerM2))
        ? null
        : Number(partial.installPricePerM2),
    dowelsPerPanel: Math.max(1, Number(partial.dowelsPerPanel) || DEFAULT_DOWELS_PER_PANEL),
    dowelPriceRub:
      partial.dowelPriceRub == null || Number.isNaN(Number(partial.dowelPriceRub))
        ? null
        : Number(partial.dowelPriceRub),
  };
}

export function toPartnerProfile(user: SessionUser): PartnerProfile | null {
  if (!user.org) return null;
  const org = normalizeOrgSettings(user.org);
  return {
    ...user,
    ...org,
    companyName: org.companyName,
  };
}

/** PRD commercial process, quotes, events, academy, support — re-export for callers. */
export type {
  Deal,
  DealOutcome,
  DealStage,
  LossReason,
  ObjectAssignments,
} from './deal.ts';
export {
  EMPTY_ASSIGNMENTS,
  LOSS_REASON_LABELS,
  DEAL_OUTCOME_LABELS,
  derivedAssignedTo,
  jobClosedImpliesDealAccepted,
  resolveDealOutcome,
  applyDealOutcome,
} from './deal.ts';

export type { QuoteLifecycle, QuoteRevision, QuoteUserAction } from './quote.ts';
export {
  copyOrPdfImpliesSent,
  nextQuoteLifecycle,
  applyQuoteAction,
  isSentConfirmed,
} from './quote.ts';

export type {
  PlatformEvent,
  PlatformEventName,
  EventContext,
  DealFunnelCounts,
} from './events.ts';
export {
  assertEventPayloadSafe,
  isEventPayloadSafe,
  countsTowardSalesKpi,
  computeDealFunnel,
  dedupeEventsById,
  diagnosisConfidence,
  INSUFFICIENT_OBSERVATIONS_LABEL,
} from './events.ts';

export type {
  LearningScenario,
  LearningScenarioId,
  LearningAttempt,
  LearningAttemptStatus,
  LearningRubric,
  RubricCriterion,
} from './learning.ts';
export {
  DEFAULT_SALES_RUBRIC,
  openingCountsAsMastery,
  isAttemptCompleted,
  learningAttemptAffectsSalesFunnel,
  scoreWithFalsePromisePenalty,
  progressDelta,
} from './learning.ts';

export type {
  SupportCase,
  SupportCategory,
  SupportCaseStatus,
  Intervention,
} from './support.ts';
export {
  SUPPORT_CATEGORY_LABELS,
  assertSupportPayloadSafe,
  isSupportPayloadSafe,
  createSupportCase,
  linkInterventionToSignal,
  interventionResultFromSamples,
} from './support.ts';
