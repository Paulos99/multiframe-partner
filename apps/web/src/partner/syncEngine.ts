/**
 * Online save, offline queue and flush.
 * Client ids are stable. A newer updatedAt wins; an older offline write is kept
 * in server history and does not erase the fresher record. A 401 leaves the outbox.
 */
import type { JobObject, JobObjectDocument, Project, ProjectInput, SessionUser } from '../../../../packages/shared/partner';
import {
  ApiError,
  apiBase,
  apiCreateObject,
  apiCreateProject,
  apiDeleteObject,
  apiListObjectsChecked,
  apiListProjectsChecked,
  apiPatchObject,
  apiUpdateProject,
  apiUploadObjectDocuments,
  isApiError,
  stripObjectDocuments,
} from './apiClient';
import { isDemoModeEnabled } from './demoMode';
import { afterFailure, isFinalHttpStatus, isRegenerableDocumentKind, writeLastSync } from './offlineQueue';
import { canChangeRoomStage } from '../../../../packages/shared/roomStage.js';
import {
  appendLocalObjectDocuments,
  cacheObjects,
  cacheProjects,
  fillDemoCompanyRooms,
  deleteLocalObject,
  listLocalProjects,
  loadCachedObjects,
  loadCachedProjects,
  listLocalObjects,
  loadToken,
  markProjectsApiReady,
  patchQueuedObjectDocuments,
  peekObjectDocumentQueue,
  presentCachedObject,
  projectsApiReady,
  removeFromObjectQueue,
  removeQueuedObjectDocuments,
  saveLocalDocBytes,
  saveToken,
  upsertLocalObject,
  upsertLocalProject,
} from './localStore';
import {
  deleteStoredObject,
  enqueueOutbox,
  getOutboxOp,
  getStoredObject,
  enqueueProjectOutbox,
  listOutbox,
  listProjectOutbox,
  loadAllObjects,
  loadAllProjects,
  mergeObjects,
  mergeProjects,
  newObjectId,
  putObject,
  putProject,
  registerBackgroundSync,
  rememberSession,
  removeOutbox,
  removeProjectOutbox,
  replaceServerObjects,
  replaceServerProjects,
  type OutboxOp,
  type ProjectOutboxOp,
} from './offlineDb';

export async function countMyOutbox(userId: string): Promise<number> {
  const rows = await listOutbox();
  return rows.filter((op) => op.userId === userId).length;
}

export async function loadVisibleObjects(user: SessionUser, remote: boolean): Promise<JobObject[]> {
  const outbox = await listOutbox();
  let base: JobObject[] = [];
  if (!remote || (isDemoModeEnabled() && !loadToken())) {
    base = listLocalObjects(user);
  } else if (loadToken() && navigator.onLine) {
    try {
      const loaded = await apiListObjectsChecked();
      base = loaded.objects;
      // Связь с сервером есть: запоминаем время для полосы «больше суток без связи».
      writeLastSync(user.id, new Date().toISOString());
      // Версия на сервере не изменилась: локальная копия уже совпадает, пересохранять её не нужно.
      if (!loaded.notModified) {
        await replaceServerObjects(base, user.orgId, user.role === 'admin');
        cacheObjects(base);
      }
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        saveToken(null);
        await rememberSession({ token: null, apiBase: apiBase(), userId: user.id });
      }
      base = await loadAllObjects();
      if (!base.length) base = loadCachedObjects();
    }
  } else {
    base = await loadAllObjects();
    if (!base.length) base = loadCachedObjects();
    // Старый демо-кабинет хранил комнаты только в localStorage. Без токена они остаются источником.
    if (!loadToken() && (user.orgId === 'org_demo' || user.orgId === 'org_demo_spb')) {
      const local = listLocalObjects(user);
      if (!base.length) base = local;
      else {
        const ids = new Set(base.map((obj) => obj.id));
        base = base.concat(local.filter((obj) => obj.id && !ids.has(obj.id)));
      }
    }
  }
  base = fillDemoCompanyRooms(base, user.orgId);
  // Демо без очереди: всё на устройстве. Демо-аккаунт на сервере тоже копит очередь без связи.
  if (isDemoModeEnabled() && !outbox.length) {
    return base
      .map((obj) => presentCachedObject(user, obj))
      .filter((obj): obj is JobObject => obj != null)
      .map((obj) => ({ ...obj, pendingSync: false }));
  }
  const pendingIds = new Set([
    ...outbox.map((op) => op.id),
    ...peekObjectDocumentQueue().map((doc) => doc.objectId),
  ]);
  const merged = withQueuedDocuments(mergeObjects(base, outbox));
  return merged
    .map((obj) => presentCachedObject(user, obj))
    .filter((obj): obj is JobObject => obj != null)
    .map((obj) => ({ ...obj, pendingSync: pendingIds.has(obj.id) }));
}

function withoutDocBytes(obj: JobObject): JobObject {
  if (!obj.documents?.length) return obj;
  return {
    ...obj,
    documents: obj.documents.map((doc) => {
      const copy = { ...doc };
      delete copy.dataBase64;
      return copy;
    }),
  };
}

/** PDF bytes stay in the document queue. The object outbox keeps only file names. */
function withQueuedDocuments(objects: JobObject[]): JobObject[] {
  const queued = peekObjectDocumentQueue();
  if (!queued.length) return objects;
  return objects.map((obj) => {
    const extra = queued.filter((doc) => doc.objectId === obj.id);
    if (!extra.length) return obj;
    const have = new Set((obj.documents || []).map((doc) => `${doc.versionId}:${doc.kind}`));
    const add: JobObjectDocument[] = extra
      .filter((doc) => !have.has(`${doc.versionId}:${doc.kind}`))
      .map((doc) => ({
        id: `q_${obj.id}_${doc.versionId}_${doc.kind}`,
        versionId: doc.versionId,
        createdAt: obj.updatedAt,
        createdBy: obj.createdBy,
        kind: doc.kind,
        filename: doc.filename,
        hasScheme: doc.hasScheme,
        panels: doc.panels ?? null,
        areaM2: doc.areaM2 ?? null,
      }));
    if (!add.length) return obj;
    return { ...obj, documents: [...add, ...(obj.documents || [])].slice(0, 40) };
  });
}

async function queueUpsert(user: SessionUser, draft: Partial<JobObject> & { id: string; updatedAt: string }) {
  // Этап, с которого человек начал правку без связи: из первой записи очереди или из копии сервера.
  const earlier = await getOutboxOp(draft.id).catch(() => null);
  const serverCopy = earlier ? null : await getStoredObject(draft.id).catch(() => null);
  const baseStatus = earlier?.op === 'upsert' ? earlier.baseStatus : serverCopy?.status;
  // Комната с сервера: правка поверх её копии на телефоне. Локальная база демо-кабинета (localStorage)
  // таких комнат не знает и отказала бы замерщику «Недостаточно прав».
  const current = earlier?.op === 'upsert' ? earlier.payload : serverCopy;
  let obj: JobObject;
  if (current) {
    if (user.role === 'crew') throw new Error('Бригада не меняет проект и комнату');
    if (draft.status && draft.status !== current.status && !canChangeRoomStage(user.role, current.status, draft.status)) {
      throw new Error('Статус меняет менеджер или владелец');
    }
    obj = { ...current, ...draft, pendingSync: true } as JobObject;
  } else {
    obj = upsertLocalObject(withoutDocBytes({ ...draft, pendingSync: true } as JobObject), user);
  }
  const payload: JobObject = withoutDocBytes({ ...obj, pendingSync: true });
  const op: OutboxOp = {
    id: obj.id,
    op: 'upsert',
    updatedAt: obj.updatedAt,
    userId: user.id,
    orgId: obj.orgId,
    payload,
    ...(baseStatus ? { baseStatus } : {}),
    conflict: earlier?.conflict ?? null,
  };
  await enqueueOutbox(op);
  await putObject(payload);
  removeFromObjectQueue(obj.id);
  await registerBackgroundSync();
  return payload;
}

export async function saveObjectSynced(
  user: SessionUser,
  remote: boolean,
  input: Partial<JobObject> & { id?: string },
): Promise<JobObject> {
  const id = input.id || newObjectId();
  const updatedAt = new Date().toISOString();
  const draft = stripObjectDocuments({ ...input, id, updatedAt });
  if (!remote) return upsertLocalObject({ ...draft, pendingSync: false }, user);

  if (loadToken() && navigator.onLine) {
    try {
      let obj: JobObject;
      if (input.id) {
        try {
          obj = await apiPatchObject(id, draft);
        } catch (err) {
          if (isApiError(err) && err.status === 404) obj = await apiCreateObject(draft);
          else throw err;
        }
      } else {
        obj = await apiCreateObject(draft);
      }
      await putObject({ ...obj, pendingSync: false });
      await removeOutbox(id);
      return obj;
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        saveToken(null);
        await rememberSession({ token: null, apiBase: apiBase(), userId: user.id });
      } else if (isApiError(err) && err.status !== 0 && err.status < 500 && err.status !== 408) {
        throw err;
      }
    }
  }
  if (isDemoModeEnabled() && !loadToken()) return upsertLocalObject({ ...draft, pendingSync: false }, user);
  return queueUpsert(user, draft);
}

export async function deleteObjectSynced(user: SessionUser, remote: boolean, id: string): Promise<void> {
  if (!remote) {
    deleteLocalObject(id, user);
    return;
  }
  const updatedAt = new Date().toISOString();
  if (loadToken() && navigator.onLine) {
    try {
      const res = await apiDeleteObject(id, updatedAt);
      if (res.conflict === 'server-newer' && res.object) {
        await putObject({ ...res.object, pendingSync: false });
      } else {
        await deleteStoredObject(id);
      }
      await removeOutbox(id);
      try {
        deleteLocalObject(id, user);
      } catch {
        /* local mirror is optional */
      }
      return;
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        saveToken(null);
        await rememberSession({ token: null, apiBase: apiBase(), userId: user.id });
      } else if (isApiError(err) && err.status !== 0 && err.status < 500 && err.status !== 408) {
        throw err;
      }
    }
  }
  try {
    deleteLocalObject(id, user);
  } catch {
    /* local copy may already be gone */
  }
  const payload = {
    id,
    orgId: user.orgId || '',
    updatedAt,
    createdAt: updatedAt,
    createdBy: user.id,
    assignedTo: null,
    status: 'draft' as const,
    clientName: '',
    clientPhone: '',
    address: '',
    city: '',
    room: {},
    estimate: null,
    clientSummary: '',
    history: [],
    pendingSync: true,
  };
  await enqueueOutbox({
    id,
    op: 'delete',
    updatedAt,
    userId: user.id,
    orgId: user.orgId || '',
    payload,
  });
  await deleteStoredObject(id);
  await registerBackgroundSync();
}

export async function flushOutbox(user: SessionUser, remote: boolean): Promise<'ok' | 'auth' | 'offline' | 'idle'> {
  if (!remote) return 'idle';
  if (!navigator.onLine) return 'offline';
  const token = loadToken();
  if (!token) return 'auth';
  // Запись с конфликтом этапа ждёт решения человека (resolveStageConflict).
  const mine = (await listOutbox()).filter((op) => op.userId === user.id && !op.conflict);
  if (!mine.length) return 'ok';
  for (const item of mine) {
    try {
      if (item.op === 'delete') {
        const res = await apiDeleteObject(item.id, item.updatedAt);
        if (res.conflict === 'server-newer' && res.object) await putObject(res.object);
        else await deleteStoredObject(item.id);
        await removeOutbox(item.id);
        continue;
      }
      const wire = withBaseStatus(stripObjectDocuments(item.payload), item);
      let obj: JobObject;
      try {
        obj = await apiPatchObject(item.id, wire);
      } catch (err) {
        if (isApiError(err) && err.status === 404) obj = await apiCreateObject(wire);
        else throw err;
      }
      await putObject({ ...obj, pendingSync: false });
      await removeOutbox(item.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        saveToken(null);
        await rememberSession({ token: null, apiBase: apiBase(), userId: user.id });
        return 'auth';
      }
      if (err instanceof ApiError && err.status === 409 && err.data?.code === 'stage_conflict') {
        const server = err.data.object as JobObject | undefined;
        if (server) await putObject({ ...server, pendingSync: true });
        await enqueueOutbox({
          ...item,
          conflict: { serverStatus: server?.status || '', message: err.message, at: new Date().toISOString() },
        });
        continue;
      }
      if (err instanceof ApiError && err.status === 403) continue;
      return 'offline';
    }
  }
  return 'ok';
}

/** Этап меняли без связи: сервер сравнит baseStatus со своим этапом. */
function withBaseStatus<T extends Partial<JobObject>>(wire: T, op: OutboxOp): T & { baseStatus?: string } {
  if (op.op !== 'upsert' || !op.baseStatus || !wire.status || wire.status === op.baseStatus) return wire;
  return { ...wire, baseStatus: op.baseStatus };
}

export type StageConflict = {
  objectId: string;
  roomName: string;
  myStatus: string;
  serverStatus: string;
  message: string;
};

export async function listStageConflicts(userId: string): Promise<StageConflict[]> {
  const rows = await listOutbox().catch(() => [] as OutboxOp[]);
  return rows
    .filter((op) => op.userId === userId && op.op === 'upsert' && op.conflict)
    .map((op) => ({
      objectId: op.id,
      roomName: op.payload.roomName || op.payload.clientName || 'Комната',
      myStatus: op.payload.status,
      serverStatus: op.conflict!.serverStatus,
      message: op.conflict!.message,
    }));
}

/**
 * Выбор человека при конфликте этапа.
 *  • mine — оставить свой этап: повтор уже от этапа сервера, остальные правки идут как были;
 *  • server — оставить этап сервера: этап из правки убирается, остальные правки (площадь, ответы) уходят.
 */
export async function resolveStageConflict(objectId: string, choice: 'mine' | 'server'): Promise<void> {
  const op = await getOutboxOp(objectId);
  if (!op || op.op !== 'upsert' || !op.conflict) return;
  const updatedAt = new Date().toISOString();
  const serverStatus = op.conflict.serverStatus as JobObject['status'];
  const payload: JobObject =
    choice === 'mine'
      ? { ...op.payload, updatedAt }
      : { ...op.payload, status: serverStatus || op.payload.status, updatedAt };
  await enqueueOutbox({
    ...op,
    updatedAt,
    payload,
    baseStatus: serverStatus || op.baseStatus,
    conflict: null,
  });
  await putObject({ ...payload, pendingSync: true });
}

export type DocFlushFailure = {
  objectId: string;
  versionId: string;
  filename: string;
  roomName: string;
  message: string;
  /** Окончательная: файл снят или ждёт «Убрать из очереди». */
  final: boolean;
};

export type DocFlushResult = {
  sent: number;
  failed: DocFlushFailure[];
  auth: boolean;
  offline: boolean;
};

/**
 * Отправка PDF из очереди. Окончательная ошибка (нет прав, нет комнаты, плохой или слишком
 * большой файл) снимает запись: PDF сметы, профиля и КП можно собрать заново. Сбой связи
 * оставляет запись для повтора. force — «Отправить сейчас»: пробуем и помеченные ошибкой.
 */
export async function flushDocumentQueue(opts: { force?: boolean } = {}): Promise<DocFlushResult> {
  const empty: DocFlushResult = { sent: 0, failed: [], auth: false, offline: false };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ...empty, offline: true };
  if (!loadToken()) return { ...empty, auth: true };
  const waiting = new Set(
    (await listOutbox()).filter((op) => op.op !== 'delete').map((op) => op.id),
  );
  const queued = peekObjectDocumentQueue().filter((doc) => {
    if (waiting.has(doc.objectId)) return false;
    if (opts.force) return true;
    return !doc.failed;
  });
  if (!queued.length) return empty;
  const groups = new Map<string, typeof queued>();
  for (const doc of queued) {
    const key = `${doc.objectId}::${doc.versionId}`;
    const list = groups.get(key) || [];
    list.push(doc);
    groups.set(key, list);
  }
  let sent = 0;
  const failed: DocFlushFailure[] = [];
  for (const [key, list] of groups) {
    const splitAt = key.indexOf('::');
    const objectId = key.slice(0, splitAt);
    const versionId = key.slice(splitAt + 2);
    const names = list.map((doc) => doc.filename).filter(Boolean).join(', ') || 'PDF';
    const roomName = list.find((doc) => doc.roomName)?.roomName || objectId;
    try {
      const updated = await apiUploadObjectDocuments(
        objectId,
        list.map((doc) => ({
          kind: doc.kind,
          filename: doc.filename,
          pdfBase64: doc.pdfBase64,
          hasScheme: doc.hasScheme,
          panels: doc.panels,
          areaM2: doc.areaM2,
          ...(doc.stamp ? { stamp: doc.stamp } : {}),
        })),
        versionId,
      );
      removeQueuedObjectDocuments(objectId, versionId);
      await putObject(withoutDocBytes({ ...updated, pendingSync: false }));
      sent += list.length;
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        return { sent, failed, auth: true, offline: false };
      }
      const status = isApiError(err) ? err.status : 0;
      const message = err instanceof Error ? err.message : 'Не удалось отправить PDF';
      if (isFinalHttpStatus(status)) {
        // Собираемые заново PDF снимаем сразу; иначе помечаем для «Убрать из очереди».
        const regenerable = list.every((doc) => isRegenerableDocumentKind(doc.kind));
        if (regenerable) {
          removeQueuedObjectDocuments(objectId, versionId);
          failed.push({ objectId, versionId, filename: names, roomName, message, final: true });
        } else {
          patchQueuedObjectDocuments(objectId, versionId, {
            failed: true,
            attempts: (list[0]?.attempts || 0) + 1,
            lastError: message,
            roomName,
          });
          failed.push({ objectId, versionId, filename: names, roomName, message, final: true });
        }
        continue;
      }
      // Сбой связи: пауза и повтор, остальные группы не трогаем в этом проходе.
      const bumped = afterFailure(
        { attempts: list[0]?.attempts || 0, nextAt: 0, failed: list[0]?.failed, lastError: list[0]?.lastError },
        Date.now(),
        message,
      );
      patchQueuedObjectDocuments(objectId, versionId, {
        attempts: bumped.attempts,
        failed: bumped.failed,
        lastError: bumped.lastError,
        roomName,
      });
      failed.push({
        objectId,
        versionId,
        filename: names,
        roomName,
        message,
        final: Boolean(bumped.failed),
      });
      return { sent, failed, auth: false, offline: status === 0 };
    }
  }
  return { sent, failed, auth: false, offline: false };
}

/** Keep PDF names on the offline object. Bytes stay in the document queue, not in the API body. */
export async function rememberObjectDocuments(
  object: JobObject,
  docs: JobObjectDocument[],
  user: SessionUser,
): Promise<JobObject> {
  const meta = docs.map((doc) => {
    if (doc.dataBase64) {
      try {
        saveLocalDocBytes(doc.id, doc.dataBase64);
      } catch {
        /* the upload queue still holds the file */
      }
    }
    const copy = { ...doc };
    delete copy.dataBase64;
    return copy;
  });
  const next = withoutDocBytes({
    ...object,
    documents: [...meta, ...(object.documents || [])].slice(0, 40),
  });
  await putObject(next);
  const op = (await listOutbox()).find((row) => row.id === object.id && row.op === 'upsert');
  if (op) {
    await enqueueOutbox({
      ...op,
      payload: withoutDocBytes({ ...op.payload, documents: next.documents, pendingSync: true }),
    });
  }
  try {
    appendLocalObjectDocuments(object.id, docs, user);
  } catch {
    /* local mirror is optional when the card lives in IndexedDB */
  }
  return next;
}

export type ProjectLoadResult = {
  projects: Project[];
  error: string | null;
  unavailable: boolean;
};

function routeMissing(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

const PROJECTS_UNAVAILABLE = 'Проекты на сервере пока недоступны';

async function visibleProjectQueue(user: SessionUser): Promise<ProjectOutboxOp[]> {
  const rows = await listProjectOutbox();
  return rows.filter((op) => op.userId === user.id);
}

export async function loadVisibleProjects(user: SessionUser, remote: boolean): Promise<ProjectLoadResult> {
  if (!remote || (isDemoModeEnabled() && !loadToken())) {
    return { projects: listLocalProjects(user), error: null, unavailable: false };
  }
  const queued = await visibleProjectQueue(user).catch(() => []);
  if (!loadToken() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    if (!projectsApiReady()) {
      return { projects: [], error: PROJECTS_UNAVAILABLE, unavailable: true };
    }
    const cached = loadCachedProjects();
    const stored = cached.length ? cached : await loadAllProjects().catch(() => []);
    return { projects: mergeProjects(stored, queued), error: null, unavailable: false };
  }
  try {
    const loaded = await apiListProjectsChecked();
    const list = loaded.projects;
    markProjectsApiReady(true);
    if (!loaded.notModified) {
      cacheProjects(list);
      await replaceServerProjects(list, user.orgId, user.role === 'admin');
    }
    return { projects: mergeProjects(list, queued), error: null, unavailable: false };
  } catch (err) {
    if (isApiError(err) && err.status === 401) {
      saveToken(null);
      await rememberSession({ token: null, apiBase: apiBase(), userId: user.id });
      return { projects: [], error: 'Нужно войти снова', unavailable: true };
    }
    if (isApiError(err) && routeMissing(err.status)) {
      markProjectsApiReady(false);
      return { projects: [], error: PROJECTS_UNAVAILABLE, unavailable: true };
    }
    return {
      projects: [],
      error: err instanceof Error ? err.message : PROJECTS_UNAVAILABLE,
      unavailable: true,
    };
  }
}

async function queueProject(user: SessionUser, project: Project): Promise<Project> {
  const op: ProjectOutboxOp = {
    id: project.id,
    op: 'upsert',
    updatedAt: project.updatedAt,
    userId: user.id,
    orgId: project.orgId,
    payload: project,
  };
  await enqueueProjectOutbox(op);
  await putProject(project);
  cacheProjects(mergeProjects(loadCachedProjects().filter((item) => item.id !== project.id), [op]));
  await registerBackgroundSync();
  return project;
}

export async function saveProjectSynced(
  user: SessionUser,
  remote: boolean,
  input: ProjectInput,
  id?: string,
): Promise<Project> {
  if (!remote || (isDemoModeEnabled() && !loadToken())) {
    return upsertLocalProject(id ? { ...input, id } : input, user);
  }
  const draft: ProjectInput = id ? { ...input, id } : input;
  if (loadToken() && (typeof navigator === 'undefined' || navigator.onLine)) {
    try {
      const project = id ? await apiUpdateProject(id, draft) : await apiCreateProject(draft);
      markProjectsApiReady(true);
      await putProject(project);
      if (project.id) await removeProjectOutbox(project.id);
      const cached = loadCachedProjects().filter((item) => item.id !== project.id);
      cacheProjects([project, ...cached]);
      return project;
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        saveToken(null);
        await rememberSession({ token: null, apiBase: apiBase(), userId: user.id });
        throw err;
      }
      if (isApiError(err) && routeMissing(err.status) && !id) {
        markProjectsApiReady(false);
        throw Object.assign(new Error(PROJECTS_UNAVAILABLE), { name: 'ProjectsUnavailableError' });
      }
      if (isApiError(err) && id && err.status === 404 && projectsApiReady()) throw err;
      if (isApiError(err) && routeMissing(err.status)) {
        markProjectsApiReady(false);
        throw Object.assign(new Error(PROJECTS_UNAVAILABLE), { name: 'ProjectsUnavailableError' });
      }
      if (isApiError(err) && err.status !== 0 && err.status < 500 && err.status !== 408) throw err;
    }
  }
  if (!projectsApiReady() && remote) {
    throw Object.assign(new Error(PROJECTS_UNAVAILABLE), { name: 'ProjectsUnavailableError' });
  }
  const local = upsertLocalProject(
    id ? { ...input, id } : { ...input, id: input.id || `prj_${Date.now().toString(36)}` },
    user,
  );
  return queueProject(user, local);
}

export async function flushProjectOutbox(
  user: SessionUser,
  remote: boolean,
): Promise<'ok' | 'auth' | 'offline' | 'idle' | 'unavailable'> {
  if (!remote) return 'idle';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  if (!loadToken()) return 'auth';
  const mine = await visibleProjectQueue(user);
  if (!mine.length) return 'ok';
  for (const item of mine) {
    try {
      let project: Project;
      try {
        project = await apiUpdateProject(item.id, item.payload);
      } catch (err) {
        if (isApiError(err) && err.status === 404) project = await apiCreateProject(item.payload);
        else throw err;
      }
      await putProject(project);
      await removeProjectOutbox(item.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return 'auth';
      if (err instanceof ApiError && routeMissing(err.status)) return 'unavailable';
      if (err instanceof ApiError && err.status === 403) continue;
      return 'offline';
    }
  }
  return 'ok';
}
