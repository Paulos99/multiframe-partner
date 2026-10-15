const STORAGE_KEY = 'pm-analytics-consent';

export type ConsentState = 'unknown' | 'accepted' | 'declined';

export function getConsent(): ConsentState {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'accepted' || v === 'declined') return v;
  } catch {
    /* ignore */
  }
  return 'unknown';
}

export function setConsent(state: 'accepted' | 'declined'): void {
  try {
    localStorage.setItem(STORAGE_KEY, state);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('pm-consent', { detail: state }));
}

export function onConsentChange(cb: (state: ConsentState) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<ConsentState>).detail;
    cb(detail);
  };
  window.addEventListener('pm-consent', handler);
  return () => window.removeEventListener('pm-consent', handler);
}
