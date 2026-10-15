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
  OrgSettings,
  PartnerProfile,
  SessionUser,
} from '../../../../packages/shared/partner';
import {
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  toPartnerProfile,
} from '../../../../packages/shared/partner';
import {
  createExecutorAccount,
  createPartnerAccount,
  listActivity,
  listExecutorsForOrg,
  listPartners,
  loadSession,
  localLogin,
  localLogout,
  resetExecutorPassword,
  resetPartnerPassword,
  trackToolOpen,
  updateOrgSettings,
  type StoredOrg,
  type StoredUser,
} from './localStore';

type PartnerApi = {
  user: SessionUser | null;
  /** Convenience for tools that expect PartnerProfile. */
  partner: PartnerProfile | null;
  loading: boolean;
  error: string | null;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  saveOrg: (patch: Partial<OrgSettings>) => Promise<void>;
  adminCreatePartner: (input: {
    login: string;
    password: string;
    companyName: string;
  }) => Promise<{ login: string; password: string }>;
  adminResetPassword: (partnerUserId: string, password: string) => Promise<string>;
  adminListPartners: () => Array<{
    user: StoredUser;
    org: StoredOrg | undefined;
    lastLogin: string | null;
    executorCount: number;
  }>;
  adminActivity: () => ActivityEvent[];
  partnerCreateExecutor: (input: {
    login: string;
    password: string;
    displayName: string;
  }) => Promise<{ login: string; password: string }>;
  partnerResetExecutorPassword: (executorUserId: string, password: string) => Promise<string>;
  partnerListExecutors: () => StoredUser[];
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

  const refresh = useCallback(() => {
    setUser(loadSession());
    setTick((n) => n + 1);
    setLoading(false);
  }, []);

  useEffect(() => {
    setUser(loadSession());
    setLoading(false);
  }, []);

  useEffect(() => {
    const company = user?.org?.companyName || '';
    (window as Window & { __MF_PARTNER_COMPANY__?: string }).__MF_PARTNER_COMPANY__ = company;
    (window as Window & { __MF_PARTNER_ORG__?: OrgSettings | null }).__MF_PARTNER_ORG__ =
      user?.org || null;
    if (user?.org) {
      persistPartnerCalcParams(partnerCalcParamsFromOrg(user.org));
    }
  }, [user]);

  const login = useCallback(async (loginName: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const session = localLogin(loginName, password);
      setUser(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка входа');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localLogout(user);
    setUser(null);
  }, [user]);

  const saveOrg = useCallback(
    async (patch: Partial<OrgSettings>) => {
      if (!user?.orgId) throw new Error('Нет организации');
      const settings = updateOrgSettings(user.orgId, patch, user);
      const next = { ...user, org: settings, displayName: settings.companyName || user.displayName };
      persistPartnerCalcParams(partnerCalcParamsFromOrg(settings));
      setUser(next);
    },
    [user],
  );

  const adminCreatePartner = useCallback(
    async (input: { login: string; password: string; companyName: string }) => {
      if (!user) throw new Error('Нет сессии');
      const res = createPartnerAccount({ ...input, admin: user });
      setTick((n) => n + 1);
      return { login: res.user.login, password: res.password };
    },
    [user],
  );

  const adminResetPassword = useCallback(
    async (partnerUserId: string, password: string) => {
      if (!user) throw new Error('Нет сессии');
      const pw = resetPartnerPassword(partnerUserId, password, user);
      setTick((n) => n + 1);
      return pw;
    },
    [user],
  );

  const partnerCreateExecutor = useCallback(
    async (input: { login: string; password: string; displayName: string }) => {
      if (!user) throw new Error('Нет сессии');
      const res = createExecutorAccount({ ...input, partner: user });
      setTick((n) => n + 1);
      return { login: res.user.login, password: res.password };
    },
    [user],
  );

  const partnerResetExecutorPassword = useCallback(
    async (executorUserId: string, password: string) => {
      if (!user) throw new Error('Нет сессии');
      const pw = resetExecutorPassword(executorUserId, password, user);
      setTick((n) => n + 1);
      return pw;
    },
    [user],
  );

  const noteTool = useCallback(
    (tool: 'problemomer' | 'calculator') => {
      if (user) trackToolOpen(user, tool);
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
      login,
      logout,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      adminListPartners: () => listPartners(),
      adminActivity: () => listActivity(),
      partnerCreateExecutor,
      partnerResetExecutorPassword,
      partnerListExecutors: () => (user?.orgId ? listExecutorsForOrg(user.orgId) : []),
      noteTool,
      refresh,
      apiBase: '',
    }),
    // tick forces list refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      user,
      partner,
      loading,
      error,
      login,
      logout,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      partnerCreateExecutor,
      partnerResetExecutorPassword,
      noteTool,
      refresh,
      tick,
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
    installPerM2: org?.installPricePerM2 ?? null,
    dowelsPerPanel: org?.dowelsPerPanel || 2,
    dowelPrice: org?.dowelPriceRub ?? null,
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

export function calcUrlFromOrg(org: OrgSettings | null | undefined, companyName?: string): string {
  const params = partnerCalcParamsFromOrg(org, companyName);
  persistPartnerCalcParams(params);
  const q = new URLSearchParams();
  q.set('panelPrice', String(params.panelPrice));
  q.set('pricePerM2', String(params.pricePerM2));
  if (params.installPerM2 != null) q.set('installPerM2', String(params.installPerM2));
  q.set('dowelsPerPanel', String(params.dowelsPerPanel));
  if (params.dowelPrice != null) q.set('dowelPrice', String(params.dowelPrice));
  if (params.company) q.set('company', params.company);
  q.set('partner', '1');
  const path = `${import.meta.env.BASE_URL || '/'}calculator/index.html`.replace(/\/{2,}/g, '/');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${path}?${q.toString()}`;
}
