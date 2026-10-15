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
  ExecutorLink,
  OrgSettings,
  PartnerProfile,
  SessionUser,
} from '../../../../packages/shared/partner';
import { FIXED_PANEL_PRICE_RUB, FIXED_PRICE_PER_M2, toPartnerProfile } from '../../../../packages/shared/partner';
import {
  createExecutorLink,
  createPartnerAccount,
  enterByExecToken,
  listActivity,
  listLinksForOrg,
  listPartners,
  loadSession,
  localLogin,
  localLogout,
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
  enterExecLink: (token: string) => Promise<void>;
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
    linkCount: number;
  }>;
  adminActivity: () => ActivityEvent[];
  partnerCreateLink: (label: string) => { link: ExecutorLink; url: string };
  partnerListLinks: () => ExecutorLink[];
  noteTool: (tool: 'problemomer' | 'calculator') => void;
  refresh: () => void;
  apiBase: string;
};

const Ctx = createContext<PartnerApi | null>(null);

function buildExecUrl(pathQuery: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${base.replace(/\/?$/, '/')}${pathQuery.replace(/^\?/, '?')}`.replace(
    /\?+/,
    '?',
  );
}

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
    // Corporate executor link from URL
    try {
      const params = new URLSearchParams(window.location.search);
      const exec = params.get('exec');
      if (exec) {
        try {
          const session = enterByExecToken(exec);
          setUser(session);
          // Clean URL but keep hash/path
          const url = new URL(window.location.href);
          url.searchParams.delete('exec');
          history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Ссылка недействительна');
          setUser(loadSession());
        }
      } else {
        setUser(loadSession());
      }
    } catch {
      setUser(loadSession());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const company = user?.org?.companyName || '';
    (window as Window & { __MF_PARTNER_COMPANY__?: string }).__MF_PARTNER_COMPANY__ = company;
    (window as Window & { __MF_PARTNER_ORG__?: OrgSettings | null }).__MF_PARTNER_ORG__ =
      user?.org || null;
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

  const enterExecLink = useCallback(async (token: string) => {
    const session = enterByExecToken(token.trim());
    setUser(session);
  }, []);

  const saveOrg = useCallback(
    async (patch: Partial<OrgSettings>) => {
      if (!user?.orgId) throw new Error('Нет организации');
      const settings = updateOrgSettings(user.orgId, patch, user);
      setUser({ ...user, org: settings, displayName: settings.companyName || user.displayName });
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

  const partnerCreateLink = useCallback(
    (label: string) => {
      if (!user) throw new Error('Нет сессии');
      const { link, urlPath } = createExecutorLink(label, user);
      setTick((n) => n + 1);
      return { link, url: buildExecUrl(urlPath) };
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
      enterExecLink,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      adminListPartners: () => listPartners(),
      adminActivity: () => listActivity(),
      partnerCreateLink,
      partnerListLinks: () => (user?.orgId ? listLinksForOrg(user.orgId) : []),
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
      enterExecLink,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      partnerCreateLink,
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

export function calcUrlFromOrg(org: OrgSettings | null | undefined, companyName?: string): string {
  const q = new URLSearchParams();
  q.set('panelPrice', String(FIXED_PANEL_PRICE_RUB));
  q.set('pricePerM2', String(FIXED_PRICE_PER_M2));
  if (org?.installPricePerM2 != null) q.set('installPerM2', String(org.installPricePerM2));
  q.set('dowelsPerPanel', String(org?.dowelsPerPanel || 2));
  if (org?.dowelPriceRub != null) q.set('dowelPrice', String(org.dowelPriceRub));
  const company = companyName || org?.companyName || '';
  if (company) q.set('company', company);
  q.set('partner', '1');
  const base = `${import.meta.env.BASE_URL || '/'}calculator/index.html`;
  return `${base}?${q.toString()}`;
}
