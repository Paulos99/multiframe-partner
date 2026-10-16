import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  ActivityEvent,
  JobObject,
  OrgSettings,
  PartnerProfile,
  SessionUser,
  UserRole,
} from '../../../../packages/shared/partner';
import {
  canSeePrices,
  DEFAULT_DOWEL_PRICE_RUB,
  DEFAULT_INSTALL_PRICE_PER_M2,
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  toPartnerProfile,
} from '../../../../packages/shared/partner';
import {
  apiAdminCreatePartner,
  apiAdminDeletePartner,
  apiAdminListPartners,
  apiAdminResetPassword,
  apiCreateObject,
  apiCreateStaff,
  apiDeleteStaff,
  apiListObjects,
  apiListStaff,
  apiLogin,
  apiLogout,
  apiMe,
  apiPatchObject,
  apiResetStaffPassword,
  apiSaveOrg,
  hasRemoteApi,
} from './apiClient';
import {
  bootstrapHistoryReset,
  flushAnalyticsQueue,
  resetServerAnalyticsOnce,
  trackPartnerAnalytics,
} from './analytics';
import {
  cacheObjects,
  clearObjectQueue,
  createPartnerAccount,
  createStaffAccount,
  deletePartnerAccount,
  deleteStaffAccount,
  generatePassword,
  listActivity,
  listLocalObjects,
  listPartners,
  listStaffForOrg,
  loadCachedObjects,
  loadSession,
  loadToken,
  localLogin,
  localLogout,
  peekObjectQueue,
  removeFromObjectQueue,
  resetPartnerPassword,
  resetStaffPassword,
  saveSession,
  saveToken,
  trackToolOpen,
  updateOrgSettings,
  upsertLocalObject,
  type StoredOrg,
  type StoredUser,
} from './localStore';

export type StaffMember = {
  id: string;
  login: string;
  role: UserRole;
  displayName: string;
  orgId: string | null;
  createdAt?: string;
  /** Local-only plaintext password for owner reveal. */
  password?: string;
};

type PartnerApi = {
  user: SessionUser | null;
  partner: PartnerProfile | null;
  loading: boolean;
  error: string | null;
  remote: boolean;
  objects: JobObject[];
  objectsLoading: boolean;
  pendingSyncCount: number;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  saveOrg: (patch: Partial<OrgSettings>) => Promise<void>;
  adminCreatePartner: (input: {
    login: string;
    password: string;
    companyName: string;
    city?: string;
  }) => Promise<{ login: string; password: string }>;
  adminResetPassword: (partnerUserId: string, password: string) => Promise<string>;
  adminDeletePartner: (partnerUserId: string) => Promise<void>;
  adminListPartners: () => Array<{
    user: StoredUser | StaffMember;
    org: StoredOrg | { id: string; settings: OrgSettings } | undefined;
    lastLogin: string | null;
    executorCount: number;
  }>;
  adminActivity: () => ActivityEvent[];
  partnerCreateStaff: (input: {
    login: string;
    password: string;
    displayName: string;
    role: UserRole;
  }) => Promise<{ id: string; login: string; password: string; role: UserRole }>;
  partnerResetStaffPassword: (staffUserId: string, password: string) => Promise<string>;
  partnerDeleteStaff: (staffUserId: string) => Promise<void>;
  partnerListStaff: () => StaffMember[];
  /** @deprecated */
  partnerCreateExecutor: (input: {
    login: string;
    password: string;
    displayName: string;
  }) => Promise<{ id: string; login: string; password: string }>;
  /** @deprecated */
  partnerResetExecutorPassword: (executorUserId: string, password: string) => Promise<string>;
  /** @deprecated */
  partnerDeleteExecutor: (executorUserId: string) => Promise<void>;
  /** @deprecated */
  partnerListExecutors: () => StaffMember[];
  refreshObjects: () => Promise<void>;
  saveObject: (input: Partial<JobObject> & { id?: string }) => Promise<JobObject>;
  flushObjectQueue: () => Promise<void>;
  noteTool: (tool: 'problemomer' | 'calculator') => void;
  refresh: () => void;
  apiBase: string;
};

const Ctx = createContext<PartnerApi | null>(null);

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [objects, setObjects] = useState<JobObject[]>([]);
  const [objectsLoading, setObjectsLoading] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [staffCache, setStaffCache] = useState<StaffMember[]>([]);
  const [partnersCache, setPartnersCache] = useState<
    Array<{
      user: StoredUser | StaffMember;
      org: StoredOrg | { id: string; settings: OrgSettings } | undefined;
      lastLogin: string | null;
      executorCount: number;
    }>
  >([]);
  const remote = hasRemoteApi();

  const bumpPending = useCallback(() => {
    setPendingSyncCount(peekObjectQueue().length);
  }, []);

  const refreshObjects = useCallback(async () => {
    const session = loadSession();
    if (!session) {
      setObjects([]);
      return;
    }
    setObjectsLoading(true);
    try {
      if (remote && loadToken()) {
        const list = await apiListObjects();
        setObjects(list);
        cacheObjects(list);
      } else {
        const list = listLocalObjects(session);
        setObjects(list);
        cacheObjects(list);
      }
    } catch {
      setObjects(loadCachedObjects());
    } finally {
      setObjectsLoading(false);
      bumpPending();
    }
  }, [remote, bumpPending]);

  const flushObjectQueue = useCallback(async () => {
    if (!remote || !loadToken()) return;
    const queue = peekObjectQueue();
    if (!queue.length) {
      bumpPending();
      return;
    }
    for (const obj of queue) {
      try {
        try {
          await apiPatchObject(obj.id, obj);
        } catch {
          await apiCreateObject(obj);
        }
        removeFromObjectQueue(obj.id);
      } catch {
        break;
      }
    }
    if (!peekObjectQueue().length) clearObjectQueue();
    bumpPending();
    await refreshObjects();
  }, [remote, bumpPending, refreshObjects]);

  const refresh = useCallback(() => {
    setUser(loadSession());
    setTick((n) => n + 1);
    setLoading(false);
  }, []);

  useEffect(() => {
    bootstrapHistoryReset();
    let cancelled = false;
    (async () => {
      const session = loadSession();
      if (remote && loadToken()) {
        try {
          const me = await apiMe();
          if (cancelled) return;
          saveSession(me);
          setUser(me);
        } catch {
          if (cancelled) return;
          saveToken(null);
          setUser(session);
        }
      } else {
        setUser(session);
      }
      setLoading(false);
      void flushAnalyticsQueue();
      void flushObjectQueue();
      if (session?.role === 'admin' || loadSession()?.role === 'admin') {
        void resetServerAnalyticsOnce();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [remote, flushObjectQueue]);

  useEffect(() => {
    if (user) void refreshObjects();
  }, [user?.id, refreshObjects]);

  useEffect(() => {
    const onOnline = () => {
      void flushAnalyticsQueue();
      void flushObjectQueue();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushObjectQueue]);

  useEffect(() => {
    const company = user?.org?.companyName || '';
    (window as Window & { __MF_PARTNER_COMPANY__?: string }).__MF_PARTNER_COMPANY__ = company;
    (window as Window & { __MF_PARTNER_ORG__?: OrgSettings | null }).__MF_PARTNER_ORG__ =
      user?.org || null;
    (window as Window & { __MF_HIDE_PRICES__?: boolean }).__MF_HIDE_PRICES__ = user
      ? !canSeePrices(user.role)
      : false;
    if (user?.org && canSeePrices(user.role)) {
      persistPartnerCalcParams(partnerCalcParamsFromOrg(user.org));
    }
  }, [user]);

  const login = useCallback(
    async (loginName: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        let session: SessionUser;
        if (remote) {
          try {
            const res = await apiLogin(loginName, password);
            session = res.user;
            saveSession(session);
          } catch {
            session = localLogin(loginName, password);
          }
        } else {
          session = localLogin(loginName, password);
        }
        setUser(session);
        if (session.role === 'admin') void resetServerAnalyticsOnce();
        trackPartnerAnalytics({ tool: 'cabinet', action: 'login' });
        void flushAnalyticsQueue();
        void flushObjectQueue();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка входа');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [remote, flushObjectQueue],
  );

  const logout = useCallback(() => {
    if (remote) void apiLogout();
    localLogout(user);
    setUser(null);
    setObjects([]);
    setStaffCache([]);
  }, [user, remote]);

  const saveOrg = useCallback(
    async (patch: Partial<OrgSettings>) => {
      if (!user?.orgId) throw new Error('Нет организации');
      let settings: OrgSettings;
      if (remote && loadToken()) {
        settings = await apiSaveOrg(patch);
      } else {
        settings = updateOrgSettings(user.orgId, patch, user);
      }
      const next = { ...user, org: settings, displayName: settings.companyName || user.displayName };
      persistPartnerCalcParams(partnerCalcParamsFromOrg(settings));
      saveSession(next);
      setUser(next);
    },
    [user, remote],
  );

  const adminCreatePartner = useCallback(
    async (input: { login: string; password: string; companyName: string; city?: string }) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const res = await apiAdminCreatePartner(input);
        setTick((n) => n + 1);
        return { login: res.login, password: res.password };
      }
      const res = createPartnerAccount({ ...input, admin: user });
      setTick((n) => n + 1);
      return { login: res.user.login, password: res.password };
    },
    [user, remote],
  );

  const adminResetPassword = useCallback(
    async (partnerUserId: string, password: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const pw = await apiAdminResetPassword(partnerUserId, password);
        setTick((n) => n + 1);
        return pw;
      }
      const pw = resetPartnerPassword(partnerUserId, password, user);
      setTick((n) => n + 1);
      return pw;
    },
    [user, remote],
  );

  const adminDeletePartner = useCallback(
    async (partnerUserId: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        await apiAdminDeletePartner(partnerUserId);
      } else {
        deletePartnerAccount(partnerUserId, user);
      }
      setTick((n) => n + 1);
    },
    [user, remote],
  );

  const partnerCreateStaff = useCallback(
    async (input: {
      login: string;
      password: string;
      displayName: string;
      role: UserRole;
    }) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const res = await apiCreateStaff(input);
        setTick((n) => n + 1);
        const list = await apiListStaff();
        setStaffCache(list);
        return res;
      }
      const res = createStaffAccount({ ...input, owner: user });
      setTick((n) => n + 1);
      return {
        id: res.user.id,
        login: res.user.login,
        password: res.password,
        role: res.user.role,
      };
    },
    [user, remote],
  );

  const partnerResetStaffPassword = useCallback(
    async (staffUserId: string, password: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const pw = await apiResetStaffPassword(staffUserId, password);
        setTick((n) => n + 1);
        return pw;
      }
      const pw = resetStaffPassword(staffUserId, password, user);
      setTick((n) => n + 1);
      return pw;
    },
    [user, remote],
  );

  const partnerDeleteStaff = useCallback(
    async (staffUserId: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        await apiDeleteStaff(staffUserId);
        setStaffCache(await apiListStaff());
      } else {
        deleteStaffAccount(staffUserId, user);
      }
      setTick((n) => n + 1);
    },
    [user, remote],
  );

  useEffect(() => {
    if (!user) return;
    if (user.role === 'owner' || user.role === 'sales') {
      if (remote && loadToken()) {
        void apiListStaff()
          .then(setStaffCache)
          .catch(() => setStaffCache(listStaffForOrg(user.orgId || '')));
      } else if (user.orgId) {
        setStaffCache(listStaffForOrg(user.orgId));
      }
    }
    if (user.role === 'admin') {
      if (remote && loadToken()) {
        void apiAdminListPartners()
          .then((list) =>
            setPartnersCache(
              list.map((p) => ({
                user: p.user,
                org: p.org,
                lastLogin: p.lastLogin,
                executorCount: p.staffCount ?? p.executorCount,
              })),
            ),
          )
          .catch(() => setPartnersCache(listPartners()));
      } else {
        setPartnersCache(listPartners());
      }
    }
  }, [user, remote, tick]);

  const saveObject = useCallback(
    async (input: Partial<JobObject> & { id?: string }) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken() && navigator.onLine) {
        try {
          const obj = input.id
            ? await apiPatchObject(input.id, input)
            : await apiCreateObject(input);
          await refreshObjects();
          return obj;
        } catch {
          /* fall through offline */
        }
      }
      const obj = upsertLocalObject(input, user);
      bumpPending();
      await refreshObjects();
      return obj;
    },
    [user, remote, refreshObjects, bumpPending],
  );

  const noteTool = useCallback(
    (tool: 'problemomer' | 'calculator') => {
      if (user) {
        trackToolOpen(user, tool);
        trackPartnerAnalytics({ tool, action: 'open' });
      }
      setTick((n) => n + 1);
    },
    [user],
  );

  const partner = useMemo(() => (user ? toPartnerProfile(user) : null), [user]);

  const value = useMemo<PartnerApi>(
    () => ({
      user,
      partner,
      loading,
      error,
      remote,
      objects,
      objectsLoading,
      pendingSyncCount,
      login,
      logout,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      adminDeletePartner,
      adminListPartners: () => (remote && partnersCache.length ? partnersCache : listPartners()),
      adminActivity: () => listActivity(),
      partnerCreateStaff,
      partnerResetStaffPassword,
      partnerDeleteStaff,
      partnerListStaff: () =>
        staffCache.length
          ? staffCache
          : user?.orgId
            ? listStaffForOrg(user.orgId)
            : [],
      partnerCreateExecutor: async (input) => {
        const res = await partnerCreateStaff({ ...input, role: 'measurer' });
        return { id: res.id, login: res.login, password: res.password };
      },
      partnerResetExecutorPassword: partnerResetStaffPassword,
      partnerDeleteExecutor: partnerDeleteStaff,
      partnerListExecutors: () =>
        staffCache.length
          ? staffCache
          : user?.orgId
            ? listStaffForOrg(user.orgId)
            : [],
      refreshObjects,
      saveObject,
      flushObjectQueue,
      noteTool,
      refresh,
      apiBase: remote ? (import.meta.env.VITE_API_URL as string) || '' : '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      user,
      partner,
      loading,
      error,
      remote,
      objects,
      objectsLoading,
      pendingSyncCount,
      login,
      logout,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      adminDeletePartner,
      partnerCreateStaff,
      partnerResetStaffPassword,
      partnerDeleteStaff,
      refreshObjects,
      saveObject,
      flushObjectQueue,
      noteTool,
      refresh,
      tick,
      staffCache,
      partnersCache,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePartner(): PartnerApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePartner outside Provider');
  return ctx;
}

const PARTNER_CALC_STORE = 'mf_partner_calc_params_v1';

export type PartnerCalcParams = {
  panelPrice: number;
  pricePerM2: number;
  installPerM2: number | null;
  dowelsPerPanel: number;
  dowelPrice: number | null;
  company: string;
  hidePrices?: boolean;
};

export function partnerCalcParamsFromOrg(
  org: OrgSettings | null | undefined,
  companyName?: string,
): PartnerCalcParams {
  return {
    panelPrice:
      org?.panelPriceRub != null && org.panelPriceRub > 0
        ? org.panelPriceRub
        : OFFICIAL_PANEL_PRICE_RUB,
    pricePerM2:
      org?.pricePerM2 != null && org.pricePerM2 > 0 ? org.pricePerM2 : OFFICIAL_PRICE_PER_M2,
    installPerM2:
      org?.installPricePerM2 != null && org.installPricePerM2 >= 0
        ? org.installPricePerM2
        : DEFAULT_INSTALL_PRICE_PER_M2,
    dowelsPerPanel: org?.dowelsPerPanel || 2,
    dowelPrice:
      org?.dowelPriceRub != null && org.dowelPriceRub >= 0
        ? org.dowelPriceRub
        : DEFAULT_DOWEL_PRICE_RUB,
    company: companyName || org?.companyName || '',
  };
}

/** Persist pricing so calculator works offline / without query string. */
export function persistPartnerCalcParams(params: PartnerCalcParams): void {
  try {
    localStorage.setItem(PARTNER_CALC_STORE, JSON.stringify(params));
  } catch {
    /* ignore quota */
  }
}

export function calcUrlFromOrg(
  org: OrgSettings | null | undefined,
  companyName?: string,
  opts?: { hidePrices?: boolean },
): string {
  const params = partnerCalcParamsFromOrg(org, companyName);
  if (opts?.hidePrices) {
    params.hidePrices = true;
    params.panelPrice = 0;
    params.pricePerM2 = 0;
    params.installPerM2 = null;
    params.dowelPrice = null;
  } else {
    persistPartnerCalcParams(params);
  }
  const q = new URLSearchParams();
  if (!opts?.hidePrices) {
    q.set('panelPrice', String(params.panelPrice));
    q.set('pricePerM2', String(params.pricePerM2));
    q.set('installPerM2', String(params.installPerM2 ?? DEFAULT_INSTALL_PRICE_PER_M2));
    q.set('dowelPrice', String(params.dowelPrice ?? DEFAULT_DOWEL_PRICE_RUB));
  } else {
    q.set('hidePrices', '1');
  }
  q.set('dowelsPerPanel', String(params.dowelsPerPanel));
  if (params.company) q.set('company', params.company);
  q.set('partner', '1');
  const path = `${import.meta.env.BASE_URL || '/'}calculator/index.html`.replace(/\/{2,}/g, '/');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${path}?${q.toString()}`;
}

export { generatePassword };
