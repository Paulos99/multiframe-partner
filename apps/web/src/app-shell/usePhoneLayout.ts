import { useSyncExternalStore } from 'react';

/** Та же граница, что в CSS: ≤640 px — телефон с нижней панелью разделов. */
export const PHONE_QUERY = '(max-width: 640px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function snapshot(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches;
}

/** true на телефоне; читается синхронно уже при первом рендере, без мигания шапки. */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
