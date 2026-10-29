import { defineConfig, type Plugin } from 'vite';
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { ICON_FILES, MANIFEST_ICONS } from './src/pwa/icons';

const base = process.env.VITE_BASE || '/';

/** Один номер на сборку: в бандле (__BUILD_ID__) и в version.json рядом с сайтом. */
const BUILD_ID =
  (process.env.GITHUB_SHA || '').slice(0, 12) || `local-${Date.now().toString(36)}`;

function buildVersionFile(): Plugin {
  return {
    name: 'mf-build-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ id: BUILD_ID }),
      });
    },
  };
}

/**
 * Ресурсы pdf.js (CMap, стандартные шрифты, wasm-декодеры, ICC) рядом с сайтом в /pdfjs/.
 * Без них PDF с невстроенными шрифтами или JPEG2000-картинками рисуется с ошибками.
 * В кэш PWA не попадают (globIgnores) — грузятся по требованию.
 */
/**
 * Уже установленный Workbox переживает Ctrl+Shift+R и в dev отдаёт старый precache.
 * В vite dev по /sw.js и /dev-sw.js отдаём worker, который сам снимает регистрацию.
 */
function devServiceWorkerKiller(): Plugin {
  const script = `self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (key) { return caches.delete(key); }));
    await self.registration.unregister();
    var clients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(clients.map(function (client) { return client.navigate(client.url); }));
  })());
});
`;
  return {
    name: 'mf-dev-sw-killer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url || '').split('?')[0] || '');
        if (path !== '/sw.js' && path !== '/dev-sw.js') return next();
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(script);
      });
    },
  };
}

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

export default defineConfig(({ command }) => ({
  base,
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev') },
  plugins: [
    react(),
    buildVersionFile(),
    pdfjsAssets(),
    devServiceWorkerKiller(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      selfDestroying: process.env.VITE_DEMO_MODE === 'true',
      devOptions: { enabled: false },
      includeAssets: [
        'logo-stp.png',
        'logo-multiframe.png',
        ...Object.keys(ICON_FILES),
        'sw-sync.js',
      ],
      manifest: {
        name: 'MultiFrame · Кабинет партнёра',
        short_name: 'MF Партнёр',
        description: 'Партнёрская сеть StP MultiFrame',
        theme_color: '#01644f',
        background_color: '#f4f7f6',
        display: 'standalone',
        lang: 'ru',
        start_url: base,
        scope: base,
        icons: MANIFEST_ICONS,
      },
      workbox: {
        // Новая версия включается сразу: без ожидания закрытия вкладок и без вопросов.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Страницы (index.html) — «сеть сначала» ниже, а не из предкэша: после выкладки открывается свежая.
        navigateFallback: null,
        // Ответы API (вход, /auth/me, материалы) service worker не кэширует: он не трогает запросы чужого origin.
        globPatterns: ['**/*.{js,css,ico,png,svg,jpg,jpeg,webp,woff2,mp3}'],
        // pdf.js: воркер и декодеры большие и нужны только при открытии PDF.
        globIgnores: ['pdfjs/**', '**/pdf.worker*.mjs', '**/pdf.worker*.js'],
        importScripts: ['sw-sync.js'],
        // pdf.js (воркер, шрифты, wasm) не в precache — кладём в кэш при первом использовании,
        // чтобы PDF из офлайн-копий открывались без сети. Только свой сайт: файлы из бакета
        // (видео с Range) service worker не трогает.
        runtimeCaching: [
          {
            // Переходы по страницам сайта: сеть первой (до 4 с), офлайн — последняя удачная копия.
            // Калькулятор /calculator/ — отдельное приложение, его worker не подменяет.
            urlPattern: ({ request, url, sameOrigin }) =>
              request.mode === 'navigate' && sameOrigin && !/calculator(?:\/|$)/i.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mf-pages-v1',
              networkTimeoutSeconds: 4,
              plugins: [
                {
                  // Один ключ на все адреса приложения (?demo=1, ?_v=…, #-маршруты): офлайн открывается эта копия.
                  cacheKeyWillBeUsed: async () => (globalThis as unknown as { registration: { scope: string } }).registration.scope,
                },
              ],
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && (url.pathname.includes('/pdfjs/') || /\/assets\/pdf\.worker[^/]*\.m?js$/.test(url.pathname)),
            handler: 'CacheFirst',
            options: { cacheName: 'mf-pdfjs-v1', expiration: { maxEntries: 400 } },
          },
        ],
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
}));
