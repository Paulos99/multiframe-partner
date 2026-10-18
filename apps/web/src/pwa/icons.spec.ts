import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ICON_FILES, MANIFEST_ICONS } from './icons';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const indexHtml = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');

function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(publicDir + file);
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('app icons', () => {
  it('every manifest icon exists with the declared dimensions', () => {
    for (const icon of MANIFEST_ICONS) {
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(icon.src), icon.src).toEqual({ w, h });
    }
    expect(MANIFEST_ICONS.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true);
    expect(MANIFEST_ICONS.some((i) => i.purpose === 'any' && i.sizes === '192x192')).toBe(true);
  });

  it('every icon file exists and PNGs are square at the expected size', () => {
    for (const [file, size] of Object.entries(ICON_FILES)) {
      expect(existsSync(publicDir + file), file).toBe(true);
      if (size) expect(pngSize(file), file).toEqual({ w: size, h: size });
    }
  });

  it('favicon.ico carries 16, 32 and 48 px images', () => {
    const b = readFileSync(publicDir + 'favicon.ico');
    expect(b.readUInt16LE(2)).toBe(1); // type = icon
    const n = b.readUInt16LE(4);
    const sizes = Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((a, c) => a - c);
    expect(sizes).toEqual([16, 32, 48]);
  });

  it('index.html links only to icon files that exist', () => {
    const hrefs = [...indexHtml.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map(
      (m) => /href="\.\/([^"]+)"/.exec(m[0])?.[1],
    );
    expect(hrefs).toEqual(
      expect.arrayContaining(['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png']),
    );
    for (const h of hrefs) expect(h && existsSync(publicDir + h), String(h)).toBe(true);
    expect(indexHtml).not.toMatch(/pwa-(192|512|maskable)/);
  });
});
