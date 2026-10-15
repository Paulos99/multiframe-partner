import type { AnalyticsPayload } from './payload';

const INGESTED_KEY = 'pm-result-ingested';

function ingestUrl(): string | null {
  const url = (import.meta.env.VITE_ANALYTICS_INGEST_URL as string | undefined)?.trim();
  return url || null;
}

export function hasIngestConfigured(): boolean {
  return ingestUrl() != null;
}

function alreadyIngested(sessionId: string): boolean {
  try {
    return sessionStorage.getItem(INGESTED_KEY) === sessionId;
  } catch {
    return false;
  }
}

function markIngested(sessionId: string): void {
  try {
    sessionStorage.setItem(INGESTED_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

/** POST anonymous Result payload once per analytics session. */
export async function ingestAnalyticsPayload(payload: AnalyticsPayload): Promise<void> {
  if (alreadyIngested(payload.sessionId)) return;

  const url = ingestUrl();
  if (!url) {
    if (import.meta.env.DEV) {
      console.info('[analytics-ingest:dev]', payload);
    }
    markIngested(payload.sessionId);
    return;
  }

  try {
    const body = JSON.stringify(payload);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      keepalive: true,
      mode: 'cors',
    });
    if (!res.ok) throw new Error(`ingest HTTP ${res.status}`);
    markIngested(payload.sessionId);
  } catch (err) {
    console.warn('[analytics-ingest]', err);
  }
}
