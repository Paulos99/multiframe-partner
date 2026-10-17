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
import { loadCities, resolveCity } from './cityCatalog';
import {
  canCreateObjects,
  canSeePrices,
  DEFAULT_DOWEL_PRICE_RUB,
  DEFAULT_INSTALL_PRICE_PER_M2,
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  toPartnerProfile,
  type JobObjectDocument,
} from '../../../../packages/shared/partner';
import {
  apiAdminCreatePartner,
  apiAdminDeletePartner,
  apiAdminListPartners,
  apiAdminResetPassword,
  apiAdminUpdatePartnerCity,
  apiBase,
  apiCreateStaff,
  apiDeleteStaff,
  apiListStaff,
  apiLogin,
  apiLogout,
  apiMe,
  apiResetStaffPassword,
  apiSaveOrg,
  apiUploadObjectDocuments,
  hasRemoteApi,
  isApiError,
  stripObjectDocuments,
} from './apiClient';
import {
  calcMessageHasScheme,
  objectPatchFromCalc,
  readablePdfName,
  type CabinetCalcMessage,
} from './cabinetCalc';
import { withDemoDocuments } from './demoDocuments';
import {
  bootstrapHistoryReset,
  flushAnalyticsQueue,
  trackPartnerAnalytics,
} from './analytics';
import {
  cacheObjects,
  clearObjectQueue,
  createPartnerAccount,
  createStaffAccount,
  deletePartnerAccount,
  deleteStaffAccount,
  enqueueObjectDocuments,
  generatePassword,
  listActivity,
  listPartners,
  listStaffForOrg,
  loadCachedObjects,
  loadSession,
  loadToken,
  localLogin,
  localLogout,
  peekObjectDocumentQueue,
  peekObjectQueue,
  resetPartnerPassword,
  resetStaffPassword,
  updatePartnerCity,
  saveSession,
  saveToken,
  trackToolOpen,
  updateOrgSettings,
  type StoredOrg,
  type StoredUser,
} from './localStore';
import { enqueueOutbox, loadCalculationsFor, putObject, rememberSession, type CachedCalculation } from './offlineDb';
import {
  countMyOutbox,
  deleteObjectSynced,
  flushDocumentQueue,
  flushOutbox,
  loadVisibleObjects,
  rememberObjectDocuments,
  saveObjectSynced,
} from './syncEngine';

export type StaffMember = {
  id: string;
  login: string;
  role: UserRole;
  displayName: string;
  orgId: string | null;
  createdAt?: string;
};

export type SyncStatus = 'offline' | 'pending' | 'synced';

function asStaff(member: StaffMember | StoredUser): StaffMember {
  return {
    id: member.id,
    login: member.login,
    role: member.role,
    displayName: member.displayName,
    orgId: member.orgId,
    createdAt: member.createdAt,
  };
}

type PartnerApi = {
  user: SessionUser | null;
  partner: PartnerProfile | null;
  loading: boolean;
  error: string | null;
  remote: boolean;
  objects: JobObject[];
  objectsLoading: boolean;
  pendingSyncCount: number;
  online: boolean;
  syncStatus: SyncStatus;
  calculations: CachedCalculation[];
  /** JWT expired while the outbox still has rows. Queue is kept until the next login. */
  authHold: boolean;
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
  adminUpdatePartnerCity: (partnerUserId: string, city: string) => Promise<string>;
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
  deleteObject: (id: string) => Promise<void>;
  flushObjectQueue: () => Promise<void>;
  /** Открыть калькулятор. objectId — обновить эту карточку, null — новый объект на первом расчёте. */
  requestCalculator: (objectId: string | null) => void;
  calcRequest: { objectId: string | null; nonce: number } | null;
  attachCalculation: (message: CabinetCalcMessage, objectId: string | null) => Promise<JobObject | null>;
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
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [calculations, setCalculations] = useState<CachedCalculation[]>([]);
  const [authHold, setAuthHold] = useState(false);
  const [staffCache, setStaffCache] = useState<StaffMember[]>([]);
  const [calcRequest, setCalcRequest] = useState<{ objectId: string | null; nonce: number } | null>(
    null,
  );
  const [partnersCache, setPartnersCache] = useState<
    Array<{
      user: StoredUser | StaffMember;
      org: StoredOrg | { id: string; settings: OrgSettings } | undefined;
      lastLogin: string | null;
      executorCount: number;
    }>
  >([]);
  const remote = hasRemoteApi();

  const refreshObjects = useCallback(async () => {
    const session = loadSession();
    if (!session) {
      setObjects([]);
      setPendingSyncCount(0);
      return;
    }
    setObjectsLoading(true);
    try {
      const list = withDemoDocuments(await loadVisibleObjects(session, remote), session.role);
      setObjects(list);
      cacheObjects(list);
    } catch {
      setObjects(loadCachedObjects());
    } finally {
      setObjectsLoading(false);
      const queuedDocs = peekObjectDocumentQueue().length;
      setPendingSyncCount(
        (await countMyOutbox(session.id).catch(() => peekObjectQueue().length)) + queuedDocs,
      );
    }
  }, [remote]);

  const flushObjectQueue = useCallback(async () => {
    const session = loadSession();
    if (!session) return;
    const result = await flushOutbox(session, remote);
    if (result === 'auth') setAuthHold(true);
    if (result === 'ok' || result === 'idle') {
      setAuthHold(false);
      await flushDocumentQueue();
    }
    await refreshObjects();
  }, [remote, refreshObjects]);

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
      try {
        const legacy = peekObjectQueue();
        if (legacy.length && session) {
          for (const obj of legacy) {
            await enqueueOutbox({
              id: obj.id,
              op: 'upsert',
              updatedAt: obj.updatedAt || new Date().toISOString(),
              userId: obj.createdBy || session.id,
              orgId: obj.orgId,
              payload: obj,
            });
            await putObject(obj);
          }
          clearObjectQueue();
        }
      } catch {
        /* keep the legacy queue if IndexedDB is blocked */
      }
      if (remote && loadToken()) {
        try {
          const me = await apiMe();
          if (cancelled) return;
          saveSession(me);
          setUser(me);
          await rememberSession({ token: loadToken(), apiBase: apiBase(), userId: me.id });
        } catch (err) {
          if (cancelled) return;
          if (isApiError(err) && err.status === 401) {
            saveToken(null);
            setAuthHold(true);
            await rememberSession({ token: null, apiBase: apiBase(), userId: session?.id || null });
          } else if (session) {
            await rememberSession({ token: loadToken(), apiBase: apiBase(), userId: session.id });
          }
          setUser(session);
        }
      } else {
        setUser(session);
        if (session) {
          await rememberSession({ token: loadToken(), apiBase: apiBase(), userId: session.id });
        }
      }
      setLoading(false);
      void flushAnalyticsQueue();
      void flushObjectQueue();
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
      setOnline(true);
      void flushAnalyticsQueue();
      void flushObjectQueue();
    };
    const onOffline = () => {
      setOnline(false);
      void refreshObjects();
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'mf-flush') {
        void flushAnalyticsQueue();
        void flushObjectQueue();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      navigator.serviceWorker?.removeEventListener('message', onMsg);
    };
  }, [flushObjectQueue, refreshObjects]);

  useEffect(() => {
    if (!user) {
      setCalculations([]);
      return;
    }
    let cancelled = false;
    const reload = () => {
      void loadCalculationsFor(user)
        .then((rows) => {
          if (!cancelled) setCalculations(rows);
        })
        .catch(() => undefined);
    };
    reload();
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [user, tick, online]);

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
        setAuthHold(false);
        await rememberSession({ token: loadToken(), apiBase: apiBase(), userId: session.id });
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
    void rememberSession({ token: null, apiBase: apiBase(), userId: null });
    setUser(null);
    setObjects([]);
    setStaffCache([]);
    setCalculations([]);
  }, [user, remote]);

  const saveOrg = useCallback(
    async (patch: Partial<OrgSettings>) => {
      if (!user?.orgId) throw new Error('Нет организации');
      let nextPatch = patch;
      if (patch.city !== undefined) {
        await loadCities();
        const resolved = resolveCity(patch.city, user.org?.city ?? '');
        if (!resolved.ok) throw new Error(resolved.message);
        nextPatch = { ...patch, city: resolved.city };
      }
      let settings: OrgSettings;
      if (remote && loadToken()) {
        settings = await apiSaveOrg(nextPatch);
      } else {
        settings = updateOrgSettings(user.orgId, nextPatch, user);
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
      await loadCities();
      const resolved = resolveCity(input.city ?? '', null);
      if (!resolved.ok) throw new Error(resolved.message);
      const payload = { ...input, city: resolved.city };
      if (remote && loadToken()) {
        const res = await apiAdminCreatePartner(payload);
        setTick((n) => n + 1);
        return { login: res.login, password: res.password };
      }
      const res = createPartnerAccount({ ...payload, admin: user });
      setTick((n) => n + 1);
      return { login: res.user.login, password: res.password };
    },
    [user, remote],
  );

  const adminUpdatePartnerCity = useCallback(
    async (partnerUserId: string, city: string) => {
      if (!user) throw new Error('Нет сессии');
      await loadCities();
      const resolved = resolveCity(city, null);
      if (!resolved.ok) throw new Error(resolved.message);
      if (remote && loadToken()) {
        const saved = await apiAdminUpdatePartnerCity(partnerUserId, resolved.city);
        setTick((n) => n + 1);
        return saved;
      }
      const saved = updatePartnerCity(partnerUserId, resolved.city, user);
      setTick((n) => n + 1);
      return saved;
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
      const obj = await saveObjectSynced(user, remote, stripObjectDocuments(input));
      await refreshObjects();
      return obj;
    },
    [user, remote, refreshObjects],
  );

  const deleteObject = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Нет сессии');
      await deleteObjectSynced(user, remote, id);
      await refreshObjects();
    },
    [user, remote, refreshObjects],
  );

  const requestCalculator = useCallback((objectId: string | null) => {
    setCalcRequest({ objectId, nonce: Date.now() });
  }, []);

  const attachCalculation = useCallback(
    async (message: CabinetCalcMessage, objectId: string | null) => {
      if (!user || !canCreateObjects(user.role)) return null;
      if (!calcMessageHasScheme(message)) return null;
      const existing = objectId ? objects.find((o) => o.id === objectId) : undefined;
      const patch = objectPatchFromCalc(message, existing, user.org, objectId);
      const saved = await saveObject(patch);
      const versionId = `ver_${Date.now().toString(36)}`;
      const namedAt = new Date().toISOString();
      const files = [
        {
          kind: 'estimate' as const,
          filename: readablePdfName(saved.clientName, 'estimate', namedAt),
          pdfBase64: message.pdfBase64 || '',
          hasScheme: true,
          panels: saved.estimate?.panels ?? null,
          areaM2: saved.room?.areaM2 ?? null,
        },
        {
          kind: 'spec' as const,
          filename: readablePdfName(saved.clientName, 'spec', namedAt),
          pdfBase64: message.specPdfBase64 || '',
          hasScheme: true,
          panels: saved.estimate?.panels ?? null,
          areaM2: saved.room?.areaM2 ?? null,
        },
      ].filter((d) => d.pdfBase64.length > 32);
      if (!files.length) return saved;
      if (remote && loadToken() && navigator.onLine) {
        try {
          const updated = await apiUploadObjectDocuments(saved.id, files, versionId);
          await refreshObjects();
          return updated;
        } catch {
          /* очередь, если облако не приняло файл */
        }
      }
      const now = new Date().toISOString();
      const localDocs: JobObjectDocument[] = files.map((d) => ({
        id: `doc_${Math.random().toString(36).slice(2, 10)}`,
        versionId,
        createdAt: now,
        createdBy: user.id,
        kind: d.kind,
        filename: d.filename,
        hasScheme: d.hasScheme,
        panels: d.panels,
        areaM2: d.areaM2,
        dataBase64: d.pdfBase64,
      }));
      enqueueObjectDocuments(
        saved.id,
        files.map((d) => ({
          objectId: saved.id,
          versionId,
          kind: d.kind,
          filename: d.filename,
          pdfBase64: d.pdfBase64,
          hasScheme: d.hasScheme,
          panels: d.panels,
          areaM2: d.areaM2,
        })),
      );
      const withDocs = await rememberObjectDocuments(saved, localDocs, user);
      await refreshObjects();
      return withDocs;
    },
    [user, objects, remote, saveObject, refreshObjects],
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
      online,
      syncStatus: (!online ? 'offline' : pendingSyncCount > 0 ? 'pending' : 'synced') as SyncStatus,
      calculations,
      authHold,
      login,
      logout,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      adminDeletePartner,
      adminUpdatePartnerCity,
      adminListPartners: () => (remote && partnersCache.length ? partnersCache : listPartners()),
      adminActivity: () => listActivity(),
      partnerCreateStaff,
      partnerResetStaffPassword,
      partnerDeleteStaff,
      partnerListStaff: () =>
        (staffCache.length
          ? staffCache
          : user?.orgId
            ? listStaffForOrg(user.orgId)
            : []
        ).map(asStaff),
      partnerCreateExecutor: async (input) => {
        const res = await partnerCreateStaff({ ...input, role: 'measurer' });
        return { id: res.id, login: res.login, password: res.password };
      },
      partnerResetExecutorPassword: partnerResetStaffPassword,
      partnerDeleteExecutor: partnerDeleteStaff,
      partnerListExecutors: () =>
        (staffCache.length
          ? staffCache
          : user?.orgId
            ? listStaffForOrg(user.orgId)
            : []
        ).map(asStaff),
      refreshObjects,
      saveObject,
      deleteObject,
      flushObjectQueue,
      requestCalculator,
      calcRequest,
      attachCalculation,
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
      online,
      calculations,
      authHold,
      login,
      logout,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      adminDeletePartner,
      adminUpdatePartnerCity,
      partnerCreateStaff,
      partnerResetStaffPassword,
      partnerDeleteStaff,
      refreshObjects,
      saveObject,
      deleteObject,
      flushObjectQueue,
      requestCalculator,
      calcRequest,
      attachCalculation,
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
  opts?: { hidePrices?: boolean; objectId?: string | null; clientName?: string | null },
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
  if (opts?.objectId) q.set('objectId', opts.objectId);
  if (opts?.clientName) q.set('client', opts.clientName);
  q.set('partner', '1');
  const path = `${import.meta.env.BASE_URL || '/'}calculator/index.html`.replace(/\/{2,}/g, '/');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${path}?${q.toString()}`;
}

export { generatePassword };
