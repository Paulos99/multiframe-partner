/**
 * Remote API client for partner platform (Yandex Cloud Function).
 */
import type {
  JobObject,
  JobObjectDocument,
  OrgSettings,
  Project,
  ProjectInput,
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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const NETWORK_ERROR_MESSAGE = 'Нет связи с сервером. Проверьте интернет и повторите.';

/** Сбой связи или сервера (не ответ «нет доступа»): повтор может помочь. */
export function isTransientApiError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status >= 500);
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

async function request<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const base = apiBase();
  if (!base) throw new Error('Сервер не настроен');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const token = opts.token !== undefined ? opts.token : loadToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    const signal = opts.signal ?? AbortSignal.timeout(12000);
    res = await fetch(`${base}${path}`, { ...opts, headers, signal, cache: 'no-store' });
  } catch (err) {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new ApiError(res.status, data.message || `Ошибка ${res.status}`);
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
  const data = await request<{ user: SessionUser; token?: string }>('/auth/me');
  if (data.token) saveToken(data.token);
  return data.user;
}

export async function apiLogout(): Promise<void> {
  // Токен стираем сразу, а запрос уходит со старым значением: иначе поздний ответ
  // стёр бы токен нового входа, если человек успел войти заново.
  const token = loadToken();
  saveToken(null);
  try {
    await request('/auth/logout', { method: 'POST', token });
  } catch {
    /* ignore */
  }
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

export async function apiRenameStaff(
  staffUserId: string,
  displayName: string,
): Promise<{ id: string; login: string; role: UserRole; displayName: string }> {
  return request(`/org/staff/${encodeURIComponent(staffUserId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
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

export async function apiListProjects(): Promise<Project[]> {
  const data = await request<{ projects: Project[] }>('/projects');
  return data.projects;
}

export async function apiCreateProject(input: ProjectInput): Promise<Project> {
  const data = await request<{ project: Project }>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.project;
}

export async function apiDeleteProject(id: string): Promise<void> {
  await request(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function apiUpdateProject(id: string, input: ProjectInput): Promise<Project> {
  const data = await request<{ project: Project }>(`/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.project;
}

export async function apiDeleteObject(
  id: string,
  updatedAt?: string,
): Promise<{ conflict?: string; object?: JobObject }> {
  const q = updatedAt ? `?updatedAt=${encodeURIComponent(updatedAt)}` : '';
  try {
    return await request<{ conflict?: string; object?: JobObject }>(`/objects/${id}${q}`, {
      method: 'DELETE',
      body: JSON.stringify({ updatedAt: updatedAt || null }),
    });
  } catch (err) {
    if (isApiError(err) && err.status === 404) return {};
    throw err;
  }
}

export async function apiUploadObjectDocuments(
  objectId: string,
  documents: Array<{
    kind: 'estimate' | 'profile';
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

export async function apiAdminUpdatePartnerCity(
  partnerUserId: string,
  city: string,
): Promise<string> {
  const data = await request<{ city: string }>(`/admin/partners/${partnerUserId}`, {
    method: 'PATCH',
    body: JSON.stringify({ city }),
  });
  return data.city;
}

export async function apiListMaterials(): Promise<
  import('../../../api/materialsLib.js').PublicMaterial[]
> {
  const data = await request<{
    materials: import('../../../api/materialsLib.js').PublicMaterial[];
  }>('/materials');
  return data.materials;
}

export async function apiCreateMaterialFolder(
  name: string,
  parentId: string | null,
): Promise<import('../../../api/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../api/materialsLib.js').PublicMaterial[];
  }>('/materials/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
  });
  return data.materials;
}

export async function apiMaterialUploadUrl(input: {
  name: string;
  parentId: string | null;
  mime?: string;
}): Promise<{
  url: string;
  method: 'PUT';
  storageKey: string;
  expiresIn: number;
  headers?: Record<string, string>;
}> {
  return request('/materials/files/upload-url', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type MaterialMultipartTicket = {
  storageKey: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  mime: string;
};

export async function apiMaterialMultipartStart(input: {
  name: string;
  size: number;
  mime?: string;
}): Promise<MaterialMultipartTicket> {
  return request('/materials/files/multipart', { method: 'POST', body: JSON.stringify(input) });
}

export async function apiMaterialMultipartParts(input: {
  storageKey: string;
  uploadId: string;
  partNumbers: number[];
}): Promise<{ urls: Record<string, string>; expiresIn: number }> {
  return request('/materials/files/multipart/parts', { method: 'POST', body: JSON.stringify(input) });
}

export async function apiMaterialMultipartComplete(input: {
  storageKey: string;
  uploadId: string;
  partCount: number;
  name: string;
  parentId: string | null;
}): Promise<import('../../../api/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../api/materialsLib.js').PublicMaterial[];
  }>('/materials/files/multipart/complete', { method: 'POST', body: JSON.stringify(input) });
  return data.materials;
}

export async function apiMaterialMultipartAbort(input: {
  storageKey: string;
  uploadId: string;
}): Promise<void> {
  await request('/materials/files/multipart/abort', { method: 'POST', body: JSON.stringify(input) });
}

export async function apiRegisterMaterialFile(input: {
  name: string;
  parentId: string | null;
  storageKey: string;
}): Promise<import('../../../api/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../api/materialsLib.js').PublicMaterial[];
  }>('/materials/files', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.materials;
}

export async function apiUploadMaterial(input: {
  name: string;
  parentId: string | null;
  mime: string;
  contentBase64: string;
}): Promise<import('../../../api/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../api/materialsLib.js').PublicMaterial[];
  }>('/materials/files', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.materials;
}

export async function apiRenameMaterial(
  id: string,
  name: string,
): Promise<import('../../../api/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../api/materialsLib.js').PublicMaterial[];
  }>(`/materials/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return data.materials;
}

export async function apiReplaceMaterial(
  id: string,
  input: { name: string; mime: string; contentBase64: string },
): Promise<import('../../../api/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../api/materialsLib.js').PublicMaterial[];
  }>(`/materials/${id}/content`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.materials;
}

export async function apiDeleteMaterial(
  id: string,
): Promise<import('../../../api/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../api/materialsLib.js').PublicMaterial[];
  }>(`/materials/${id}`, { method: 'DELETE' });
  return data.materials;
}

/** Подписанная ссылка на PDF-копию материала для просмотра (404 — копии нет). */
export async function apiMaterialPreview(id: string): Promise<{
  name?: string;
  mime?: string | null;
  url?: string;
  base64?: string;
}> {
  return request(`/materials/${id}/preview`);
}

/** Миниатюра материала (только админ): подписанный PUT в бакет. */
export async function apiMaterialThumbnailTicket(
  id: string,
  mime: string,
): Promise<{ url: string; method: 'PUT'; storageKey: string; headers?: Record<string, string>; maxBytes?: number }> {
  return request(`/materials/${id}/thumbnail`, { method: 'POST', body: JSON.stringify({ upload: true, mime }) });
}

/** Подтвердить загруженную миниатюру — API проверит тип и размер и вернёт список материалов. */
export async function apiMaterialThumbnailConfirm(
  id: string,
  storageKey: string,
): Promise<import('../../../api/materialsLib.js').PublicMaterial[]> {
  const data = await request<{ materials: import('../../../api/materialsLib.js').PublicMaterial[] }>(
    `/materials/${id}/thumbnail`,
    { method: 'POST', body: JSON.stringify({ storageKey }) },
  );
  return data.materials;
}

export async function apiMaterialContent(id: string): Promise<{
  name?: string;
  mime?: string | null;
  base64?: string;
  stub?: string;
}> {
  return request(`/materials/${id}/content`);
}

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

// Profile writes use the authenticated user; no user id is accepted from the UI.
export async function apiProfile() { return (await request<{user:SessionUser}>('/me')).user; }
export async function apiUpdateProfile(login:string,currentPassword:string) {
  const result=await request<{user:SessionUser;token:string}>('/me',{method:'PATCH',body:JSON.stringify({login,currentPassword})});
  saveToken(result.token); return result.user;
}
export async function apiUpdateDisplayName(displayName:string) {
  const result=await request<{user:SessionUser;token?:string}>('/me',{method:'PATCH',body:JSON.stringify({displayName})});
  if(result.token) saveToken(result.token);
  return result.user;
}
export async function apiChangePassword(currentPassword:string,newPassword:string) {
  const result=await request<{token:string}>('/me/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
  saveToken(result.token);
}
export async function apiUploadAvatar(base64:string) {
  return (await request<{user:SessionUser}>('/me/avatar',{method:'PUT',body:JSON.stringify({base64,mime:'image/webp'})})).user;
}

/** Ссылка для клиента на результаты Проблемомера одной комнаты. */
export interface RoomShareLink {
  enabled: boolean;
  token: string | null;
  updatedAt?: string;
  /** Ссылку отключили вручную. */
  disabled?: boolean;
}

/** Что сервер отдаёт по открытой ссылке: только поля комнаты, без цен и контактов. */
export interface PublicRoomShare {
  roomName: string;
  room: Record<string, unknown>;
  updatedAt?: string;
}

export async function apiGetRoomShare(objectId: string): Promise<RoomShareLink> {
  const data = await request<{ link: RoomShareLink }>(`/objects/${encodeURIComponent(objectId)}/share`);
  return data.link;
}

/**
 * Создаёт ссылку или обновляет снимок ответов у уже включённой.
 * Отключённую ссылку не оживляет: сервер вернёт enabled: false. Новую выдаёт только renew: true.
 */
export async function apiCreateRoomShare(
  objectId: string,
  answers: Record<string, unknown>,
  renew = false,
): Promise<RoomShareLink> {
  const data = await request<{ link: RoomShareLink }>(`/objects/${encodeURIComponent(objectId)}/share`, {
    method: 'POST',
    body: JSON.stringify(renew ? { answers, renew: true } : { answers }),
  });
  return data.link;
}

export async function apiDisableRoomShare(objectId: string): Promise<void> {
  await request<{ link: RoomShareLink }>(`/objects/${encodeURIComponent(objectId)}/share`, {
    method: 'DELETE',
  });
}

/** Открытая страница клиента: без входа, токена сессии в запросе нет. */
export async function apiPublicRoom(token: string, signal?: AbortSignal): Promise<PublicRoomShare> {
  const data = await request<{ share: PublicRoomShare }>(`/public/rooms/${encodeURIComponent(token)}`, {
    token: null,
    signal,
  });
  return data.share;
}
