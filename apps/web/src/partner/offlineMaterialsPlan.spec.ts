import { describe, expect, it } from 'vitest';
import type { PublicMaterial } from '../../../api/materialsLib.js';
import {
  chunkCount,
  chunkRange,
  formatBytes,
  isQuotaError,
  offlineTarget,
  offlineVersion,
  OFFLINE_CHUNK_BYTES,
  planOfflineSync,
  type OfflineEntry,
} from './offlineMaterialsPlan';

const T = '2026-10-18T20:00:00.000Z';
const file = (id: string, extra: Partial<PublicMaterial> = {}): PublicMaterial => ({
  id,
  parentId: null,
  kind: 'file',
  name: `${id}.pdf`,
  mime: 'application/pdf',
  size: 1000,
  stub: null,
  hasFile: true,
  updatedAt: T,
  ...extra,
});
const entry = (item: PublicMaterial, extra: Partial<OfflineEntry> = {}): OfflineEntry => ({
  id: item.id,
  version: offlineVersion(item),
  name: item.name,
  mime: item.mime || '',
  bytes: offlineTarget(item).bytes ?? 0,
  chunksDone: 1,
  chunkBytes: OFFLINE_CHUNK_BYTES,
  done: true,
  stream: offlineTarget(item).stream,
  thumb: false,
  ...extra,
});

describe('офлайн-копии: план синхронизации', () => {
  it('видео с лёгкой копией сохраняется копией, без копии — оригиналом', () => {
    expect(offlineTarget(file('v', { mime: 'video/mp4', size: 627921319, hasStream: true, streamSize: 123299000 }))).toEqual({ bytes: 123299000, stream: true });
    expect(offlineTarget(file('v', { mime: 'video/mp4', size: 627921319 }))).toEqual({ bytes: 627921319, stream: false });
  });

  it('качает новые, пропускает готовые, удаляет убранные и изменённые', () => {
    const a = file('a');
    const b = file('b');
    const c = file('c', { updatedAt: '2026-10-19T00:00:00.000Z' });
    const folder: PublicMaterial = { ...file('f'), kind: 'folder', hasFile: false, size: null };
    const stub = file('s', { hasFile: false, stub: 'deck-product' });
    const oldC = entry(file('c'));
    const plan = planOfflineSync([a, b, c, folder, stub], { a: entry(a), c: oldC, gone: entry(file('gone')) });
    expect(plan.download.map((i) => i.id)).toEqual(['b', 'c']);
    expect(plan.remove.sort()).toEqual(['c', 'gone']);
    expect(plan.files).toBe(3);
    expect(plan.bytesTotal).toBe(3000);
    expect(plan.bytesToFetch).toBe(2000);
  });

  it('появилась лёгкая копия видео — старый оригинал заменяется копией', () => {
    const before = file('v', { mime: 'video/mp4', size: 600 });
    const after = { ...before, hasStream: true, streamSize: 100 };
    const plan = planOfflineSync([after], { v: entry(before) });
    expect(plan.remove).toEqual(['v']);
    expect(plan.download.map((i) => i.id)).toEqual(['v']);
    expect(plan.bytesToFetch).toBe(100);
  });

  it('сначала мелкие файлы, большие видео — в конце', () => {
    const big = file('v', { mime: 'video/mp4', size: 600, hasStream: true, streamSize: 300 });
    const small = file('p', { size: 10 });
    const mid = file('d', { size: 200 });
    expect(planOfflineSync([big, small, mid], {}).download.map((i) => i.id)).toEqual(['p', 'd', 'v']);
  });

  it('недокачанный файл докачивается с места обрыва', () => {
    const big = file('big', { size: OFFLINE_CHUNK_BYTES * 3 + 5 });
    const plan = planOfflineSync([big], { big: entry(big, { done: false, chunksDone: 2 }) });
    expect(plan.download.map((i) => i.id)).toEqual(['big']);
    expect(plan.remove).toEqual([]);
    expect(plan.bytesToFetch).toBe(OFFLINE_CHUNK_BYTES + 5);
  });

  it('куски по 8 МБ без перекрытий', () => {
    const size = OFFLINE_CHUNK_BYTES * 2 + 10;
    expect(chunkCount(size)).toBe(3);
    expect(chunkRange(0, size)).toEqual({ start: 0, end: OFFLINE_CHUNK_BYTES - 1 });
    expect(chunkRange(2, size)).toEqual({ start: OFFLINE_CHUNK_BYTES * 2, end: size - 1 });
    expect(chunkCount(0)).toBe(1);
  });

  it('размеры и ошибка квоты', () => {
    expect(formatBytes(123299000)).toBe('118 МБ');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2,5 ГБ');
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error('x'))).toBe(false);
  });
});
