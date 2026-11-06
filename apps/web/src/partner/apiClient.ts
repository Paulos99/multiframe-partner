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
import type { PhotoStage } from '../../../../packages/shared/roomPhotos.js';
import { loadToken, saveToken } from './localStore';
import type {
  TrainingCompanyRow,
  TrainingOrgView,
  TrainingUserView,
} from '../../../../packages/shared/trainingService.js';

export type TrainingSyncAck = { acceptedAttemptIds: string[]; acceptedMaterialIds: string[]; rejected?: number; stored?: number };

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

/** Ожидание ответа одного запроса. Раньше было 12 с: при очереди на сервере клиент сам обрывал живой запрос. */
export const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 600;
const RETRY_STATUSES = new Set([502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Повторять можно только запросы, которые не меняют данные при повторе. */
function isIdempotent(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

/** Пауза перед повтором: 0,6 с, 1,2 с, 2,4 с с разбросом, чтобы клиенты не возвращались синхронно. */
export function retryDelayMs(attempt: number, retryAfterHeader?: string | null, random: () => number = Math.random): number {
  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(10_000, seconds * 1000);
  const base = RETRY_BASE_MS * 2 ** attempt;
  return Math.round(base * (0.75 + random() * 0.5));
}

export type RawResponse<T> = { status: number; data: T; etag: string | null };

async function rawRequest<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<RawResponse<T>> {
  const base = apiBase();
  if (!base) throw new Error('Сервер не настроен');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const token = opts.token !== undefined ? opts.token : loadToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const method = String(opts.method || 'GET').toUpperCase();
  const attempts = isIdempotent(method) ? RETRY_ATTEMPTS : 1;
  let lastError: ApiError | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let res: Response;
    try {
      const signal = opts.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      res = await fetch(`${base}${path}`, { ...opts, headers, signal, cache: 'no-store' });
    } catch {
      lastError = new ApiError(0, NETWORK_ERROR_MESSAGE);
      // Запрос, который прервал сам вызывающий, не повторяется.
      if (opts.signal?.aborted || attempt === attempts - 1) throw lastError;
      await sleep(retryDelayMs(attempt));
      continue;
    }
    if (res.status === 304) return { status: 304, data: {} as T, etag: res.headers.get('ETag') };
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) {
      lastError = new ApiError(res.status, data.message || `Ошибка ${res.status}`);
      const retryable = RETRY_STATUSES.has(res.status) || (res.status === 429 && attempts > 1);
      if (!retryable || attempt === attempts - 1) throw lastError;
      await sleep(retryDelayMs(attempt, res.headers.get('Retry-After')));
      continue;
    }
    return { status: res.status, data, etag: res.headers.get('ETag') };
  }
  throw lastError ?? new ApiError(0, NETWORK_ERROR_MESSAGE);
}

export async function request<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  return (await rawRequest<T>(path, opts)).data;
}

/** Последний ответ списка и его версия. Ключ включает токен: при смене пользователя чужие данные не показываются. */
const listCache = new Map<string, { etag: string; value: unknown }>();

export function resetListCacheForTests(): void {
  listCache.clear();
}

/**
 * Читает страницу списка с проверкой версии. Если сервер ответил 304, возвращается прежнее значение
 * и notModified: true.
 */
async function conditionalGet<T>(path: string): Promise<RawResponse<T> & { notModified: boolean; cached: unknown }> {
  const key = `${loadToken() || ''}|${path}`;
  const known = listCache.get(key);
  const res = await rawRequest<T>(path, {
    headers: known ? { 'If-None-Match': known.etag } : undefined,
  });
  if (res.status === 304 && known) return { ...res, notModified: true, cached: known.value };
  if (res.status === 304) {
    // Сервер ответил 304 без нашего кэша (сброс памяти): запрашиваем заново без условия.
    const fresh = await rawRequest<T>(path);
    return { ...fresh, notModified: false, cached: null };
  }
  return { ...res, notModified: false, cached: null };
}

const PAGE_SIZE = 500;

type ListPage<K extends string, T> = { [key in K]: T[] } & { total?: number; nextOffset?: number | null };

/**
 * Весь список постранично. Первая страница проверяется по версии: если она не изменилась, остальные не
 * запрашиваются. Старый сервер без постраничной выдачи отвечает целиком, и цикл заканчивается сразу.
 */
async function listAll<K extends string, T extends { id: string }>(
  base: string,
  field: K,
): Promise<{ items: T[]; notModified: boolean }> {
  const token = loadToken() || '';
  const firstPath = `${base}?limit=${PAGE_SIZE}&offset=0`;
  const first = await conditionalGet<ListPage<K, T>>(firstPath);
  const assembledKey = `${token}|${base}|all`;
  if (first.notModified) {
    const assembled = listCache.get(assembledKey);
    if (assembled && assembled.etag === listCache.get(`${token}|${firstPath}`)?.etag) {
      return { items: assembled.value as T[], notModified: true };
    }
  }
  let items: T[] = first.data[field] ?? [];
  let next = first.data.nextOffset ?? null;
  let consistent = true;
  let guard = 0;
  while (next != null && guard < 200) {
    const page = await rawRequest<ListPage<K, T>>(`${base}?limit=${PAGE_SIZE}&offset=${next}`);
    if (first.etag && page.etag && page.etag !== first.etag) consistent = false;
    items = items.concat(page.data[field] ?? []);
    next = page.data.nextOffset ?? null;
    guard += 1;
  }
  if (guard > 0) {
    const seen = new Set<string>();
    items = items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  }
  if (first.etag && consistent) {
    listCache.set(`${token}|${firstPath}`, { etag: first.etag, value: first.data });
    listCache.set(assembledKey, { etag: first.etag, value: items });
  } else {
    // Список менялся во время загрузки: версию не запоминаем, следующая проверка загрузит его заново.
    listCache.delete(`${token}|${firstPath}`);
    listCache.delete(assembledKey);
  }
  return { items, notModified: false };
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
      pendingActivation?: boolean;
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
}): Promise<{ login: string; password?: string; pendingActivation?: boolean }> {
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
    pendingActivation?: boolean;
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
}): Promise<{ id: string; login: string; password?: string; role: UserRole; pendingActivation?: boolean }> {
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
  return (await apiListObjectsChecked()).objects;
}

/** Список комнат; notModified — на сервере ничего не изменилось с прошлой загрузки (можно не пересохранять). */
export async function apiListObjectsChecked(): Promise<{ objects: JobObject[]; notModified: boolean }> {
  const { items, notModified } = await listAll<'objects', JobObject>('/objects', 'objects');
  return { objects: items, notModified };
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
  return (await apiListProjectsChecked()).projects;
}

export async function apiListProjectsChecked(): Promise<{ projects: Project[]; notModified: boolean }> {
  const { items, notModified } = await listAll<'projects', Project>('/projects', 'projects');
  return { projects: items, notModified };
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
  delete copy.photoCounts;
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
  import('../../../../packages/shared/materialsLib.js').PublicMaterial[]
> {
  const data = await request<{
    materials: import('../../../../packages/shared/materialsLib.js').PublicMaterial[];
  }>('/materials');
  return data.materials;
}

export async function apiCreateMaterialFolder(
  name: string,
  parentId: string | null,
): Promise<import('../../../../packages/shared/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../../packages/shared/materialsLib.js').PublicMaterial[];
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
}): Promise<import('../../../../packages/shared/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../../packages/shared/materialsLib.js').PublicMaterial[];
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
}): Promise<import('../../../../packages/shared/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../../packages/shared/materialsLib.js').PublicMaterial[];
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
}): Promise<import('../../../../packages/shared/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../../packages/shared/materialsLib.js').PublicMaterial[];
  }>('/materials/files', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.materials;
}

export async function apiRenameMaterial(
  id: string,
  name: string,
): Promise<import('../../../../packages/shared/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../../packages/shared/materialsLib.js').PublicMaterial[];
  }>(`/materials/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return data.materials;
}

export async function apiReplaceMaterial(
  id: string,
  input: { name: string; mime: string; contentBase64: string },
): Promise<import('../../../../packages/shared/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../../packages/shared/materialsLib.js').PublicMaterial[];
  }>(`/materials/${id}/content`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.materials;
}

export async function apiDeleteMaterial(
  id: string,
): Promise<import('../../../../packages/shared/materialsLib.js').PublicMaterial[]> {
  const data = await request<{
    materials: import('../../../../packages/shared/materialsLib.js').PublicMaterial[];
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
): Promise<import('../../../../packages/shared/materialsLib.js').PublicMaterial[]> {
  const data = await request<{ materials: import('../../../../packages/shared/materialsLib.js').PublicMaterial[] }>(
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
export async function apiUpdatePhone(phone:string) {
  return (await request<{user:SessionUser}>('/me',{method:'PATCH',body:JSON.stringify({phone})})).user;
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
  /** Фотоотчёт: есть, только если владелец или менеджер включил показ клиенту. */
  photos?: PublicRoomPhoto[];
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
  return data.share.photos ? { ...data.share, photos: data.share.photos.map(withUrls) } : data.share;
}

/* —— Обучение в аналитике (см. apps/api/training.js) —— */

export async function apiTrainingSync(body: { attempts: unknown[]; materials: unknown[] }): Promise<TrainingSyncAck> {
  return request<TrainingSyncAck>('/training/sync', { method: 'POST', body: JSON.stringify(body) });
}

export async function apiTrainingOrg(orgId?: string | null): Promise<TrainingOrgView> {
  return request<TrainingOrgView>(`/training/org${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''}`);
}

export async function apiTrainingCompanies(): Promise<{ companies: TrainingCompanyRow[] }> {
  return request<{ companies: TrainingCompanyRow[] }>('/training/companies');
}

export async function apiTrainingUser(userId: string): Promise<TrainingUserView> {
  return request<TrainingUserView>(`/training/user/${encodeURIComponent(userId)}`);
}

/* —— Фотоотчёт комнаты —— */

export interface RoomPhoto {
  id: string;
  stage: PhotoStage;
  caption: string;
  createdAt: string;
  createdBy?: string | null;
  authorName?: string;
  authorRole?: string | null;
  width: number | null;
  height: number | null;
  /** Короткоживущие ссылки: после просмотра список лучше запросить заново. */
  url: string;
  thumbUrl: string;
  /** Подписанная ссылка на миниатюру через API (с CORS): из неё собирается PDF-отчёт. */
  pdfUrl?: string;
}

export interface RoomPhotoList {
  photos: RoomPhoto[];
  canAdd: PhotoStage[];
  stages: PhotoStage[];
  limit: number;
  clientVisible: boolean;
  canShareWithClient: boolean;
}

/** Без бакета сервер отдаёт путь от корня API: добавляем адрес API. */
export function resolvePhotoUrl(url: string): string {
  return url.startsWith('/') ? `${apiBase()}${url}` : url;
}

function withUrls<T extends { url?: string; thumbUrl?: string; pdfUrl?: string }>(photo: T): T {
  return {
    ...photo,
    ...(photo.url ? { url: resolvePhotoUrl(photo.url) } : {}),
    ...(photo.thumbUrl ? { thumbUrl: resolvePhotoUrl(photo.thumbUrl) } : {}),
    ...(photo.pdfUrl ? { pdfUrl: resolvePhotoUrl(photo.pdfUrl) } : {}),
  };
}

const photosPath = (objectId: string) => `/objects/${encodeURIComponent(objectId)}/photos`;

export async function apiListRoomPhotos(objectId: string, signal?: AbortSignal): Promise<RoomPhotoList> {
  const data = await request<RoomPhotoList>(photosPath(objectId), { signal });
  return { ...data, photos: data.photos.map(withUrls) };
}

/**
 * Загрузка одного фото с процентом выполнения (fetch этого не умеет, поэтому XMLHttpRequest).
 * Фото уходят по одному: сервер дописывает запись комнаты, параллельные запросы не нужны.
 */
export function apiUploadRoomPhoto(
  objectId: string,
  input: { stage: PhotoStage; caption: string; image: string; thumb: string },
  onProgress?: (fraction: number) => void,
): Promise<RoomPhoto> {
  const base = apiBase();
  if (!base) return Promise.reject(new Error('Сервер не настроен'));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}${photosPath(objectId)}`);
    xhr.timeout = 90_000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    const token = loadToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, NETWORK_ERROR_MESSAGE));
    xhr.ontimeout = () => reject(new ApiError(0, NETWORK_ERROR_MESSAGE));
    xhr.onload = () => {
      let data: { photo?: RoomPhoto; message?: string } = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* пустой ответ */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.photo) {
        onProgress?.(1);
        resolve(withUrls(data.photo));
      } else {
        reject(new ApiError(xhr.status, data.message || `Ошибка ${xhr.status}`));
      }
    };
    xhr.send(JSON.stringify(input));
  });
}

export async function apiUpdateRoomPhoto(objectId: string, photoId: string, caption: string): Promise<RoomPhoto> {
  const data = await request<{ photo: RoomPhoto }>(`${photosPath(objectId)}/${encodeURIComponent(photoId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ caption }),
  });
  return withUrls(data.photo);
}

export async function apiDeleteRoomPhoto(objectId: string, photoId: string): Promise<void> {
  await request(`${photosPath(objectId)}/${encodeURIComponent(photoId)}`, { method: 'DELETE' });
}

export async function apiSetPhotoReportVisible(objectId: string, clientVisible: boolean): Promise<boolean> {
  const data = await request<{ clientVisible: boolean }>(photosPath(objectId), {
    method: 'PATCH',
    body: JSON.stringify({ clientVisible }),
  });
  return data.clientVisible;
}

/** Кейс админа: комната с фото. Без имени клиента и адреса. */
export interface PhotoCase {
  objectId: string;
  roomName: string;
  areaM2: number | null;
  orgId: string;
  partnerName: string;
  city: string;
  counts: Record<PhotoStage, number>;
  total: number;
  /** Есть и «До», и «После». */
  complete: boolean;
  lastAt: string | null;
  firstAt: string | null;
  coverUrl?: string | null;
  coverStage?: PhotoStage | null;
}

export interface PhotoCaseFilters {
  orgId?: string;
  stage?: PhotoStage | '';
  from?: string;
  to?: string;
}

export async function apiListPhotoCases(
  filters: PhotoCaseFilters = {},
  signal?: AbortSignal,
): Promise<{ cases: PhotoCase[]; partners: Array<{ id: string; name: string }> }> {
  const q = new URLSearchParams();
  if (filters.orgId) q.set('orgId', filters.orgId);
  if (filters.stage) q.set('stage', filters.stage);
  if (filters.from) q.set('from', filters.from);
  if (filters.to) q.set('to', filters.to);
  const data = await request<{ cases: PhotoCase[]; partners: Array<{ id: string; name: string }> }>(
    `/photo-cases${q.toString() ? `?${q}` : ''}`,
    { signal },
  );
  return {
    ...data,
    cases: data.cases.map((item) => ({ ...item, coverUrl: item.coverUrl ? resolvePhotoUrl(item.coverUrl) : null })),
  };
}

export async function apiGetPhotoCase(
  objectId: string,
  signal?: AbortSignal,
): Promise<{ case: PhotoCase; photos: RoomPhoto[] }> {
  const data = await request<{ case: PhotoCase; photos: RoomPhoto[] }>(
    `/photo-cases/${encodeURIComponent(objectId)}`,
    { signal },
  );
  return { ...data, photos: data.photos.map(withUrls) };
}

/** Фото клиентской страницы: этап и ссылки, без подписей и авторов. */
export type PublicRoomPhoto = Pick<RoomPhoto, 'id' | 'stage' | 'createdAt' | 'width' | 'height' | 'url' | 'thumbUrl' | 'pdfUrl'>;
