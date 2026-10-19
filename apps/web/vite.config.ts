import { defineConfig, type Plugin } from 'vite';
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { ICON_FILES, MANIFEST_ICONS } from './src/pwa/icons';

const base = process.env.VITE_BASE || '/';

/**
 * Ресурсы pdf.js (CMap, стандартные шрифты, wasm-декодеры, ICC) рядом с сайтом в /pdfjs/.
 * Без них PDF с невстроенными шрифтами или JPEG2000-картинками рисуется с ошибками.
 * В кэш PWA не попадают (globIgnores) — грузятся по требованию.
 */
function pdfjsAssets(): Plugin {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), 'node_modules/pdfjs-dist');
  const dirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
  const skip = (src: string) => /quickjs/i.test(src);
  let outDir = 'dist';
  return {
    name: 'mf-pdfjs-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url || '').split('?')[0] || '');
        const at = path.indexOf('/pdfjs/');
        if (at < 0) return next();
        const rel = normalize(path.slice(at + '/pdfjs/'.length));
        const top = rel.split(/[\\/]/)[0] || '';
        const file = join(root, rel);
        if (!dirs.includes(top) || rel.includes('..') || skip(file) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      for (const dir of dirs) {
        cpSync(join(root, dir), join(outDir, 'pdfjs', dir), { recursive: true, filter: (src) => !skip(src) });
      }
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    pdfjsAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'logo-stp.png',
        'logo-multiframe.png',
        'og-share.jpg',
        ...Object.keys(ICON_FILES),
        'sw-sync.js',
      ],
      manifest: {
        name: 'MultiFrame · Кабинет партнёра',
        short_name: 'MF Партнёр',
        description: 'Проблемомер и калькулятор для коммерческих партнёров',
        theme_color: '#01644f',
        background_color: '#f4f7f6',
        display: 'standalone',
        lang: 'ru',
        start_url: base,
        scope: base,
        icons: MANIFEST_ICONS,
      },
      workbox: {
        navigateFallback: `${base}index.html`.replace(/\/+/g, '/'),
        // Don't hijack the partner calculator SPA under /calculator/
        navigateFallbackDenylist: [/^\/.*calculator(?:\/|$)/i],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2,mp3}'],
        // pdf.js: воркер и декодеры большие и нужны только при открытии PDF.
        globIgnores: ['pdfjs/**', '**/pdf.worker*.mjs', '**/pdf.worker*.js'],
        importScripts: ['sw-sync.js'],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5174,
  },
});
