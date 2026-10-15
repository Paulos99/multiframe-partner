import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { captureChannelFromUrl, getConsent, initMetrika } from './analytics';
import './styles/global.css';

registerSW({ immediate: true });

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
    <App />
  </StrictMode>,
);
