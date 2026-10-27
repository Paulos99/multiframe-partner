import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { MotionProvider } from './partner/motionBits';
import { FilePreviewHost } from './ui/filePreview/FilePreview';
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
  registerSW({ immediate: true });
}

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
