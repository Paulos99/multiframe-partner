/**
 * Online save, offline queue and flush.
 * Client ids are stable. A newer updatedAt wins; an older offline write is kept
 * in server history and does not erase the fresher record. A 401 leaves the outbox.
 */
import type { JobObject, SessionUser } from '../../../../packages/shared/partner';
import {
  ApiError,
  apiBase,
  apiCreateObject,
  apiDeleteObject,
  apiListObjects,
  apiPatchObject,
  isApiError,
} from './apiClient';
import {
  cacheObjects,
  deleteLocalObject,
  loadCachedObjects,
  listLocalObjects,
  loadToken,
  presentCachedObject,
  removeFromObjectQueue,
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
  const merged = mergeObjects(base, outbox);
  return merged
    .map((obj) => presentCachedObject(user, obj))
    .filter((obj): obj is JobObject => obj != null);
}

async function queueUpsert(user: SessionUser, draft: Partial<JobObject> & { id: string; updatedAt: string }) {
  const obj = upsertLocalObject(draft, user);
  const payload: JobObject = { ...obj, pendingSync: true };
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
  const draft = { ...input, id, updatedAt };
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
      let obj: JobObject;
      try {
        obj = await apiPatchObject(item.id, item.payload);
      } catch (err) {
        if (isApiError(err) && err.status === 404) obj = await apiCreateObject(item.payload);
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
