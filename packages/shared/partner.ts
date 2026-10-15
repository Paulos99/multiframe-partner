/** Shared types — partner portal roles and org settings. */

export type UserRole = 'admin' | 'partner' | 'executor';

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

export type OrgSettings = {
  companyName: string;
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
  id: string;
  login: string;
  role: UserRole;
  displayName: string;
  /** Set for partner and executor. */
  orgId: string | null;
  org: OrgSettings | null;
};

/** @deprecated links replaced by executor login/password accounts */
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
  areaM2?: number | null;
  houseType?: string | null;
  objectStage?: string | null;
  classBefore?: string | null;
  classAfter?: string | null;
  panels?: number | null;
  mode?: string | null;
  label?: string | null;
};

export type AnalyticsEvent = {
  id: string;
  at: string;
  orgId: string | null;
  userId: string | null;
  login: string;
  role: UserRole | string;
  companyName: string;
  tool: AnalyticsTool;
  action: AnalyticsAction;
  object?: AnalyticsObject | null;
};

export type AnalyticsPartnerRow = {
  orgId: string | null;
  companyName: string;
  logins: number;
  problemomer: number;
  calculator: number;
  pdf: number;
  lastActiveAt: string | null;
};

export type AnalyticsExecutorRow = {
  userId: string | null;
  login: string;
  displayName: string;
  logins: number;
  problemomer: number;
  calculator: number;
  pdf: number;
  results: number;
  lastActiveAt: string | null;
};

export type AnalyticsDashboard = {
  source: 'api' | 'local';
  from: string | null;
  to: string | null;
  kpi: {
    partners: number;
    executors: number;
    problemomerResults: number;
    calculatorDone: number;
    pdf: number;
    logins: number;
  };
  partners: AnalyticsPartnerRow[];
  executors: AnalyticsExecutorRow[];
  recentObjects: AnalyticsEvent[];
  events: AnalyticsEvent[];
};

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
    }>;
  },
): AnalyticsDashboard {
  const fromMs = opts.from ? Date.parse(opts.from) : null;
  const toMs = opts.to ? Date.parse(opts.to) : null;
  let events = allEvents.filter((e) => {
    const t = Date.parse(e.at);
    if (Number.isNaN(t)) return false;
    if (fromMs != null && t < fromMs) return false;
    if (toMs != null && t > toMs) return false;
    if (opts.orgId && e.orgId !== opts.orgId) return false;
    return true;
  });
  events = [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const partnerMap = new Map<string, AnalyticsPartnerRow>();
  const executorMap = new Map<string, AnalyticsExecutorRow>();

  for (const dir of opts.executorDirectory || []) {
    if (opts.orgId && dir.orgId !== opts.orgId) continue;
    executorMap.set(dir.userId || dir.login, {
      userId: dir.userId,
      login: dir.login,
      displayName: dir.displayName || dir.login,
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
      partnerMap.set(orgKey, {
        orgId: e.orgId,
        companyName: e.companyName || e.login,
        logins: 0,
        problemomer: 0,
        calculator: 0,
        pdf: 0,
        lastActiveAt: null,
      });
    }
    const prow = partnerMap.get(orgKey)!;
    if (!prow.lastActiveAt || e.at > prow.lastActiveAt) prow.lastActiveAt = e.at;
    if (e.action === 'login') prow.logins += 1;
    if (e.tool === 'problemomer' && (e.action === 'open' || e.action === 'result')) {
      prow.problemomer += 1;
    }
    if (e.tool === 'calculator' && (e.action === 'open' || e.action === 'calc_done')) {
      prow.calculator += 1;
    }
    if (e.action === 'pdf') prow.pdf += 1;

    if (e.role === 'executor' || (opts.orgId && e.orgId === opts.orgId)) {
      const exKey = e.userId || e.login;
      if (!executorMap.has(exKey) && e.role === 'executor') {
        executorMap.set(exKey, {
          userId: e.userId,
          login: e.login,
          displayName: e.login,
          logins: 0,
          problemomer: 0,
          calculator: 0,
          pdf: 0,
          results: 0,
          lastActiveAt: null,
        });
      }
      const ex = executorMap.get(exKey);
      if (ex && (e.role === 'executor' || executorMap.has(exKey))) {
        if (e.role === 'executor') {
          if (!ex.lastActiveAt || e.at > ex.lastActiveAt) ex.lastActiveAt = e.at;
          if (e.action === 'login') ex.logins += 1;
          if (e.tool === 'problemomer' && (e.action === 'open' || e.action === 'result')) {
            ex.problemomer += 1;
          }
          if (e.tool === 'calculator' && (e.action === 'open' || e.action === 'calc_done')) {
            ex.calculator += 1;
          }
          if (e.action === 'pdf') ex.pdf += 1;
          if (e.action === 'result' || e.action === 'calc_done') ex.results += 1;
        }
      }
    }
  }

  // Count only executor rows that are executors
  const executors = [...executorMap.values()].sort(
    (a, b) => (b.problemomer + b.calculator) - (a.problemomer + a.calculator),
  );

  return {
    source: opts.source,
    from: opts.from || null,
    to: opts.to || null,
    kpi: {
      partners: opts.partnerCount ?? partnerMap.size,
      executors:
        opts.executorCount ??
        (executors.filter((e) => e.logins + e.problemomer + e.calculator > 0).length ||
          executors.length),
      problemomerResults: events.filter((e) => e.tool === 'problemomer' && e.action === 'result')
        .length,
      calculatorDone: events.filter((e) => e.tool === 'calculator' && e.action === 'calc_done')
        .length,
      pdf: events.filter((e) => e.action === 'pdf').length,
      logins: events.filter((e) => e.action === 'login').length,
    },
    partners: [...partnerMap.values()].sort(
      (a, b) => (b.problemomer + b.calculator) - (a.problemomer + a.calculator),
    ),
    executors,
    recentObjects: events
      .filter((e) => e.action === 'result' || e.action === 'calc_done' || e.action === 'pdf')
      .slice(0, 40),
    events: events.slice(0, 200),
  };
}

export function normalizeOrgSettings(
  partial: Partial<OrgSettings> & { companyName?: string },
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
