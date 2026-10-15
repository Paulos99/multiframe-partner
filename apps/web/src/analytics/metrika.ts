import { getConsent } from './consent';

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: YmFn;
  }
}

function counterId(): number | null {
  const raw = import.meta.env.VITE_YM_ID as string | undefined;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

let loaded = false;

/** Load Yandex Metrika tag after cookie consent. No-op without VITE_YM_ID. */
export function initMetrika(): void {
  if (loaded) return;
  if (getConsent() !== 'accepted') return;
  const id = counterId();
  if (id == null || typeof document === 'undefined') return;

  loaded = true;

  if (!window.ym) {
    const ym: YmFn = (...args: unknown[]) => {
      (ym.a = ym.a || []).push(args);
    };
    ym.l = Date.now();
    window.ym = ym;
  }

  if (!document.querySelector('script[data-pm-ym]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.dataset.pmYm = '1';
    document.head.appendChild(script);
  }

  window.ym(id, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
  });
}

export function metrikaReachGoal(
  goal: string,
  params?: Record<string, string | number | boolean | undefined>,
): void {
  if (getConsent() !== 'accepted') return;
  const id = counterId();
  if (id == null || !window.ym) return;
  const clean: Record<string, string | number | boolean> = {};
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) clean[k] = v;
    }
  }
  window.ym(id, 'reachGoal', goal, clean);
}

export function hasMetrikaConfigured(): boolean {
  return counterId() != null;
}
