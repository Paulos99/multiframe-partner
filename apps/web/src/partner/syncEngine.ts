/**
 * Online save, offline queue and flush.
 * Client ids are stable. A newer updatedAt wins; an older offline write is kept
 * in server history and does not erase the fresher record. A 401 leaves the outbox.
 */
import type { JobObject, JobObjectDocument, SessionUser } from '../../../../packages/shared/partner';
import {
  ApiError,
  apiBase,
  apiCreateObject,
  apiDeleteObject,
  apiListObjects,
  apiPatchObject,
  apiUploadObjectDocuments,
  isApiError,
  stripObjectDocuments,
} from './apiClient';
import {
  appendLocalObjectDocuments,
  cacheObjects,
  deleteLocalObject,
  loadCachedObjects,
  listLocalObjects,
  loadToken,
  peekObjectDocumentQueue,
  presentCachedObject,
  removeFromObjectQueue,
  removeQueuedObjectDocuments,
  saveLocalDocBytes,
  saveToken,
  upsertLocalObject,
} from './localStore';
import {
  deleteStoredObject,
  enqueueOutbox,
  listOutbox,
  loadAllObjects,
  mergeObjects,
  newObjectId,
  putObject,
  registerBackgroundSync,
  rememberSession,
  removeOutbox,
  replaceServerObjects,
  type OutboxOp,
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
