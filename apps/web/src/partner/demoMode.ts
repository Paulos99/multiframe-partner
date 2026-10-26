export function isDemoModeEnabled(): boolean {
  try {
    if (import.meta.env.VITE_DEMO_MODE === 'true') return true;
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('demo') === '1') return true;
      if (localStorage.getItem('mf_demo_mode') === '1') return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
