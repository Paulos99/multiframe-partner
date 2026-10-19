import { describe, it, expect } from 'vitest';
import { materialName, thumbnailSource, thumbSize, THUMB_MAX_HEIGHT, THUMB_WIDTH } from './materialThumbnails';

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
