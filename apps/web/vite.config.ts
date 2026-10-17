import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'logo-stp.png',
        'logo-multiframe.png',
        'og-share.jpg',
        'apple-touch-icon.png',
        'pwa-192.png',
        'pwa-512.png',
        'pwa-maskable-512.png',
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
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`.replace(/\/+/g, '/'),
        // Don't hijack the partner calculator SPA under /calculator/
        navigateFallbackDenylist: [/^\/.*calculator(?:\/|$)/i],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2,mp3}'],
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
