import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { MotionProvider } from './partner/motionBits';
import { FilePreviewHost } from './ui/filePreview/FilePreview';
import { bustedUrl, checkBuildVersion, cleanBustParam, reloadOnceAfterWorkerUpdate } from './pwa/autoUpdate';
import { captureChannelFromUrl, getConsent, initMetrika } from './analytics';
import './styles/global.css';

/** Dev и демо не регистрируют worker: старый precache переживает жёсткую перезагрузку. */
function dropInstalledServiceWorker(): boolean {
  if (import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true') return true;
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('demo') === '1') return true;
    if (localStorage.getItem('mf_demo_mode') === '1') return true;
    const session = JSON.parse(localStorage.getItem('mf_partner_session_v2') || 'null') as { orgId?: string } | null;
    if (session?.orgId === 'org_demo' || session?.orgId === 'org_demo_spb') return true;
  } catch {
    /* ignore */
  }
  return false;
}

if (dropInstalledServiceWorker()) {
  void navigator.serviceWorker?.getRegistrations?.().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
  void caches?.keys?.().then((keys) => {
    for (const key of keys) void caches.delete(key);
  });
} else {
  registerSW({
    immediate: true,
    // Новый worker взял управление (skipWaiting + clientsClaim) — страница перезагружается сама, не чаще раза в минуту.
    onNeedReload: () =>
      void reloadOnceAfterWorkerUpdate({ store: sessionStorage, now: () => Date.now(), reload: () => window.location.reload() }),
    // Копия страницы для офлайна: следующий запуск без сети откроет её (сеть всегда первая).
    onRegisteredSW: (_url, registration) => void warmPageCache(registration),
  });
}

/** Положить текущую страницу в кэш «сеть сначала», чтобы первый запуск без сети тоже открылся. */
async function warmPageCache(registration: ServiceWorkerRegistration | undefined) {
  try {
    if (!registration || !('caches' in window)) return;
    await navigator.serviceWorker.ready;
    const res = await fetch(import.meta.env.BASE_URL, { cache: 'reload' });
    if (!res.ok) return;
    const cache = await caches.open('mf-pages-v1');
    await cache.put(registration.scope, res);
  } catch {
    /* офлайн-копия страницы появится при следующей загрузке */
  }
}

/** Страница старее выкладки (кэш браузера или GitHub Pages до 10 минут) — обновляемся без вопросов. */
function runBuildCheck() {
  const cleaned = cleanBustParam(window.location.href);
  void checkBuildVersion({
    currentId: __BUILD_ID__,
    fetchLatest: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('no version');
      return res.json();
    },
    store: sessionStorage,
    reload: () => window.location.reload(),
    bust: (id) => window.location.replace(bustedUrl(window.location.href, id)),
  }).then((result) => {
    if (result === 'same' && cleaned) history.replaceState(null, '', cleaned);
  });
}
runBuildCheck();
window.addEventListener('pageshow', (event) => {
  if (event.persisted) runBuildCheck();
});

const redirect = sessionStorage.getItem('mf-spa-redirect');
if (redirect) {
  sessionStorage.removeItem('mf-spa-redirect');
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (redirect.startsWith(base) && redirect !== `${base}/` && redirect !== base) {
    history.replaceState(null, '', redirect);
  }
}

captureChannelFromUrl();
if (getConsent() === 'accepted') initMetrika();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionProvider>
      <App />
      <FilePreviewHost />
    </MotionProvider>
  </StrictMode>,
);
