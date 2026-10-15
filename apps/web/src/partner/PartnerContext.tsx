import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PartnerProfile, PatchProfileRequest } from '../../../../packages/shared/partner';

const TOKEN_KEY = 'mf_partner_token';
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

type PartnerApi = {
  partner: PartnerProfile | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  saveProfile: (patch: PatchProfileRequest) => Promise<void>;
  apiBase: string;
};

const Ctx = createContext<PartnerApi | null>(null);

async function api<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState<string | null>(null);

  const persistToken = useCallback((t: string | null) => {
    setToken(t);
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setPartner(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const me = await api<{ partner: PartnerProfile }>('/auth/me', { token });
      setPartner(me.partner);
    } catch (e) {
      setPartner(null);
      persistToken(null);
      setError(e instanceof Error ? e.message : 'Сессия истекла');
    } finally {
      setLoading(false);
    }
  }, [token, persistToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    (window as Window & { __MF_PARTNER_COMPANY__?: string }).__MF_PARTNER_COMPANY__ =
      partner?.companyName || '';
  }, [partner]);

  const login = useCallback(
    async (loginName: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api<{ token: string; partner: PartnerProfile }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ login: loginName, password }),
        });
        persistToken(res.token);
        setPartner(res.partner);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка входа');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [persistToken],
  );

  const logout = useCallback(() => {
    persistToken(null);
    setPartner(null);
  }, [persistToken]);

  const saveProfile = useCallback(
    async (patch: PatchProfileRequest) => {
      if (!token) throw new Error('Нет сессии');
      const res = await api<{ partner: PartnerProfile }>('/partner/profile', {
        method: 'PATCH',
        token,
        body: JSON.stringify(patch),
      });
      setPartner(res.partner);
    },
    [token],
  );

  const value = useMemo<PartnerApi>(
    () => ({
      partner,
      token,
      loading,
      error,
      login,
      logout,
      refresh,
      saveProfile,
      apiBase: API_URL,
    }),
    [partner, token, loading, error, login, logout, refresh, saveProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePartner(): PartnerApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePartner outside Provider');
  return ctx;
}
