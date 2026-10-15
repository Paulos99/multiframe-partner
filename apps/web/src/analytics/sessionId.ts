const STORAGE_KEY = 'pm-session-id';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Anonymous id for one funnel pass (sessionStorage). Restart → new id. */
export function getAnalyticsSessionId(): string {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = uuid();
    sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return uuid();
  }
}

export function resetAnalyticsSessionId(): string {
  const id = uuid();
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
    sessionStorage.removeItem('pm-result-ingested');
  } catch {
    /* ignore */
  }
  return id;
}
