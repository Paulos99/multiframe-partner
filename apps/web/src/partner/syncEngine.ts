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
  apiListObjects,
  apiListProjects,
  apiPatchObject,
  apiUpdateProject,
  apiUploadObjectDocuments,
  isApiError,
  stripObjectDocuments,
} from './apiClient';
import {
  appendLocalObjectDocuments,
  cacheObjects,
  cacheProjects,
  deleteLocalObject,
  listLocalProjects,
  loadCachedObjects,
  loadCachedProjects,
  listLocalObjects,
  loadToken,
  markProjectsApiReady,
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
  if (!remote) {
    base = listLocalObjects(user);
  } else if (loadToken() && navigator.onLine) {
    try {
      base = await apiListObjects();
      await replaceServerObjects(base, user.orgId, user.role === 'admin');
      cacheObjects(base);
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
  }
  const merged = withQueuedDocuments(mergeObjects(base, outbox));
  return merged
    .map((obj) => presentCachedObject(user, obj))
    .filter((obj): obj is JobObject => obj != null);
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
  const obj = upsertLocalObject(withoutDocBytes(draft as JobObject), user);
  const payload: JobObject = withoutDocBytes({ ...obj, pendingSync: true });
  const op: OutboxOp = {
    id: obj.id,
    op: 'upsert',
    updatedAt: obj.updatedAt,
    userId: user.id,
    orgId: obj.orgId,
    payload,
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
  if (!remote) return upsertLocalObject(draft, user);

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
  const mine = (await listOutbox()).filter((op) => op.userId === user.id);
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
      const wire = stripObjectDocuments(item.payload);
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
      if (err instanceof ApiError && err.status === 403) continue;
      return 'offline';
    }
  }
  return 'ok';
}

/** Upload calculator PDFs after the object itself is on the server. */
export async function flushDocumentQueue(): Promise<void> {
  if (!navigator.onLine || !loadToken()) return;
  const waiting = new Set(
    (await listOutbox()).filter((op) => op.op !== 'delete').map((op) => op.id),
  );
  const docs = peekObjectDocumentQueue().filter((doc) => !waiting.has(doc.objectId));
  const groups = new Map<string, typeof docs>();
  for (const doc of docs) {
    const key = `${doc.objectId}::${doc.versionId}`;
    const list = groups.get(key) || [];
    list.push(doc);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    const splitAt = key.indexOf('::');
    const objectId = key.slice(0, splitAt);
    const versionId = key.slice(splitAt + 2);
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
        })),
        versionId,
      );
      removeQueuedObjectDocuments(objectId, versionId);
      await putObject(withoutDocBytes({ ...updated, pendingSync: false }));
    } catch (err) {
      if (isApiError(err) && err.status === 401) return;
      break;
    }
  }
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
  if (!remote) {
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
    const list = await apiListProjects();
    markProjectsApiReady(true);
    cacheProjects(list);
    await replaceServerProjects(list, user.orgId, user.role === 'admin');
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
  if (!remote) return upsertLocalProject(id ? { ...input, id } : input, user);
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
