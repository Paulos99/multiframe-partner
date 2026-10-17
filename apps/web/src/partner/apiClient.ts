/**
 * Remote API client for partner platform (Yandex Cloud Function).
 */
import type {
  JobObject,
  JobObjectDocument,
  OrgSettings,
  SessionUser,
  UserRole,
} from '../../../../packages/shared/partner';
import { loadToken, saveToken } from './localStore';

export function apiBase(): string {
  return (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
}

export function hasRemoteApi(): boolean {
  return Boolean(apiBase());
}

async function request<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const base = apiBase();
  if (!base) throw new Error('API не настроен');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const token = opts.token !== undefined ? opts.token : loadToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { ...opts, headers });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || `Ошибка ${res.status}`);
  }
  return data;
}

export async function apiLogin(
  login: string,
  password: string,
): Promise<{ token: string; user: SessionUser }> {
  const data = await request<{ token: string; user: SessionUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
    token: null,
  });
  saveToken(data.token);
  return data;
}

export async function apiMe(): Promise<SessionUser> {
  const data = await request<{ user: SessionUser }>('/auth/me');
  return data.user;
}

export async function apiLogout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  saveToken(null);
}

export async function apiSaveOrg(patch: Partial<OrgSettings>): Promise<OrgSettings> {
  const data = await request<{ org: OrgSettings }>('/org/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.org;
}

export async function apiAdminListPartners(): Promise<
  Array<{
    user: {
      id: string;
      login: string;
      role: UserRole;
      displayName: string;
      orgId: string | null;
      createdAt: string;
    };
    org?: { id: string; settings: OrgSettings };
    lastLogin: string | null;
    executorCount: number;
    staffCount?: number;
  }>
> {
  const data = await request<{ partners: Awaited<ReturnType<typeof apiAdminListPartners>> }>(
    '/admin/partners',
  );
  return data.partners;
}

export async function apiAdminCreatePartner(input: {
  login: string;
  password: string;
  companyName: string;
  city?: string;
}): Promise<{ login: string; password: string }> {
  return request('/admin/partners', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function apiAdminResetPassword(
  partnerUserId: string,
  password: string,
): Promise<string> {
  const data = await request<{ password: string }>('/admin/partners/reset-password', {
    method: 'POST',
    body: JSON.stringify({ partnerUserId, password }),
  });
  return data.password;
}

export async function apiAdminDeletePartner(partnerUserId: string): Promise<void> {
  await request(`/admin/partners/${partnerUserId}`, { method: 'DELETE' });
}

export async function apiListStaff(): Promise<
  Array<{
    id: string;
    login: string;
    role: UserRole;
    displayName: string;
    orgId: string | null;
    createdAt: string;
  }>
> {
  const data = await request<{ staff: Awaited<ReturnType<typeof apiListStaff>> }>('/org/staff');
  return data.staff;
}

export async function apiCreateStaff(input: {
  login: string;
  password: string;
  displayName: string;
  role: UserRole;
}): Promise<{ id: string; login: string; password: string; role: UserRole }> {
  return request('/org/staff', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function apiResetStaffPassword(
  staffUserId: string,
  password: string,
): Promise<string> {
  const data = await request<{ password: string }>('/org/staff/reset-password', {
    method: 'POST',
    body: JSON.stringify({ staffUserId, password }),
  });
  return data.password;
}

export async function apiDeleteStaff(staffUserId: string): Promise<void> {
  await request(`/org/staff/${staffUserId}`, { method: 'DELETE' });
}

export async function apiListObjects(): Promise<JobObject[]> {
  const data = await request<{ objects: JobObject[] }>('/objects');
  return data.objects;
}

export async function apiCreateObject(
  input: Partial<JobObject>,
): Promise<JobObject> {
  const data = await request<{ object: JobObject }>('/objects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.object;
}

export async function apiPatchObject(
  id: string,
  patch: Partial<JobObject>,
): Promise<JobObject> {
  const data = await request<{ object: JobObject }>(`/objects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.object;
}

export async function apiDeleteObject(id: string): Promise<void> {
  await request(`/objects/${id}`, { method: 'DELETE' });
}

export async function apiUploadObjectDocuments(
  objectId: string,
  documents: Array<{
    kind: 'estimate' | 'spec';
    filename: string;
    pdfBase64: string;
    hasScheme: boolean;
    panels?: number | null;
    areaM2?: number | null;
  }>,
  versionId?: string,
): Promise<JobObject> {
  const data = await request<{ object: JobObject }>(`/objects/${objectId}/documents`, {
    method: 'POST',
    body: JSON.stringify({ documents, versionId }),
  });
  return data.object;
}

export async function apiFetchObjectDocument(
  objectId: string,
  docId: string,
): Promise<{ id: string; filename: string; kind: string; pdfBase64: string }> {
  return request(`/objects/${objectId}/documents/${encodeURIComponent(docId)}`);
}

export function stripObjectDocuments<T extends Partial<JobObject>>(input: T): T {
  const copy = { ...input };
  delete copy.documents;
  return copy;
}

export type { JobObjectDocument };

export async function apiFlushObjectQueue(
  queue: JobObject[],
): Promise<void> {
  for (const obj of queue) {
    try {
      if (obj.pendingSync) {
        // Prefer PATCH so status updates don't clone; POST upserts by id on the API.
        await apiPatchObject(obj.id, obj).catch(async () => {
          await apiCreateObject(obj);
        });
      }
    } catch {
      /* keep in queue */
      throw new Error('sync_failed');
    }
  }
}
