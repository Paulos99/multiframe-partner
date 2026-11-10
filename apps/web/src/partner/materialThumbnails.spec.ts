import { describe, it, expect } from 'vitest';
import {
  BACKFILL_MAX_BYTES,
  backfillMaterialThumbnails,
  materialName,
  resetThumbnailBackfill,
  thumbnailBackfillPlan,
  thumbnailSource,
  thumbSize,
  THUMB_MAX_HEIGHT,
  THUMB_WIDTH,
} from './materialThumbnails';

describe('material thumbnails', () => {
  it('scales wide sources down to 480 px and keeps the aspect ratio', () => {
    expect(thumbSize(1920, 1080)).toEqual({ width: 480, height: 270, scale: 0.25 });
  });
  it('never upscales small sources', () => {
    expect(thumbSize(200, 100)).toEqual({ width: 200, height: 100, scale: 1 });
  });
  it('crops tall pages to the max height', () => {
    const s = thumbSize(1240, 1754 * 3);
    expect(s.width).toBe(THUMB_WIDTH);
    expect(s.height).toBe(THUMB_MAX_HEIGHT);
  });
  it('falls back to a square for unknown sizes', () => {
    expect(thumbSize(0, 0)).toEqual({ width: 480, height: 480, scale: 1 });
  });
  it('builds thumbnails only for images, video and PDF', () => {
    expect(thumbnailSource('image')).toBe('image');
    expect(thumbnailSource('video')).toBe('video');
    expect(thumbnailSource('pdf')).toBe('pdf');
    expect(thumbnailSource('docx')).toBeNull();
    expect(thumbnailSource('other')).toBeNull();
  });
  it('cleans names like the API', () => {
    expect(materialName('  a/b\\\\c   d.pdf ')).toBe('a b c d.pdf');
  });
});

describe('thumbnail backfill (files uploaded without the admin window)', () => {
  const base = { parentId: null, stub: null, hasPreview: false, hasStream: false, streamSize: null, section: null, builtin: null, description: null, updatedAt: '2026-11-10T00:00:00Z' };
  const file = (id: string, name: string, mime: string, extra: Record<string, unknown> = {}) =>
    ({ ...base, id, kind: 'file', name, mime, size: 1000, hasFile: true, hasThumbnail: false, ...extra }) as never;

  it('plans pdf, images, videos and docx with a pdf copy; skips ready, builtin, huge and empty files', () => {
    const items = [
      file('a', 'Каталог.pdf', 'application/pdf'),
      file('b', 'Фото.jpg', 'image/jpeg'),
      file('c', 'Ролик.mp4', 'video/mp4', { size: 900 * 1024 * 1024 }),
      file('d', 'Регламент.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { hasPreview: true }),
      file('e', 'Без копии.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      file('f', 'Готово.pdf', 'application/pdf', { hasThumbnail: true }),
      file('g', 'Роль.mp4', 'video/mp4', { builtin: 'owner' }),
      file('h', 'Огромный.pdf', 'application/pdf', { size: BACKFILL_MAX_BYTES + 1 }),
      file('i', 'Заглушка.pdf', 'application/pdf', { hasFile: false }),
      { ...base, id: 'z', kind: 'folder', name: 'Папка', mime: null, size: null, hasFile: false, hasThumbnail: false } as never,
    ];
    expect(thumbnailBackfillPlan(items).map((s) => [s.item.id, s.from])).toEqual([
      ['a', 'pdf'],
      ['b', 'image'],
      ['c', 'video'],
      ['d', 'pdf-copy'],
    ]);
    expect(thumbnailBackfillPlan(items, new Set(['a', 'c'])).map((s) => s.item.id)).toEqual(['b', 'd']);
  });

  it('uploads one by one, survives failures and does not retry the same files', async () => {
    resetThumbnailBackfill();
    const items = [file('a', 'a.pdf', 'application/pdf'), file('b', 'b.pdf', 'application/pdf'), file('c', 'c.jpg', 'image/jpeg')];
    const built: string[] = [];
    const uploaded: string[] = [];
    const lists: unknown[] = [];
    const deps = {
      build: async (s: { item: { id: string } }) => {
        built.push(s.item.id);
        return s.item.id === 'b' ? null : new Blob(['x'], { type: 'image/webp' });
      },
      upload: async (id: string) => {
        if (id === 'c') throw new Error('403');
        uploaded.push(id);
        return [{ id, hasThumbnail: true }] as never;
      },
    };
    expect(await backfillMaterialThumbnails(items, (l) => lists.push(l), deps as never)).toBe(1);
    expect(built).toEqual(['a', 'b', 'c']);
    expect(uploaded).toEqual(['a']);
    expect(lists).toHaveLength(1);
    expect(await backfillMaterialThumbnails(items, () => {}, deps as never)).toBe(0);
    expect(built).toHaveLength(3);
  });
});
