/**
 * Запись кабинетов только в коммерческий API.
 * Локально живут очередь и снимок последнего ответа — не источник истины.
 */

import { apiBase } from '../apiClient';
import { loadToken } from '../localStore';
import { fieldHeaders, isCalcConflict, type CrewRoom, type MeasureRoom } from './fieldModel';

const OUTBOX = 'mf-field-outbox-v1';
const CACHE = 'mf-field-cache-v1';

export type FieldOp = {
  id: string;
  path: string;
  body: unknown;
  ifMatch: string | null;
  idempotencyKey: string;
  roomId: string;
};

export type FieldResponse = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  queued: boolean;
};

export type FieldCache = {
  at: string;
  deals?: Array<{ id: string; projectId: string; rooms: MeasureRoom[] }>;
  rooms?: CrewRoom[];
};

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readOutbox(): FieldOp[] {
  const raw = storage()?.getItem(OUTBOX);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FieldOp[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: FieldOp[]) {
  storage()?.setItem(OUTBOX, JSON.stringify(items));
}

export function enqueueFieldOp(op: FieldOp) {
  const items = readOutbox().filter((item) => item.idempotencyKey !== op.idempotencyKey);
  items.push(op);
  writeOutbox(items);
}

export function dropFieldOp(idempotencyKey: string) {
  writeOutbox(readOutbox().filter((item) => item.idempotencyKey !== idempotencyKey));
}

export function readFieldCache(): FieldCache | null {
  const raw = storage()?.getItem(CACHE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FieldCache;
  } catch {
    return null;
  }
}

export function writeFieldCache(patch: Partial<FieldCache>) {
  const prev = readFieldCache() || { at: '' };
  storage()?.setItem(CACHE, JSON.stringify({ ...prev, ...patch, at: new Date().toISOString() }));
}

async function send(path: string, init: RequestInit): Promise<FieldResponse> {
  const base = apiBase();
  if (!base) {
    return { ok: false, status: 0, body: { message: 'Кабинет не подключён к серверу' }, queued: false };
  }
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  const token = loadToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${base}${path}`, { ...init, headers, cache: 'no-store' });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body, queued: false };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: { message: err instanceof Error ? err.message : 'Нет сети' },
      queued: false,
    };
  }
}

export async function fieldGet(path: string): Promise<FieldResponse> {
  return send(path, { method: 'GET', headers: fieldHeaders({}) });
}

export async function fieldPost(
  path: string,
  body: unknown,
  opts: { ifMatch?: string | null; idempotencyKey: string; roomId: string },
): Promise<FieldResponse> {
  const result = await send(path, {
    method: 'POST',
    headers: fieldHeaders({ idempotencyKey: opts.idempotencyKey, ifMatch: opts.ifMatch }),
    body: JSON.stringify(body ?? {}),
  });
  if (result.status === 0 && apiBase()) {
    enqueueFieldOp({
      id: opts.idempotencyKey,
      path,
      body,
      ifMatch: opts.ifMatch || null,
      idempotencyKey: opts.idempotencyKey,
      roomId: opts.roomId,
    });
    return {
      ...result,
      queued: true,
      body: { message: 'Сохранено на устройстве. На сервере ещё нет.' },
    };
  }
  if (result.ok) dropFieldOp(opts.idempotencyKey);
  return result;
}

export async function flushFieldOutbox(): Promise<FieldResponse | null> {
  const items = readOutbox();
  let last: FieldResponse | null = null;
  for (const item of items) {
    const result = await send(item.path, {
      method: 'POST',
      headers: fieldHeaders({ idempotencyKey: item.idempotencyKey, ifMatch: item.ifMatch }),
      body: JSON.stringify(item.body ?? {}),
    });
    last = result;
    if (result.status === 0) return { ...result, queued: true };
    if (isCalcConflict(result.body)) {
      dropFieldOp(item.idempotencyKey);
      return result;
    }
    if (result.ok) {
      dropFieldOp(item.idempotencyKey);
      continue;
    }
    return result;
  }
  return last;
}

export function roomVersion(body: Record<string, unknown>): number | null {
  const room = body.room;
  if (!room || typeof room !== 'object') return null;
  const version = (room as { recordVersion?: number }).recordVersion;
  return version == null ? null : Number(version);
}
