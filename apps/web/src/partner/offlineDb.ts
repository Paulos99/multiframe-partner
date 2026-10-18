/**
 * IndexedDB cache and outbox for the partner PWA.
 * Objects, calculations and analytics events survive reloads without a network.
 * The outbox is not cleared on logout or on 401 — a later login flushes it.
 */
import type { AnalyticsEvent, JobObject, Project } from '../../../../packages/shared/partner';

const DB_NAME = 'mf-partner-offline';
const DB_VERSION = 2;

export type OutboxOp = {
  id: string;
  op: 'upsert' | 'delete';
  updatedAt: string;
  userId: string;
  orgId: string;
  payload: JobObject;
};

export type ProjectOutboxOp = {
  id: string;
  op: 'upsert';
  updatedAt: string;
  userId: string;
  orgId: string;
  payload: Project;
};

export type CachedCalculation = {
  id: string;
  at: string;
  tool: 'problemomer' | 'calculator';
  action: string;
  login: string;
  companyName: string;
  orgId: string | null;
  userId: string | null;
  areaM2: number | null;
  panels: number | null;
  label: string | null;
};

export type OfflineSessionMeta = {
  token: string | null;
  apiBase: string;
  userId: string | null;
};

type CalcInput = {
  id: string;
  at: string;
  tool: string;
  action: string;
  login: string;
  companyName: string;
  orgId: string | null;
  userId: string | null;
  object?: {
    areaM2?: number | null;
    panels?: number | null;
    label?: string | null;
    roomType?: string | null;
  } | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('objects')) db.createObjectStore('objects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('calculations')) {
        db.createObjectStore('calculations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('analytics')) {
        db.createObjectStore('analytics', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('projectOutbox')) {
        db.createObjectStore('projectOutbox', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB'));
  });
}

async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(store, 'readonly');
  const req = tx.objectStore(store).getAll();
  const rows = await new Promise<T[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return rows;
}

async function putRow(store: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
}

async function deleteRow(store: string, id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

export function newObjectId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 10);
  return `obj_${rand}${Date.now().toString(36).slice(-4)}`;
}

export async function putObject(obj: JobObject): Promise<void> {
  await putRow('objects', obj);
}

export async function deleteStoredObject(id: string): Promise<void> {
  await deleteRow('objects', id);
}

export async function loadAllObjects(): Promise<JobObject[]> {
  return getAll<JobObject>('objects');
}

/** Replace the server snapshot but keep rows that are still waiting in the outbox. */
export async function replaceServerObjects(next: JobObject[], orgId: string | null, isAdmin: boolean): Promise<void> {
  const existing = await getAll<JobObject>('objects');
  const pending = new Set((await getAll<OutboxOp>('outbox')).map((op) => op.id));
  const nextIds = new Set(next.map((o) => o.id));
  const db = await openDb();
  const tx = db.transaction('objects', 'readwrite');
  const store = tx.objectStore('objects');
  for (const obj of existing) {
    const sameScope = isAdmin || (orgId != null && obj.orgId === orgId);
    if (sameScope && !nextIds.has(obj.id) && !pending.has(obj.id)) store.delete(obj.id);
  }
  for (const obj of next) store.put({ ...obj, pendingSync: false });
  await txDone(tx);
}

export async function listOutbox(): Promise<OutboxOp[]> {
  const rows = await getAll<OutboxOp>('outbox');
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
}

export async function enqueueOutbox(op: OutboxOp): Promise<void> {
  await putRow('outbox', op);
}

export async function removeOutbox(id: string): Promise<void> {
  await deleteRow('outbox', id);
}

export async function putProject(project: Project): Promise<void> {
  await putRow('projects', project);
}

export async function loadAllProjects(): Promise<Project[]> {
  return getAll<Project>('projects');
}

/** Снимок сервера. Локальные проекты в очереди не стираются. */
export async function replaceServerProjects(
  next: Project[],
  orgId: string | null,
  isAdmin: boolean,
): Promise<void> {
  const existing = await getAll<Project>('projects');
  const pending = new Set((await getAll<ProjectOutboxOp>('projectOutbox')).map((op) => op.id));
  const nextIds = new Set(next.map((project) => project.id));
  const db = await openDb();
  const tx = db.transaction('projects', 'readwrite');
  const store = tx.objectStore('projects');
  for (const project of existing) {
    const sameScope = isAdmin || (orgId != null && project.orgId === orgId);
    if (sameScope && !nextIds.has(project.id) && !pending.has(project.id)) store.delete(project.id);
  }
  for (const project of next) store.put(project);
  await txDone(tx);
}

export async function listProjectOutbox(): Promise<ProjectOutboxOp[]> {
  const rows = await getAll<ProjectOutboxOp>('projectOutbox');
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
}

export async function enqueueProjectOutbox(op: ProjectOutboxOp): Promise<void> {
  await putRow('projectOutbox', op);
}

export async function removeProjectOutbox(id: string): Promise<void> {
  await deleteRow('projectOutbox', id);
}

export function mergeProjects(base: Project[], outbox: ProjectOutboxOp[]): Project[] {
  const map = new Map(base.map((project) => [project.id, project]));
  for (const op of outbox) {
    const cur = map.get(op.id);
    if (!cur || op.updatedAt >= (cur.updatedAt || '')) map.set(op.id, op.payload);
  }
  return [...map.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function mergeObjects(base: JobObject[], outbox: OutboxOp[]): JobObject[] {
  const map = new Map(base.map((o) => [o.id, o]));
  for (const op of outbox) {
    if (op.op === 'delete') {
      const cur = map.get(op.id);
      if (!cur || op.updatedAt >= (cur.updatedAt || '')) map.delete(op.id);
      continue;
    }
    const cur = map.get(op.id);
    if (!cur || op.updatedAt >= (cur.updatedAt || '')) {
      map.set(op.id, { ...op.payload, pendingSync: true, updatedAt: op.updatedAt });
    }
  }
  return [...map.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

async function trimStore(store: string, max: number, stamp: (row: { at?: string }) => string): Promise<void> {
  const rows = await getAll<{ id: string; at?: string }>(store);
  if (rows.length <= max) return;
  const extra = [...rows].sort((a, b) => (stamp(a) < stamp(b) ? 1 : -1)).slice(max);
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const obj = tx.objectStore(store);
  for (const row of extra) obj.delete(row.id);
  await txDone(tx);
}

export async function cacheAnalyticsEvents(events: AnalyticsEvent[]): Promise<void> {
  if (!events.length) return;
  const db = await openDb();
  const tx = db.transaction('analytics', 'readwrite');
  const store = tx.objectStore('analytics');
  for (const event of events) {
    if (event?.id) store.put(event);
  }
  await txDone(tx);
  await trimStore('analytics', 2000, (row) => row.at || '');
}

export async function loadCachedAnalyticsEvents(): Promise<AnalyticsEvent[]> {
  return getAll<AnalyticsEvent>('analytics');
}

export async function rememberCalculation(event: CalcInput): Promise<void> {
  if (event.action !== 'result' && event.action !== 'calc_done') return;
  const row: CachedCalculation = {
    id: event.id,
    at: event.at,
    tool: event.tool === 'calculator' ? 'calculator' : 'problemomer',
    action: event.action,
    login: event.login,
    companyName: event.companyName,
    orgId: event.orgId,
    userId: event.userId,
    areaM2: event.object?.areaM2 ?? null,
    panels: event.object?.panels ?? null,
    label: event.object?.label || event.object?.roomType || null,
  };
  await putRow('calculations', row);
  await trimStore('calculations', 200, (item) => item.at || '');
}

export async function loadCalculationsFor(user: {
  id: string;
  orgId: string | null;
  role: string;
}): Promise<CachedCalculation[]> {
  const all = await getAll<CachedCalculation>('calculations');
  return all
    .filter((c) => {
      if (user.role === 'admin') return true;
      if (user.orgId && c.orgId === user.orgId) return true;
      return c.userId === user.id;
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 30);
}

export async function rememberSession(meta: OfflineSessionMeta): Promise<void> {
  await putRow('meta', { key: 'session', value: meta });
}

export async function readSessionMeta(): Promise<OfflineSessionMeta | null> {
  const db = await openDb();
  const tx = db.transaction('meta', 'readonly');
  const req = tx.objectStore('meta').get('session');
  const row = await new Promise<{ value?: OfflineSessionMeta } | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as { value?: OfflineSessionMeta } | undefined);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return row?.value ?? null;
}

export async function registerBackgroundSync(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const syncManager = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (syncManager) await syncManager.register('mf-outbox');
  } catch {
    /* Background Sync is optional; the online event still flushes. */
  }
}
